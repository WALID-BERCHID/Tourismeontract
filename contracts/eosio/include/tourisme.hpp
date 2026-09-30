#pragma once

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/singleton.hpp>
#include <eosio/system.hpp>

#include <string>
#include <vector>

using namespace eosio;
using std::string;

/**
 * Tourisme booking escrow for EOSIO / Antelope chains (EOS, WAX, Telos, Jungle testnet...).
 *
 * Booking flow (standard Antelope payment pattern):
 *   guest -> eosio.token::transfer(guest, <contract>, "<total> EOS", "book:<listing_id>:<check_in>:<check_out>")
 * The contract validates the amount against the listing price and records the booking. Dates are
 * UTC day numbers (unix seconds / 86400); a stay occupies nights [check_in, check_out).
 *
 * Payouts use inline eosio.token transfers, so the contract account needs the eosio.code
 * permission on its active authority.
 */
class [[eosio::contract("tourisme")]] tourisme : public contract {
 public:
  using contract::contract;

  static constexpr uint32_t DAY = 86400;
  static constexpr uint32_t CHECKIN_SECONDS = 15 * 3600;
  static constexpr uint32_t RELEASE_DELAY = DAY;
  static constexpr uint64_t BPS = 10000;
  static constexpr uint16_t MAX_FEE_BPS = 2000;

  enum policy_t : uint8_t { FLEXIBLE = 0, MODERATE = 1, STRICT = 2 };
  enum status_t : uint8_t {
    BOOKED = 1,
    CANCELLED_BY_GUEST = 2,
    CANCELLED_BY_HOST = 3,
    COMPLETED = 4,
    DISPUTED = 5,
    RESOLVED = 6
  };

  // ---- admin ----
  [[eosio::action]] void init(name arbiter, name treasury, name token_contract, symbol sym, uint16_t guest_fee_bps,
                              uint16_t host_fee_bps);
  [[eosio::action]] void setconfig(name arbiter, name treasury, uint16_t guest_fee_bps, uint16_t host_fee_bps,
                                   bool paused);

  // ---- host ----
  [[eosio::action]] void createlist(name host, uint8_t policy, uint16_t min_nights, uint16_t max_nights,
                                    asset nightly, asset cleaning_fee, string metadata_uri);
  [[eosio::action]] void updatelist(name host, uint64_t listing_id, uint8_t policy, bool active, uint16_t min_nights,
                                    uint16_t max_nights, asset nightly, asset cleaning_fee, string metadata_uri);
  [[eosio::action]] void blockdays(name host, uint64_t listing_id, std::vector<uint32_t> days, bool blocked);
  [[eosio::action]] void cancelhost(name host, uint64_t booking_id);
  [[eosio::action]] void reviewguest(name host, uint64_t booking_id, uint8_t rating, string comment);

  // ---- guest ----
  [[eosio::action]] void cancelguest(name guest, uint64_t booking_id);
  [[eosio::action]] void dispute(name guest, uint64_t booking_id, string reason);
  [[eosio::action]] void reviewlist(name guest, uint64_t booking_id, uint8_t rating, string comment);

  // ---- anyone / arbiter ----
  [[eosio::action]] void release(name caller, uint64_t booking_id);
  [[eosio::action]] void resolve(name arbiter, uint64_t booking_id, uint64_t refund_bps);

  // ---- payments ----
  [[eosio::on_notify("*::transfer")]] void on_transfer(name from, name to, asset quantity, string memo);

 private:
  struct [[eosio::table]] config {
    name arbiter;
    name treasury;
    name token_contract;
    symbol sym;
    uint16_t guest_fee_bps;
    uint16_t host_fee_bps;
    uint64_t next_listing_id = 1;
    uint64_t next_booking_id = 1;
    bool paused = false;
  };
  using config_singleton = singleton<"config"_n, config>;

  struct [[eosio::table]] listing {
    uint64_t id;
    name host;
    uint8_t policy;
    bool active;
    uint16_t min_nights;
    uint16_t max_nights;
    asset nightly;
    asset cleaning_fee;
    uint32_t rating_count = 0;
    uint64_t rating_sum = 0;
    string metadata_uri;

    uint64_t primary_key() const { return id; }
    uint64_t by_host() const { return host.value; }
  };
  using listings_table =
      multi_index<"listings"_n, listing, indexed_by<"byhost"_n, const_mem_fun<listing, uint64_t, &listing::by_host>>>;

  // Scoped by listing id: one row per occupied night.
  struct [[eosio::table]] night {
    uint64_t day;
    uint64_t booking_id;  // 0 = blocked by host
    uint64_t primary_key() const { return day; }
  };
  using nights_table = multi_index<"nights"_n, night>;

  struct [[eosio::table]] booking {
    uint64_t id;
    uint64_t listing_id;
    name guest;
    uint32_t check_in;
    uint32_t check_out;
    time_point_sec created_at;
    uint8_t status;
    asset subtotal;
    asset guest_fee;
    asset host_fee;
    bool guest_reviewed = false;
    bool host_reviewed = false;

    uint64_t primary_key() const { return id; }
    uint64_t by_guest() const { return guest.value; }
    uint64_t by_listing() const { return listing_id; }
  };
  using bookings_table =
      multi_index<"bookings"_n, booking,
                  indexed_by<"byguest"_n, const_mem_fun<booking, uint64_t, &booking::by_guest>>,
                  indexed_by<"bylisting"_n, const_mem_fun<booking, uint64_t, &booking::by_listing>>>;

  config get_config() const;
  static uint32_t today();
  static uint64_t checkin_time(uint32_t day);
  static uint64_t refund_bps_for(uint8_t policy, time_point_sec created_at, uint32_t check_in);
  void validate_listing(const config& cfg, uint8_t policy, uint16_t min_nights, uint16_t max_nights,
                        const asset& nightly, const asset& cleaning_fee, const string& uri) const;
  void handle_booking(name guest, const asset& quantity, const string& memo);
  void free_nights(uint64_t listing_id, uint32_t check_in, uint32_t check_out);
  void settle(const booking& b, uint64_t refund_bps);
  void pay(name to, const asset& quantity, const string& memo);
};
