//! Tourisme booking escrow for Solana.
//!
//! Mirrors the EVM `TourismeEscrow` contract: hosts publish listings priced in lamports,
//! guests pay into a per-booking PDA that holds the escrow, and funds are released to the host
//! 24h after check-in, refunded following the cancellation policy, or split by an arbiter.
//!
//! Dates are UTC day numbers (unix_timestamp / 86400). A stay occupies nights [check_in, check_out).
//! Each listing keeps a 1024-day availability bitmap starting at `base_day`.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("2Nd2n5ZHj51hS7QbrfWnsbMx329m3WYKMtLxkQ4bE3rb");

pub const DAY: i64 = 86_400;
pub const CHECKIN_SECONDS: i64 = 15 * 3_600; // 15:00 UTC
pub const RELEASE_DELAY: i64 = DAY;
pub const BPS: u64 = 10_000;
pub const MAX_FEE_BPS: u16 = 2_000;
pub const CALENDAR_DAYS: u32 = 1_024;
pub const CALENDAR_BYTES: usize = (CALENDAR_DAYS / 8) as usize;
pub const MAX_URI_LEN: usize = 200;
pub const MAX_COMMENT_LEN: usize = 500;

pub mod policy {
    pub const FLEXIBLE: u8 = 0;
    pub const MODERATE: u8 = 1;
    pub const STRICT: u8 = 2;
}

pub mod status {
    pub const BOOKED: u8 = 1;
    pub const CANCELLED_BY_GUEST: u8 = 2;
    pub const CANCELLED_BY_HOST: u8 = 3;
    pub const COMPLETED: u8 = 4;
    pub const DISPUTED: u8 = 5;
    pub const RESOLVED: u8 = 6;
}

#[program]
pub mod tourisme_escrow {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        arbiter: Pubkey,
        treasury: Pubkey,
        guest_fee_bps: u16,
        host_fee_bps: u16,
    ) -> Result<()> {
        require!(guest_fee_bps <= MAX_FEE_BPS && host_fee_bps <= MAX_FEE_BPS, EscrowError::InvalidFee);
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.arbiter = arbiter;
        config.treasury = treasury;
        config.guest_fee_bps = guest_fee_bps;
        config.host_fee_bps = host_fee_bps;
        config.listing_count = 0;
        config.booking_count = 0;
        config.paused = false;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        arbiter: Pubkey,
        treasury: Pubkey,
        guest_fee_bps: u16,
        host_fee_bps: u16,
        paused: bool,
    ) -> Result<()> {
        require!(guest_fee_bps <= MAX_FEE_BPS && host_fee_bps <= MAX_FEE_BPS, EscrowError::InvalidFee);
        let config = &mut ctx.accounts.config;
        config.arbiter = arbiter;
        config.treasury = treasury;
        config.guest_fee_bps = guest_fee_bps;
        config.host_fee_bps = host_fee_bps;
        config.paused = paused;
        Ok(())
    }

    pub fn create_listing(
        ctx: Context<CreateListing>,
        policy: u8,
        min_nights: u16,
        max_nights: u16,
        nightly_lamports: u64,
        cleaning_fee_lamports: u64,
        metadata_uri: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.paused, EscrowError::Paused);
        validate_listing(policy, min_nights, max_nights, nightly_lamports, &metadata_uri)?;

        let listing = &mut ctx.accounts.listing;
        listing.id = config.listing_count + 1;
        listing.host = ctx.accounts.host.key();
        listing.policy = policy;
        listing.active = true;
        listing.min_nights = min_nights;
        listing.max_nights = max_nights;
        listing.nightly_lamports = nightly_lamports;
        listing.cleaning_fee_lamports = cleaning_fee_lamports;
        listing.rating_count = 0;
        listing.rating_sum = 0;
        listing.base_day = today()?;
        listing.booked = [0u8; CALENDAR_BYTES];
        listing.blocked = [0u8; CALENDAR_BYTES];
        listing.metadata_uri = metadata_uri;
        listing.bump = ctx.bumps.listing;
        config.listing_count = listing.id;

        emit!(ListingCreated { listing_id: listing.id, host: listing.host });
        Ok(())
    }

    pub fn update_listing(
        ctx: Context<HostListing>,
        policy: u8,
        active: bool,
        min_nights: u16,
        max_nights: u16,
        nightly_lamports: u64,
        cleaning_fee_lamports: u64,
        metadata_uri: String,
    ) -> Result<()> {
        validate_listing(policy, min_nights, max_nights, nightly_lamports, &metadata_uri)?;
        let listing = &mut ctx.accounts.listing;
        listing.policy = policy;
        listing.active = active;
        listing.min_nights = min_nights;
        listing.max_nights = max_nights;
        listing.nightly_lamports = nightly_lamports;
        listing.cleaning_fee_lamports = cleaning_fee_lamports;
        listing.metadata_uri = metadata_uri;
        Ok(())
    }

    /// Block or unblock nights (bookings taken elsewhere, maintenance...).
    pub fn set_blocked_days(ctx: Context<HostListing>, days: Vec<u32>, blocked: bool) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        for day in days {
            let (byte, bit) = listing.slot(day)?;
            if blocked {
                require!(listing.booked[byte] & bit == 0, EscrowError::DatesUnavailable);
                listing.blocked[byte] |= bit;
            } else {
                listing.blocked[byte] &= !bit;
            }
        }
        Ok(())
    }

    pub fn book(ctx: Context<Book>, check_in: u32, check_out: u32) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.paused, EscrowError::Paused);
        let listing = &mut ctx.accounts.listing;
        require!(listing.active, EscrowError::ListingInactive);
        require_keys_neq!(listing.host, ctx.accounts.guest.key(), EscrowError::SelfBooking);

        let now = Clock::get()?.unix_timestamp;
        require!(check_out > check_in && check_in >= today()?, EscrowError::InvalidDates);
        require!(now < checkin_time(check_in), EscrowError::TooLate);
        let nights = (check_out - check_in) as u64;
        require!(
            nights >= listing.min_nights as u64 && nights <= listing.max_nights as u64,
            EscrowError::InvalidDates
        );

        for day in check_in..check_out {
            let (byte, bit) = listing.slot(day)?;
            require!(
                (listing.booked[byte] | listing.blocked[byte]) & bit == 0,
                EscrowError::DatesUnavailable
            );
            listing.booked[byte] |= bit;
        }

        let subtotal = listing
            .nightly_lamports
            .checked_mul(nights)
            .and_then(|v| v.checked_add(listing.cleaning_fee_lamports))
            .ok_or(EscrowError::Overflow)?;
        let guest_fee = subtotal * config.guest_fee_bps as u64 / BPS;
        let host_fee = subtotal * config.host_fee_bps as u64 / BPS;
        let total = subtotal + guest_fee;

        config.booking_count += 1;
        let booking = &mut ctx.accounts.booking;
        booking.id = config.booking_count;
        booking.listing = listing.key();
        booking.guest = ctx.accounts.guest.key();
        booking.check_in = check_in;
        booking.check_out = check_out;
        booking.created_at = now;
        booking.status = status::BOOKED;
        booking.subtotal = subtotal;
        booking.guest_fee = guest_fee;
        booking.host_fee = host_fee;
        booking.guest_reviewed = false;
        booking.host_reviewed = false;
        booking.bump = ctx.bumps.booking;

        // Escrow the payment in the booking PDA itself (on top of its rent-exempt reserve).
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.guest.to_account_info(),
                    to: ctx.accounts.booking.to_account_info(),
                },
            ),
            total,
        )?;

        emit!(Booked {
            booking_id: config.booking_count,
            listing_id: listing.id,
            guest: ctx.accounts.guest.key(),
            check_in,
            check_out,
            total,
        });
        Ok(())
    }

    pub fn cancel_by_guest(ctx: Context<Settle>) -> Result<()> {
        let booking = &ctx.accounts.booking;
        require_keys_eq!(booking.guest, ctx.accounts.signer.key(), EscrowError::NotGuest);
        require!(booking.status == status::BOOKED, EscrowError::InvalidStatus);
        let now = Clock::get()?.unix_timestamp;
        require!(now < checkin_time(booking.check_in), EscrowError::TooLate);

        let refund_bps = guest_refund_bps(ctx.accounts.listing.policy, booking.created_at, booking.check_in, now);
        free_days(&mut ctx.accounts.listing, booking.check_in, booking.check_out)?;
        ctx.accounts.booking.status = status::CANCELLED_BY_GUEST;
        settle(&ctx, refund_bps)
    }

    pub fn cancel_by_host(ctx: Context<Settle>) -> Result<()> {
        require_keys_eq!(ctx.accounts.listing.host, ctx.accounts.signer.key(), EscrowError::NotHost);
        let booking = &ctx.accounts.booking;
        require!(booking.status == status::BOOKED, EscrowError::InvalidStatus);
        let now = Clock::get()?.unix_timestamp;
        require!(now < checkin_time(booking.check_in), EscrowError::TooLate);

        free_days(&mut ctx.accounts.listing, booking.check_in, booking.check_out)?;
        ctx.accounts.booking.status = status::CANCELLED_BY_HOST;
        settle(&ctx, BPS)
    }

    /// Anyone can release 24h after check-in; the guest can release early.
    pub fn release(ctx: Context<Settle>) -> Result<()> {
        let booking = &ctx.accounts.booking;
        require!(booking.status == status::BOOKED, EscrowError::InvalidStatus);
        let now = Clock::get()?.unix_timestamp;
        require!(
            ctx.accounts.signer.key() == booking.guest || now >= checkin_time(booking.check_in) + RELEASE_DELAY,
            EscrowError::TooEarly
        );
        ctx.accounts.booking.status = status::COMPLETED;
        settle(&ctx, 0)
    }

    pub fn open_dispute(ctx: Context<GuestBooking>, reason: String) -> Result<()> {
        require!(reason.len() <= MAX_COMMENT_LEN, EscrowError::TooLong);
        let booking = &mut ctx.accounts.booking;
        require!(booking.status == status::BOOKED, EscrowError::InvalidStatus);
        let now = Clock::get()?.unix_timestamp;
        require!(now < checkin_time(booking.check_in) + RELEASE_DELAY, EscrowError::TooLate);
        booking.status = status::DISPUTED;
        emit!(Disputed { booking_id: booking.id, reason });
        Ok(())
    }

    pub fn resolve_dispute(ctx: Context<Settle>, refund_bps: u64) -> Result<()> {
        require_keys_eq!(ctx.accounts.config.arbiter, ctx.accounts.signer.key(), EscrowError::NotArbiter);
        require!(refund_bps <= BPS, EscrowError::InvalidFee);
        require!(ctx.accounts.booking.status == status::DISPUTED, EscrowError::InvalidStatus);
        ctx.accounts.booking.status = status::RESOLVED;
        settle(&ctx, refund_bps)
    }

    pub fn review_listing(ctx: Context<ReviewListing>, rating: u8, comment: String) -> Result<()> {
        let booking = &mut ctx.accounts.booking;
        require_keys_eq!(booking.guest, ctx.accounts.guest.key(), EscrowError::NotGuest);
        check_reviewable(booking.status, rating, &comment)?;
        require!(!booking.guest_reviewed, EscrowError::AlreadyReviewed);
        booking.guest_reviewed = true;
        let listing = &mut ctx.accounts.listing;
        listing.rating_count += 1;
        listing.rating_sum += rating as u64;
        emit!(ListingReviewed { booking_id: booking.id, listing_id: listing.id, rating, comment });
        Ok(())
    }

    pub fn review_guest(ctx: Context<ReviewGuest>, rating: u8, comment: String) -> Result<()> {
        let booking = &mut ctx.accounts.booking;
        check_reviewable(booking.status, rating, &comment)?;
        require!(!booking.host_reviewed, EscrowError::AlreadyReviewed);
        booking.host_reviewed = true;
        emit!(GuestReviewed { booking_id: booking.id, guest: booking.guest, rating, comment });
        Ok(())
    }
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

fn today() -> Result<u32> {
    Ok((Clock::get()?.unix_timestamp / DAY) as u32)
}

pub fn checkin_time(day: u32) -> i64 {
    day as i64 * DAY + CHECKIN_SECONDS
}

pub fn guest_refund_bps(policy: u8, created_at: i64, check_in: u32, now: i64) -> u64 {
    let start = checkin_time(check_in);
    if now >= start {
        return 0;
    }
    let left = start - now;
    match policy {
        policy::FLEXIBLE => if left >= DAY { BPS } else { 0 },
        policy::MODERATE => if left >= 5 * DAY { BPS } else { BPS / 2 },
        _ => {
            if now <= created_at + 2 * DAY && left >= 14 * DAY {
                BPS
            } else if left >= 7 * DAY {
                BPS / 2
            } else {
                0
            }
        }
    }
}

fn validate_listing(policy: u8, min_nights: u16, max_nights: u16, nightly: u64, uri: &str) -> Result<()> {
    require!(policy <= policy::STRICT, EscrowError::InvalidPolicy);
    require!(min_nights > 0 && max_nights >= min_nights && max_nights <= 365, EscrowError::InvalidDates);
    require!(nightly > 0, EscrowError::InvalidPrice);
    require!(uri.len() <= MAX_URI_LEN, EscrowError::TooLong);
    Ok(())
}

fn check_reviewable(status: u8, rating: u8, comment: &str) -> Result<()> {
    require!((1..=5).contains(&rating), EscrowError::InvalidRating);
    require!(comment.len() <= MAX_COMMENT_LEN, EscrowError::TooLong);
    require!(status == status::COMPLETED || status == status::RESOLVED, EscrowError::InvalidStatus);
    Ok(())
}

fn free_days(listing: &mut Account<Listing>, check_in: u32, check_out: u32) -> Result<()> {
    for day in check_in..check_out {
        let (byte, bit) = listing.slot(day)?;
        listing.booked[byte] &= !bit;
    }
    Ok(())
}

/// Split the escrowed lamports between guest (refund), host (payout) and treasury (fees).
fn settle(ctx: &Context<Settle>, refund_bps: u64) -> Result<()> {
    let b = &ctx.accounts.booking;
    let subtotal = b.subtotal as u128;
    let total = subtotal + b.guest_fee as u128;
    let bps = refund_bps as u128;
    let kept_subtotal = subtotal - subtotal * bps / BPS as u128;
    let host_fee_kept = if subtotal == 0 { 0 } else { b.host_fee as u128 * kept_subtotal / subtotal };
    let refund = subtotal * bps / BPS as u128 + b.guest_fee as u128 * bps / BPS as u128;
    let host_payout = kept_subtotal - host_fee_kept;
    let platform = total - refund - host_payout;

    let booking_info = ctx.accounts.booking.to_account_info();
    move_lamports(&booking_info, &ctx.accounts.guest, refund as u64)?;
    move_lamports(&booking_info, &ctx.accounts.host, host_payout as u64)?;
    move_lamports(&booking_info, &ctx.accounts.treasury, platform as u64)?;

    emit!(Settled {
        booking_id: b.id,
        status: b.status,
        refund: refund as u64,
        host_payout: host_payout as u64,
        platform_fee: platform as u64,
    });
    Ok(())
}

fn move_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    **from.try_borrow_mut_lamports()? = from.lamports().checked_sub(amount).ok_or(EscrowError::Overflow)?;
    **to.try_borrow_mut_lamports()? = to.lamports().checked_add(amount).ok_or(EscrowError::Overflow)?;
    Ok(())
}

// -------------------------------------------------------------------------
// Accounts
// -------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub arbiter: Pubkey,
    pub treasury: Pubkey,
    pub guest_fee_bps: u16,
    pub host_fee_bps: u16,
    pub listing_count: u64,
    pub booking_count: u64,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub id: u64,
    pub host: Pubkey,
    pub policy: u8,
    pub active: bool,
    pub min_nights: u16,
    pub max_nights: u16,
    pub nightly_lamports: u64,
    pub cleaning_fee_lamports: u64,
    pub rating_count: u32,
    pub rating_sum: u64,
    pub base_day: u32,
    pub booked: [u8; CALENDAR_BYTES],
    pub blocked: [u8; CALENDAR_BYTES],
    #[max_len(MAX_URI_LEN)]
    pub metadata_uri: String,
    pub bump: u8,
}

impl Listing {
    /// Byte index and bit mask of `day` in the availability bitmaps.
    pub fn slot(&self, day: u32) -> Result<(usize, u8)> {
        require!(day >= self.base_day && day < self.base_day + CALENDAR_DAYS, EscrowError::OutsideCalendar);
        let offset = day - self.base_day;
        Ok(((offset / 8) as usize, 1u8 << (offset % 8)))
    }
}

#[account]
#[derive(InitSpace)]
pub struct Booking {
    pub id: u64,
    pub listing: Pubkey,
    pub guest: Pubkey,
    pub check_in: u32,
    pub check_out: u32,
    pub created_at: i64,
    pub status: u8,
    pub subtotal: u64,
    pub guest_fee: u64,
    pub host_fee: u64,
    pub guest_reviewed: bool,
    pub host_reviewed: bool,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateListing<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = host,
        space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", (config.listing_count + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    #[account(mut)]
    pub host: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct HostListing<'info> {
    #[account(mut, seeds = [b"listing", listing.id.to_le_bytes().as_ref()], bump = listing.bump, has_one = host @ EscrowError::NotHost)]
    pub listing: Account<'info, Listing>,
    pub host: Signer<'info>,
}

#[derive(Accounts)]
pub struct Book<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"listing", listing.id.to_le_bytes().as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,
    #[account(
        init,
        payer = guest,
        space = 8 + Booking::INIT_SPACE,
        seeds = [b"booking", (config.booking_count + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub booking: Account<'info, Booking>,
    #[account(mut)]
    pub guest: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"listing", listing.id.to_le_bytes().as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,
    #[account(mut, seeds = [b"booking", booking.id.to_le_bytes().as_ref()], bump = booking.bump, has_one = listing, has_one = guest)]
    pub booking: Account<'info, Booking>,
    /// CHECK: must equal booking.guest (enforced by has_one); receives refunds.
    #[account(mut)]
    pub guest: UncheckedAccount<'info>,
    /// CHECK: must equal listing.host; receives payouts.
    #[account(mut, address = listing.host @ EscrowError::NotHost)]
    pub host: UncheckedAccount<'info>,
    /// CHECK: must equal config.treasury; receives platform fees.
    #[account(mut, address = config.treasury @ EscrowError::InvalidTreasury)]
    pub treasury: UncheckedAccount<'info>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct GuestBooking<'info> {
    #[account(mut, seeds = [b"booking", booking.id.to_le_bytes().as_ref()], bump = booking.bump, has_one = guest @ EscrowError::NotGuest)]
    pub booking: Account<'info, Booking>,
    pub guest: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReviewListing<'info> {
    #[account(mut, seeds = [b"listing", listing.id.to_le_bytes().as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,
    #[account(mut, seeds = [b"booking", booking.id.to_le_bytes().as_ref()], bump = booking.bump, has_one = listing)]
    pub booking: Account<'info, Booking>,
    pub guest: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReviewGuest<'info> {
    #[account(seeds = [b"listing", listing.id.to_le_bytes().as_ref()], bump = listing.bump, has_one = host @ EscrowError::NotHost)]
    pub listing: Account<'info, Listing>,
    #[account(mut, seeds = [b"booking", booking.id.to_le_bytes().as_ref()], bump = booking.bump, has_one = listing)]
    pub booking: Account<'info, Booking>,
    pub host: Signer<'info>,
}

// -------------------------------------------------------------------------
// Events & errors
// -------------------------------------------------------------------------

#[event]
pub struct ListingCreated {
    pub listing_id: u64,
    pub host: Pubkey,
}

#[event]
pub struct Booked {
    pub booking_id: u64,
    pub listing_id: u64,
    pub guest: Pubkey,
    pub check_in: u32,
    pub check_out: u32,
    pub total: u64,
}

#[event]
pub struct Settled {
    pub booking_id: u64,
    pub status: u8,
    pub refund: u64,
    pub host_payout: u64,
    pub platform_fee: u64,
}

#[event]
pub struct Disputed {
    pub booking_id: u64,
    pub reason: String,
}

#[event]
pub struct ListingReviewed {
    pub booking_id: u64,
    pub listing_id: u64,
    pub rating: u8,
    pub comment: String,
}

#[event]
pub struct GuestReviewed {
    pub booking_id: u64,
    pub guest: Pubkey,
    pub rating: u8,
    pub comment: String,
}

#[error_code]
pub enum EscrowError {
    #[msg("Only the host can do this")]
    NotHost,
    #[msg("Only the guest can do this")]
    NotGuest,
    #[msg("Only the arbiter can do this")]
    NotArbiter,
    #[msg("Listing is not active")]
    ListingInactive,
    #[msg("Invalid dates")]
    InvalidDates,
    #[msg("Some nights are not available")]
    DatesUnavailable,
    #[msg("Date is outside the bookable calendar window")]
    OutsideCalendar,
    #[msg("Invalid booking status for this action")]
    InvalidStatus,
    #[msg("Too late for this action")]
    TooLate,
    #[msg("Too early for this action")]
    TooEarly,
    #[msg("Rating must be between 1 and 5")]
    InvalidRating,
    #[msg("Already reviewed")]
    AlreadyReviewed,
    #[msg("Fee too high")]
    InvalidFee,
    #[msg("Invalid cancellation policy")]
    InvalidPolicy,
    #[msg("Price must be positive")]
    InvalidPrice,
    #[msg("Text too long")]
    TooLong,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Marketplace is paused")]
    Paused,
    #[msg("Hosts cannot book their own listing")]
    SelfBooking,
    #[msg("Wrong treasury account")]
    InvalidTreasury,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refund_policies() {
        let check_in = 20_000u32;
        let start = checkin_time(check_in);
        // Flexible
        assert_eq!(guest_refund_bps(policy::FLEXIBLE, 0, check_in, start - 2 * DAY), BPS);
        assert_eq!(guest_refund_bps(policy::FLEXIBLE, 0, check_in, start - 3_600), 0);
        // Moderate
        assert_eq!(guest_refund_bps(policy::MODERATE, 0, check_in, start - 6 * DAY), BPS);
        assert_eq!(guest_refund_bps(policy::MODERATE, 0, check_in, start - 2 * DAY), BPS / 2);
        // Strict
        let now = start - 20 * DAY;
        assert_eq!(guest_refund_bps(policy::STRICT, now - DAY, check_in, now), BPS);
        assert_eq!(guest_refund_bps(policy::STRICT, now - 3 * DAY, check_in, now), BPS / 2);
        assert_eq!(guest_refund_bps(policy::STRICT, 0, check_in, start - 3 * DAY), 0);
        // After check-in
        assert_eq!(guest_refund_bps(policy::FLEXIBLE, 0, check_in, start + 1), 0);
    }
}
