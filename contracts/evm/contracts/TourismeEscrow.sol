// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TourismeEscrow
/// @notice Trust-minimised short-term rental marketplace. Hosts publish listings with nightly
///         prices in native coin and/or whitelisted ERC20 stablecoins. Guests pay into escrow when
///         booking; funds are released to the host 24h after check-in (Airbnb-style), refunded
///         according to the listing's cancellation policy, or split by an arbiter on dispute.
/// @dev    Dates are expressed as UTC day numbers (unix timestamp / 1 days). A stay occupies the
///         nights [checkIn, checkOut).
contract TourismeEscrow is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum Policy {
        Flexible, // full refund until 24h before check-in
        Moderate, // full refund until 5 days before check-in, 50% after
        Strict // full refund within 48h of booking if check-in >= 14 days away, 50% until 7 days, 0 after
    }

    enum Status {
        None,
        Booked,
        CancelledByGuest,
        CancelledByHost,
        Completed,
        Disputed,
        Resolved
    }

    struct Listing {
        address host;
        Policy policy;
        bool active;
        uint16 minNights;
        uint16 maxNights;
        uint32 ratingCount;
        uint64 ratingSum;
        string metadataURI;
    }

    struct Price {
        uint128 nightly;
        uint128 cleaningFee;
        bool enabled;
    }

    struct Booking {
        uint256 listingId;
        address guest;
        address token; // address(0) = native coin
        uint32 checkIn;
        uint32 checkOut;
        uint64 createdAt;
        Status status;
        bool guestReviewed; // guest reviewed the listing
        bool hostReviewed; // host reviewed the guest
        uint128 subtotal; // nights * nightly + cleaning
        uint128 guestFee; // service fee paid by guest on top of subtotal
        uint128 hostFee; // commission deducted from host payout
    }

    // ---------------------------------------------------------------------
    // Constants & storage
    // ---------------------------------------------------------------------

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 2_000; // 20%
    uint256 public constant CHECKIN_HOUR = 15 hours; // 15:00 UTC
    uint256 public constant RELEASE_DELAY = 1 days; // payout 24h after check-in
    uint256 private constant HOST_BLOCKED = type(uint256).max;

    uint16 public guestFeeBps = 800; // 8%
    uint16 public hostFeeBps = 300; // 3%
    address public arbiter;
    address public treasury;

    uint256 public listingCount;
    uint256 public bookingCount;

    mapping(uint256 => Listing) private _listings;
    mapping(uint256 => mapping(address => Price)) public prices;
    /// listingId => day => bookingId (0 = free, HOST_BLOCKED = blocked by host)
    mapping(uint256 => mapping(uint32 => uint256)) private _calendar;
    mapping(uint256 => Booking) private _bookings;
    mapping(address => bool) public allowedTokens;
    /// account => token => withdrawable balance
    mapping(address => mapping(address => uint256)) public balances;

    mapping(address => uint256[]) private _hostListings;
    mapping(address => uint256[]) private _guestBookings;
    mapping(uint256 => uint256[]) private _listingBookings;

    mapping(address => uint32) public guestRatingCount;
    mapping(address => uint64) public guestRatingSum;
    mapping(address => uint32) public hostCancellations;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event ListingCreated(uint256 indexed listingId, address indexed host, Policy policy, string metadataURI);
    event ListingUpdated(uint256 indexed listingId, Policy policy, bool active, uint16 minNights, uint16 maxNights, string metadataURI);
    event PriceSet(uint256 indexed listingId, address indexed token, uint128 nightly, uint128 cleaningFee, bool enabled);
    event DaysBlocked(uint256 indexed listingId, uint32[] days_, bool blocked);
    event Booked(
        uint256 indexed bookingId,
        uint256 indexed listingId,
        address indexed guest,
        address token,
        uint32 checkIn,
        uint32 checkOut,
        uint256 total
    );
    event Cancelled(uint256 indexed bookingId, address indexed by, uint256 refund, uint256 hostPayout);
    event Released(uint256 indexed bookingId, uint256 hostPayout, uint256 platformFee);
    event Disputed(uint256 indexed bookingId, string reason);
    event Resolved(uint256 indexed bookingId, uint256 guestRefundBps, uint256 refund, uint256 hostPayout);
    event ListingReviewed(uint256 indexed bookingId, uint256 indexed listingId, uint8 rating, string comment);
    event GuestReviewed(uint256 indexed bookingId, address indexed guest, uint8 rating, string comment);
    event Withdrawn(address indexed account, address indexed token, uint256 amount);
    event FeesUpdated(uint16 guestFeeBps, uint16 hostFeeBps);
    event ArbiterUpdated(address arbiter);
    event TreasuryUpdated(address treasury);
    event TokenAllowed(address indexed token, bool allowed);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotHost();
    error NotGuest();
    error NotArbiter();
    error InvalidListing();
    error ListingInactive();
    error TokenNotAccepted();
    error InvalidDates();
    error DatesUnavailable(uint32 day);
    error WrongPayment();
    error InvalidStatus();
    error TooLate();
    error TooEarly();
    error InvalidRating();
    error AlreadyReviewed();
    error InvalidFee();
    error ZeroAddress();
    error NothingToWithdraw();
    error TransferFailed();
    error SelfBooking();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address arbiter_, address treasury_) Ownable(msg.sender) {
        if (arbiter_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        arbiter = arbiter_;
        treasury = treasury_;
        allowedTokens[address(0)] = true;
        emit TokenAllowed(address(0), true);
    }

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyHost(uint256 listingId) {
        if (_listings[listingId].host != msg.sender) revert NotHost();
        _;
    }

    // ---------------------------------------------------------------------
    // Host: listings
    // ---------------------------------------------------------------------

    function createListing(Policy policy, uint16 minNights, uint16 maxNights, string calldata metadataURI)
        external
        whenNotPaused
        returns (uint256 listingId)
    {
        _validateNights(minNights, maxNights);
        listingId = ++listingCount;
        Listing storage l = _listings[listingId];
        l.host = msg.sender;
        l.policy = policy;
        l.active = true;
        l.minNights = minNights;
        l.maxNights = maxNights;
        l.metadataURI = metadataURI;
        _hostListings[msg.sender].push(listingId);
        emit ListingCreated(listingId, msg.sender, policy, metadataURI);
    }

    function updateListing(
        uint256 listingId,
        Policy policy,
        bool active,
        uint16 minNights,
        uint16 maxNights,
        string calldata metadataURI
    ) external onlyHost(listingId) {
        _validateNights(minNights, maxNights);
        Listing storage l = _listings[listingId];
        l.policy = policy;
        l.active = active;
        l.minNights = minNights;
        l.maxNights = maxNights;
        l.metadataURI = metadataURI;
        emit ListingUpdated(listingId, policy, active, minNights, maxNights, metadataURI);
    }

    function setPrice(uint256 listingId, address token, uint128 nightly, uint128 cleaningFee, bool enabled)
        external
        onlyHost(listingId)
    {
        if (!allowedTokens[token]) revert TokenNotAccepted();
        if (enabled && nightly == 0) revert WrongPayment();
        prices[listingId][token] = Price(nightly, cleaningFee, enabled);
        emit PriceSet(listingId, token, nightly, cleaningFee, enabled);
    }

    /// @notice Block/unblock nights on the calendar (e.g. bookings taken elsewhere, maintenance).
    function setBlockedDays(uint256 listingId, uint32[] calldata days_, bool blocked) external onlyHost(listingId) {
        mapping(uint32 => uint256) storage cal = _calendar[listingId];
        for (uint256 i; i < days_.length; ++i) {
            uint256 current = cal[days_[i]];
            if (blocked) {
                if (current != 0 && current != HOST_BLOCKED) revert DatesUnavailable(days_[i]);
                cal[days_[i]] = HOST_BLOCKED;
            } else if (current == HOST_BLOCKED) {
                cal[days_[i]] = 0;
            }
        }
        emit DaysBlocked(listingId, days_, blocked);
    }

    // ---------------------------------------------------------------------
    // Guest: booking
    // ---------------------------------------------------------------------

    function book(uint256 listingId, address token, uint32 checkIn, uint32 checkOut)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 bookingId)
    {
        Listing storage l = _listings[listingId];
        if (l.host == address(0)) revert InvalidListing();
        if (!l.active) revert ListingInactive();
        if (l.host == msg.sender) revert SelfBooking();
        Price memory p = prices[listingId][token];
        if (!p.enabled || !allowedTokens[token]) revert TokenNotAccepted();

        uint256 nights = _validateStay(l, checkIn, checkOut);
        (uint256 subtotal, uint256 guestFee, uint256 total) = _quote(p, nights);

        bookingId = ++bookingCount;
        mapping(uint32 => uint256) storage cal = _calendar[listingId];
        for (uint32 d = checkIn; d < checkOut; ++d) {
            if (cal[d] != 0) revert DatesUnavailable(d);
            cal[d] = bookingId;
        }

        _bookings[bookingId] = Booking({
            listingId: listingId,
            guest: msg.sender,
            token: token,
            checkIn: checkIn,
            checkOut: checkOut,
            createdAt: uint64(block.timestamp),
            status: Status.Booked,
            guestReviewed: false,
            hostReviewed: false,
            subtotal: uint128(subtotal),
            guestFee: uint128(guestFee),
            hostFee: uint128((subtotal * hostFeeBps) / BPS)
        });
        _guestBookings[msg.sender].push(bookingId);
        _listingBookings[listingId].push(bookingId);

        if (token == address(0)) {
            if (msg.value != total) revert WrongPayment();
        } else {
            if (msg.value != 0) revert WrongPayment();
            IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        }

        emit Booked(bookingId, listingId, msg.sender, token, checkIn, checkOut, total);
    }

    /// @notice Guest cancels before check-in; refund follows the listing's cancellation policy.
    function cancelByGuest(uint256 bookingId) external nonReentrant {
        Booking storage b = _bookings[bookingId];
        if (b.guest != msg.sender) revert NotGuest();
        if (b.status != Status.Booked) revert InvalidStatus();
        if (block.timestamp >= checkInTime(b.checkIn)) revert TooLate();

        uint256 refundBps = guestRefundBps(bookingId);
        b.status = Status.CancelledByGuest;
        _freeDays(b);
        (uint256 refund, uint256 hostPayout) = _settle(b, refundBps);
        // The guest is the caller, so paying them directly is safe.
        if (refund > 0) {
            balances[msg.sender][b.token] -= refund;
            _transferOut(msg.sender, b.token, refund);
            emit Withdrawn(msg.sender, b.token, refund);
        }
        emit Cancelled(bookingId, msg.sender, refund, hostPayout);
    }

    /// @notice Host cancels before check-in; guest is fully refunded.
    function cancelByHost(uint256 bookingId) external nonReentrant {
        Booking storage b = _bookings[bookingId];
        if (_listings[b.listingId].host != msg.sender) revert NotHost();
        if (b.status != Status.Booked) revert InvalidStatus();
        if (block.timestamp >= checkInTime(b.checkIn)) revert TooLate();

        b.status = Status.CancelledByHost;
        hostCancellations[msg.sender] += 1;
        _freeDays(b);
        (uint256 refund, uint256 hostPayout) = _settle(b, BPS);
        emit Cancelled(bookingId, msg.sender, refund, hostPayout);
    }

    /// @notice Releases escrow to the host. Anyone may call once 24h have passed since check-in;
    ///         the guest may release early (e.g. "everything is great").
    function release(uint256 bookingId) external nonReentrant {
        Booking storage b = _bookings[bookingId];
        if (b.status != Status.Booked) revert InvalidStatus();
        if (msg.sender != b.guest && block.timestamp < checkInTime(b.checkIn) + RELEASE_DELAY) revert TooEarly();

        b.status = Status.Completed;
        (, uint256 hostPayout) = _settle(b, 0);
        emit Released(bookingId, hostPayout, uint256(b.guestFee) + b.hostFee);
    }

    /// @notice Guest raises an issue (listing not as described, no access...) before payout.
    function openDispute(uint256 bookingId, string calldata reason) external {
        Booking storage b = _bookings[bookingId];
        if (b.guest != msg.sender) revert NotGuest();
        if (b.status != Status.Booked) revert InvalidStatus();
        if (block.timestamp >= checkInTime(b.checkIn) + RELEASE_DELAY) revert TooLate();
        b.status = Status.Disputed;
        emit Disputed(bookingId, reason);
    }

    /// @notice Arbiter settles a dispute by refunding `refundBps` of the stay to the guest.
    function resolveDispute(uint256 bookingId, uint256 refundBps) external nonReentrant {
        if (msg.sender != arbiter) revert NotArbiter();
        if (refundBps > BPS) revert InvalidFee();
        Booking storage b = _bookings[bookingId];
        if (b.status != Status.Disputed) revert InvalidStatus();
        b.status = Status.Resolved;
        (uint256 refund, uint256 hostPayout) = _settle(b, refundBps);
        emit Resolved(bookingId, refundBps, refund, hostPayout);
    }

    // ---------------------------------------------------------------------
    // Reviews (two-sided)
    // ---------------------------------------------------------------------

    function reviewListing(uint256 bookingId, uint8 rating, string calldata comment) external {
        Booking storage b = _bookings[bookingId];
        if (b.guest != msg.sender) revert NotGuest();
        _checkReviewable(b, rating);
        if (b.guestReviewed) revert AlreadyReviewed();
        b.guestReviewed = true;
        Listing storage l = _listings[b.listingId];
        l.ratingCount += 1;
        l.ratingSum += rating;
        emit ListingReviewed(bookingId, b.listingId, rating, comment);
    }

    function reviewGuest(uint256 bookingId, uint8 rating, string calldata comment) external {
        Booking storage b = _bookings[bookingId];
        if (_listings[b.listingId].host != msg.sender) revert NotHost();
        _checkReviewable(b, rating);
        if (b.hostReviewed) revert AlreadyReviewed();
        b.hostReviewed = true;
        guestRatingCount[b.guest] += 1;
        guestRatingSum[b.guest] += rating;
        emit GuestReviewed(bookingId, b.guest, rating, comment);
    }

    // ---------------------------------------------------------------------
    // Payouts
    // ---------------------------------------------------------------------

    function withdraw(address token) external nonReentrant {
        uint256 amount = balances[msg.sender][token];
        if (amount == 0) revert NothingToWithdraw();
        balances[msg.sender][token] = 0;
        _transferOut(msg.sender, token, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setFees(uint16 guestFeeBps_, uint16 hostFeeBps_) external onlyOwner {
        if (guestFeeBps_ > MAX_FEE_BPS || hostFeeBps_ > MAX_FEE_BPS) revert InvalidFee();
        guestFeeBps = guestFeeBps_;
        hostFeeBps = hostFeeBps_;
        emit FeesUpdated(guestFeeBps_, hostFeeBps_);
    }

    function setArbiter(address arbiter_) external onlyOwner {
        if (arbiter_ == address(0)) revert ZeroAddress();
        arbiter = arbiter_;
        emit ArbiterUpdated(arbiter_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _listings[listingId];
    }

    function getBooking(uint256 bookingId) external view returns (Booking memory) {
        return _bookings[bookingId];
    }

    function hostListings(address host) external view returns (uint256[] memory) {
        return _hostListings[host];
    }

    function guestBookings(address guest) external view returns (uint256[] memory) {
        return _guestBookings[guest];
    }

    function listingBookings(uint256 listingId) external view returns (uint256[] memory) {
        return _listingBookings[listingId];
    }

    /// @notice Calendar occupancy from `fromDay` for `count` days: 0 free, 1 blocked by host, 2 booked.
    function calendar(uint256 listingId, uint32 fromDay, uint32 count) external view returns (uint8[] memory out) {
        out = new uint8[](count);
        mapping(uint32 => uint256) storage cal = _calendar[listingId];
        for (uint32 i; i < count; ++i) {
            uint256 v = cal[fromDay + i];
            out[i] = v == 0 ? 0 : (v == HOST_BLOCKED ? 1 : 2);
        }
    }

    function isAvailable(uint256 listingId, uint32 checkIn, uint32 checkOut) external view returns (bool) {
        if (checkOut <= checkIn) return false;
        mapping(uint32 => uint256) storage cal = _calendar[listingId];
        for (uint32 d = checkIn; d < checkOut; ++d) {
            if (cal[d] != 0) return false;
        }
        return true;
    }

    function quote(uint256 listingId, address token, uint32 checkIn, uint32 checkOut)
        external
        view
        returns (uint256 subtotal, uint256 guestFee, uint256 total)
    {
        Price memory p = prices[listingId][token];
        if (!p.enabled) revert TokenNotAccepted();
        if (checkOut <= checkIn) revert InvalidDates();
        return _quote(p, checkOut - checkIn);
    }

    function checkInTime(uint32 day) public pure returns (uint256) {
        return uint256(day) * 1 days + CHECKIN_HOUR;
    }

    function today() public view returns (uint32) {
        return uint32(block.timestamp / 1 days);
    }

    /// @notice Refund share (in bps) the guest would get if they cancelled now.
    function guestRefundBps(uint256 bookingId) public view returns (uint256) {
        Booking storage b = _bookings[bookingId];
        uint256 start = checkInTime(b.checkIn);
        if (block.timestamp >= start) return 0;
        uint256 timeLeft = start - block.timestamp;
        Policy policy = _listings[b.listingId].policy;
        if (policy == Policy.Flexible) {
            return timeLeft >= 1 days ? BPS : 0;
        } else if (policy == Policy.Moderate) {
            return timeLeft >= 5 days ? BPS : BPS / 2;
        } else {
            if (block.timestamp <= b.createdAt + 2 days && timeLeft >= 14 days) return BPS;
            return timeLeft >= 7 days ? BPS / 2 : 0;
        }
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _quote(Price memory p, uint256 nights)
        internal
        view
        returns (uint256 subtotal, uint256 guestFee, uint256 total)
    {
        subtotal = uint256(p.nightly) * nights + p.cleaningFee;
        guestFee = (subtotal * guestFeeBps) / BPS;
        total = subtotal + guestFee;
    }

    function _validateNights(uint16 minNights, uint16 maxNights) internal pure {
        if (minNights == 0 || maxNights < minNights || maxNights > 365) revert InvalidDates();
    }

    function _validateStay(Listing storage l, uint32 checkIn, uint32 checkOut) internal view returns (uint256 nights) {
        if (checkOut <= checkIn || checkIn < today()) revert InvalidDates();
        nights = checkOut - checkIn;
        if (nights < l.minNights || nights > l.maxNights) revert InvalidDates();
        if (block.timestamp >= checkInTime(checkIn)) revert TooLate();
    }

    function _freeDays(Booking storage b) internal {
        mapping(uint32 => uint256) storage cal = _calendar[b.listingId];
        for (uint32 d = b.checkIn; d < b.checkOut; ++d) {
            delete cal[d];
        }
    }

    /// @dev Splits the escrowed amount: `refundBps` of the stay goes back to the guest, the rest to
    ///      the host minus the proportional host commission; the platform keeps the remainder.
    ///      All parties are credited to internal balances (pull payments).
    function _settle(Booking storage b, uint256 refundBps) internal returns (uint256 refund, uint256 hostPayout) {
        uint256 subtotal = b.subtotal;
        uint256 total = subtotal + b.guestFee;
        uint256 keptSubtotal = subtotal - (subtotal * refundBps) / BPS;
        uint256 hostFeeKept = subtotal == 0 ? 0 : (uint256(b.hostFee) * keptSubtotal) / subtotal;

        refund = (subtotal * refundBps) / BPS + (uint256(b.guestFee) * refundBps) / BPS;
        hostPayout = keptSubtotal - hostFeeKept;
        uint256 platform = total - refund - hostPayout;

        address token = b.token;
        if (refund > 0) balances[b.guest][token] += refund;
        if (hostPayout > 0) balances[_listings[b.listingId].host][token] += hostPayout;
        if (platform > 0) balances[treasury][token] += platform;
    }

    function _checkReviewable(Booking storage b, uint8 rating) internal view {
        if (rating < 1 || rating > 5) revert InvalidRating();
        if (b.status != Status.Completed && b.status != Status.Resolved) revert InvalidStatus();
    }

    function _transferOut(address to, address token, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
