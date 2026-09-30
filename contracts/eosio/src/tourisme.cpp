#include <tourisme.hpp>

#include <cstdlib>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

tourisme::config tourisme::get_config() const {
  config_singleton cfg(get_self(), get_self().value);
  check(cfg.exists(), "contract not initialised");
  return cfg.get();
}

uint32_t tourisme::today() { return current_time_point().sec_since_epoch() / DAY; }

uint64_t tourisme::checkin_time(uint32_t day) { return uint64_t(day) * DAY + CHECKIN_SECONDS; }

uint64_t tourisme::refund_bps_for(uint8_t policy, time_point_sec created_at, uint32_t check_in) {
  const uint64_t now = current_time_point().sec_since_epoch();
  const uint64_t start = checkin_time(check_in);
  if (now >= start) return 0;
  const uint64_t left = start - now;
  switch (policy) {
    case FLEXIBLE:
      return left >= DAY ? BPS : 0;
    case MODERATE:
      return left >= 5 * DAY ? BPS : BPS / 2;
    default:
      if (now <= uint64_t(created_at.sec_since_epoch()) + 2 * DAY && left >= 14 * DAY) return BPS;
      return left >= 7 * DAY ? BPS / 2 : 0;
  }
}

void tourisme::validate_listing(const config& cfg, uint8_t policy, uint16_t min_nights, uint16_t max_nights,
                                const asset& nightly, const asset& cleaning_fee, const string& uri) const {
  check(policy <= STRICT, "invalid cancellation policy");
  check(min_nights > 0 && max_nights >= min_nights && max_nights <= 365, "invalid min/max nights");
  check(nightly.symbol == cfg.sym && cleaning_fee.symbol == cfg.sym, "wrong currency symbol");
  check(nightly.amount > 0 && cleaning_fee.amount >= 0, "invalid price");
  check(uri.size() <= 256, "metadata uri too long");
}

void tourisme::pay(name to, const asset& quantity, const string& memo) {
  if (quantity.amount <= 0) return;
  const auto cfg = get_config();
  action(permission_level{get_self(), "active"_n}, cfg.token_contract, "transfer"_n,
         std::make_tuple(get_self(), to, quantity, memo))
      .send();
}

void tourisme::free_nights(uint64_t listing_id, uint32_t check_in, uint32_t check_out) {
  nights_table nights(get_self(), listing_id);
  for (uint32_t d = check_in; d < check_out; ++d) {
    auto it = nights.find(d);
    if (it != nights.end()) nights.erase(it);
  }
}

void tourisme::settle(const booking& b, uint64_t refund_bps) {
  const auto cfg = get_config();
  listings_table listings(get_self(), get_self().value);
  const auto& l = listings.get(b.listing_id, "listing not found");

  const int64_t subtotal = b.subtotal.amount;
  const int64_t guest_fee = b.guest_fee.amount;
  const int64_t kept_subtotal = subtotal - int64_t((__int128(subtotal) * refund_bps) / BPS);
  const int64_t host_fee_kept = subtotal == 0 ? 0 : int64_t((__int128(b.host_fee.amount) * kept_subtotal) / subtotal);
  const int64_t refund = int64_t((__int128(subtotal) * refund_bps) / BPS) + int64_t((__int128(guest_fee) * refund_bps) / BPS);
  const int64_t host_payout = kept_subtotal - host_fee_kept;
  const int64_t platform = subtotal + guest_fee - refund - host_payout;

  const string ref = "Tourisme booking #" + std::to_string(b.id);
  pay(b.guest, asset(refund, cfg.sym), ref + " refund");
  pay(l.host, asset(host_payout, cfg.sym), ref + " payout");
  pay(cfg.treasury, asset(platform, cfg.sym), ref + " fees");
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

void tourisme::init(name arbiter, name treasury, name token_contract, symbol sym, uint16_t guest_fee_bps,
                    uint16_t host_fee_bps) {
  require_auth(get_self());
  config_singleton cfg(get_self(), get_self().value);
  check(!cfg.exists(), "already initialised");
  check(is_account(arbiter) && is_account(treasury) && is_account(token_contract), "unknown account");
  check(guest_fee_bps <= MAX_FEE_BPS && host_fee_bps <= MAX_FEE_BPS, "fee too high");
  cfg.set(config{arbiter, treasury, token_contract, sym, guest_fee_bps, host_fee_bps, 1, 1, false}, get_self());
}

void tourisme::setconfig(name arbiter, name treasury, uint16_t guest_fee_bps, uint16_t host_fee_bps, bool paused) {
  require_auth(get_self());
  check(guest_fee_bps <= MAX_FEE_BPS && host_fee_bps <= MAX_FEE_BPS, "fee too high");
  check(is_account(arbiter) && is_account(treasury), "unknown account");
  config_singleton cfg_table(get_self(), get_self().value);
  auto cfg = get_config();
  cfg.arbiter = arbiter;
  cfg.treasury = treasury;
  cfg.guest_fee_bps = guest_fee_bps;
  cfg.host_fee_bps = host_fee_bps;
  cfg.paused = paused;
  cfg_table.set(cfg, get_self());
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

void tourisme::createlist(name host, uint8_t policy, uint16_t min_nights, uint16_t max_nights, asset nightly,
                          asset cleaning_fee, string metadata_uri) {
  require_auth(host);
  config_singleton cfg_table(get_self(), get_self().value);
  auto cfg = get_config();
  check(!cfg.paused, "marketplace paused");
  validate_listing(cfg, policy, min_nights, max_nights, nightly, cleaning_fee, metadata_uri);

  listings_table listings(get_self(), get_self().value);
  listings.emplace(host, [&](auto& l) {
    l.id = cfg.next_listing_id;
    l.host = host;
    l.policy = policy;
    l.active = true;
    l.min_nights = min_nights;
    l.max_nights = max_nights;
    l.nightly = nightly;
    l.cleaning_fee = cleaning_fee;
    l.metadata_uri = metadata_uri;
  });
  cfg.next_listing_id++;
  cfg_table.set(cfg, get_self());
}

void tourisme::updatelist(name host, uint64_t listing_id, uint8_t policy, bool active, uint16_t min_nights,
                          uint16_t max_nights, asset nightly, asset cleaning_fee, string metadata_uri) {
  require_auth(host);
  const auto cfg = get_config();
  listings_table listings(get_self(), get_self().value);
  const auto& l = listings.get(listing_id, "listing not found");
  check(l.host == host, "only the host can update this listing");
  validate_listing(cfg, policy, min_nights, max_nights, nightly, cleaning_fee, metadata_uri);
  listings.modify(l, same_payer, [&](auto& row) {
    row.policy = policy;
    row.active = active;
    row.min_nights = min_nights;
    row.max_nights = max_nights;
    row.nightly = nightly;
    row.cleaning_fee = cleaning_fee;
    row.metadata_uri = metadata_uri;
  });
}

void tourisme::blockdays(name host, uint64_t listing_id, std::vector<uint32_t> days, bool blocked) {
  require_auth(host);
  listings_table listings(get_self(), get_self().value);
  const auto& l = listings.get(listing_id, "listing not found");
  check(l.host == host, "only the host can edit the calendar");
  nights_table nights(get_self(), listing_id);
  for (const auto d : days) {
    auto it = nights.find(d);
    if (blocked) {
      check(it == nights.end() || it->booking_id == 0, "night already booked");
      if (it == nights.end()) nights.emplace(host, [&](auto& n) { n.day = d; n.booking_id = 0; });
    } else if (it != nights.end() && it->booking_id == 0) {
      nights.erase(it);
    }
  }
}

void tourisme::cancelhost(name host, uint64_t booking_id) {
  require_auth(host);
  bookings_table bookings(get_self(), get_self().value);
  const auto& b = bookings.get(booking_id, "booking not found");
  listings_table listings(get_self(), get_self().value);
  check(listings.get(b.listing_id).host == host, "only the host can cancel");
  check(b.status == BOOKED, "invalid booking status");
  check(current_time_point().sec_since_epoch() < checkin_time(b.check_in), "too late to cancel");
  free_nights(b.listing_id, b.check_in, b.check_out);
  bookings.modify(b, same_payer, [&](auto& row) { row.status = CANCELLED_BY_HOST; });
  settle(b, BPS);
}

void tourisme::reviewguest(name host, uint64_t booking_id, uint8_t rating, string comment) {
  require_auth(host);
  bookings_table bookings(get_self(), get_self().value);
  const auto& b = bookings.get(booking_id, "booking not found");
  listings_table listings(get_self(), get_self().value);
  check(listings.get(b.listing_id).host == host, "only the host can review the guest");
  check(rating >= 1 && rating <= 5, "rating must be 1-5");
  check(comment.size() <= 1000, "comment too long");
  check(b.status == COMPLETED || b.status == RESOLVED, "stay not completed");
  check(!b.host_reviewed, "already reviewed");
  bookings.modify(b, same_payer, [&](auto& row) { row.host_reviewed = true; });
}

// ---------------------------------------------------------------------------
// Guest
// ---------------------------------------------------------------------------

void tourisme::on_transfer(name from, name to, asset quantity, string memo) {
  if (to != get_self() || from == get_self()) return;
  // Ignore payments that are not bookings (e.g. tips / top-ups) only if memo doesn't start with "book:".
  if (memo.rfind("book:", 0) != 0) return;
  const auto cfg = get_config();
  check(get_first_receiver() == cfg.token_contract, "wrong token contract");
  check(quantity.symbol == cfg.sym, "wrong currency");
  handle_booking(from, quantity, memo);
}

void tourisme::handle_booking(name guest, const asset& quantity, const string& memo) {
  // memo = book:<listing_id>:<check_in>:<check_out>
  const size_t p1 = memo.find(':', 5);
  const size_t p2 = p1 == string::npos ? string::npos : memo.find(':', p1 + 1);
  check(p1 != string::npos && p2 != string::npos, "memo must be book:<listing>:<check_in>:<check_out>");
  const uint64_t listing_id = std::strtoull(memo.substr(5, p1 - 5).c_str(), nullptr, 10);
  const uint32_t check_in = uint32_t(std::strtoul(memo.substr(p1 + 1, p2 - p1 - 1).c_str(), nullptr, 10));
  const uint32_t check_out = uint32_t(std::strtoul(memo.substr(p2 + 1).c_str(), nullptr, 10));

  config_singleton cfg_table(get_self(), get_self().value);
  auto cfg = get_config();
  check(!cfg.paused, "marketplace paused");

  listings_table listings(get_self(), get_self().value);
  const auto& l = listings.get(listing_id, "listing not found");
  check(l.active, "listing inactive");
  check(l.host != guest, "hosts cannot book their own listing");
  check(check_out > check_in && check_in >= today(), "invalid dates");
  check(current_time_point().sec_since_epoch() < checkin_time(check_in), "too late to book");
  const uint32_t nights = check_out - check_in;
  check(nights >= l.min_nights && nights <= l.max_nights, "stay length not allowed");

  const int64_t subtotal = l.nightly.amount * nights + l.cleaning_fee.amount;
  const int64_t guest_fee = int64_t((__int128(subtotal) * cfg.guest_fee_bps) / BPS);
  const int64_t host_fee = int64_t((__int128(subtotal) * cfg.host_fee_bps) / BPS);
  check(quantity.amount == subtotal + guest_fee, "wrong amount, expected " + asset(subtotal + guest_fee, cfg.sym).to_string());

  const uint64_t booking_id = cfg.next_booking_id;
  nights_table nights_tbl(get_self(), listing_id);
  for (uint32_t d = check_in; d < check_out; ++d) {
    check(nights_tbl.find(d) == nights_tbl.end(), "night " + std::to_string(d) + " unavailable");
    nights_tbl.emplace(get_self(), [&](auto& n) { n.day = d; n.booking_id = booking_id; });
  }

  bookings_table bookings(get_self(), get_self().value);
  bookings.emplace(get_self(), [&](auto& b) {
    b.id = booking_id;
    b.listing_id = listing_id;
    b.guest = guest;
    b.check_in = check_in;
    b.check_out = check_out;
    b.created_at = time_point_sec(current_time_point());
    b.status = BOOKED;
    b.subtotal = asset(subtotal, cfg.sym);
    b.guest_fee = asset(guest_fee, cfg.sym);
    b.host_fee = asset(host_fee, cfg.sym);
  });
  cfg.next_booking_id++;
  cfg_table.set(cfg, get_self());
}

void tourisme::cancelguest(name guest, uint64_t booking_id) {
  require_auth(guest);
  bookings_table bookings(get_self(), get_self().value);
  const auto& b = bookings.get(booking_id, "booking not found");
  check(b.guest == guest, "only the guest can cancel");
  check(b.status == BOOKED, "invalid booking status");
  check(current_time_point().sec_since_epoch() < checkin_time(b.check_in), "too late to cancel");
  listings_table listings(get_self(), get_self().value);
  const uint64_t refund_bps = refund_bps_for(listings.get(b.listing_id).policy, b.created_at, b.check_in);
  free_nights(b.listing_id, b.check_in, b.check_out);
  bookings.modify(b, same_payer, [&](auto& row) { row.status = CANCELLED_BY_GUEST; });
  settle(b, refund_bps);
}

void tourisme::dispute(name guest, uint64_t booking_id, string reason) {
  require_auth(guest);
  check(reason.size() <= 1000, "reason too long");
  bookings_table bookings(get_self(), get_self().value);
  const auto& b = bookings.get(booking_id, "booking not found");
  check(b.guest == guest, "only the guest can open a dispute");
  check(b.status == BOOKED, "invalid booking status");
  check(current_time_point().sec_since_epoch() < checkin_time(b.check_in) + RELEASE_DELAY, "dispute window closed");
  bookings.modify(b, same_payer, [&](auto& row) { row.status = DISPUTED; });
}

void tourisme::reviewlist(name guest, uint64_t booking_id, uint8_t rating, string comment) {
  require_auth(guest);
  check(rating >= 1 && rating <= 5, "rating must be 1-5");
  check(comment.size() <= 1000, "comment too long");
  bookings_table bookings(get_self(), get_self().value);
  const auto& b = bookings.get(booking_id, "booking not found");
  check(b.guest == guest, "only the guest can review");
  check(b.status == COMPLETED || b.status == RESOLVED, "stay not completed");
  check(!b.guest_reviewed, "already reviewed");
  bookings.modify(b, same_payer, [&](auto& row) { row.guest_reviewed = true; });
  listings_table listings(get_self(), get_self().value);
  const auto& l = listings.get(b.listing_id);
  listings.modify(l, same_payer, [&](auto& row) {
    row.rating_count += 1;
    row.rating_sum += rating;
  });
}

// ---------------------------------------------------------------------------
// Release & disputes
// ---------------------------------------------------------------------------

void tourisme::release(name caller, uint64_t booking_id) {
  require_auth(caller);
  bookings_table bookings(get_self(), get_self().value);
  const auto& b = bookings.get(booking_id, "booking not found");
  check(b.status == BOOKED, "invalid booking status");
  check(caller == b.guest || current_time_point().sec_since_epoch() >= checkin_time(b.check_in) + RELEASE_DELAY,
        "too early to release");
  bookings.modify(b, same_payer, [&](auto& row) { row.status = COMPLETED; });
  settle(b, 0);
}

void tourisme::resolve(name arbiter, uint64_t booking_id, uint64_t refund_bps) {
  require_auth(arbiter);
  check(arbiter == get_config().arbiter, "only the arbiter can resolve");
  check(refund_bps <= BPS, "invalid refund");
  bookings_table bookings(get_self(), get_self().value);
  const auto& b = bookings.get(booking_id, "booking not found");
  check(b.status == DISPUTED, "booking not disputed");
  bookings.modify(b, same_payer, [&](auto& row) { row.status = RESOLVED; });
  settle(b, refund_bps);
}
