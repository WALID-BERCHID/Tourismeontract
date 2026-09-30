const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const DAY = 86400;
const ETH = ethers.ZeroAddress;
const Policy = { Flexible: 0, Moderate: 1, Strict: 2 };
const Status = { None: 0, Booked: 1, CancelledByGuest: 2, CancelledByHost: 3, Completed: 4, Disputed: 5, Resolved: 6 };

async function today() {
  return Math.floor((await time.latest()) / DAY);
}

describe("TourismeEscrow", function () {
  async function deploy() {
    const [owner, host, guest, arbiter, treasury, other] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory("TourismeEscrow");
    const escrow = await Escrow.deploy(arbiter.address, treasury.address);
    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();
    await escrow.setTokenAllowed(await usdc.getAddress(), true);

    await escrow.connect(host).createListing(Policy.Flexible, 1, 30, "ipfs://listing-1");
    const nightly = ethers.parseEther("0.1");
    const cleaning = ethers.parseEther("0.02");
    await escrow.connect(host).setPrice(1, ETH, nightly, cleaning, true);
    await escrow.connect(host).setPrice(1, await usdc.getAddress(), 120_000_000n, 25_000_000n, true);

    await usdc.mint(guest.address, 10_000_000_000n);
    await usdc.connect(guest).approve(await escrow.getAddress(), ethers.MaxUint256);

    return { escrow, usdc, owner, host, guest, arbiter, treasury, other, nightly, cleaning };
  }

  async function bookEth(escrow, guest, listingId, checkIn, checkOut) {
    const [, , total] = await escrow.quote(listingId, ETH, checkIn, checkOut);
    await escrow.connect(guest).book(listingId, ETH, checkIn, checkOut, { value: total });
    return total;
  }

  describe("listings", function () {
    it("creates listings and tracks host listings", async function () {
      const { escrow, host } = await loadFixture(deploy);
      const l = await escrow.getListing(1);
      expect(l.host).to.equal(host.address);
      expect(l.active).to.equal(true);
      expect(await escrow.hostListings(host.address)).to.deep.equal([1n]);
    });

    it("only host can update or price", async function () {
      const { escrow, other } = await loadFixture(deploy);
      await expect(escrow.connect(other).setPrice(1, ETH, 1, 0, true)).to.be.revertedWithCustomError(escrow, "NotHost");
      await expect(escrow.connect(other).updateListing(1, 0, false, 1, 2, "")).to.be.revertedWithCustomError(
        escrow,
        "NotHost"
      );
    });

    it("rejects non-whitelisted tokens", async function () {
      const { escrow, host, other } = await loadFixture(deploy);
      await expect(escrow.connect(host).setPrice(1, other.address, 1, 0, true)).to.be.revertedWithCustomError(
        escrow,
        "TokenNotAccepted"
      );
    });
  });

  describe("booking", function () {
    it("books with native coin, computes fees and blocks the calendar", async function () {
      const { escrow, guest, nightly, cleaning } = await loadFixture(deploy);
      const t = await today();
      const checkIn = t + 10;
      const checkOut = t + 13;
      const [subtotal, fee, total] = await escrow.quote(1, ETH, checkIn, checkOut);
      expect(subtotal).to.equal(nightly * 3n + cleaning);
      expect(fee).to.equal((subtotal * 800n) / 10000n);
      await expect(escrow.connect(guest).book(1, ETH, checkIn, checkOut, { value: total }))
        .to.emit(escrow, "Booked")
        .withArgs(1, 1, guest.address, ETH, checkIn, checkOut, total);
      expect(await escrow.isAvailable(1, checkIn, checkOut)).to.equal(false);
      expect(await escrow.isAvailable(1, checkOut, checkOut + 2)).to.equal(true);
      expect(await escrow.calendar(1, checkIn - 1, 5)).to.deep.equal([0n, 2n, 2n, 2n, 0n]);
      expect(await escrow.guestBookings(guest.address)).to.deep.equal([1n]);
    });

    it("books with an ERC20 stablecoin", async function () {
      const { escrow, usdc, guest } = await loadFixture(deploy);
      const t = await today();
      const token = await usdc.getAddress();
      const [, , total] = await escrow.quote(1, token, t + 5, t + 7);
      await expect(escrow.connect(guest).book(1, token, t + 5, t + 7)).to.changeTokenBalances(
        usdc,
        [guest, escrow],
        [-total, total]
      );
    });

    it("prevents double booking and overlapping stays", async function () {
      const { escrow, guest, other } = await loadFixture(deploy);
      const t = await today();
      await bookEth(escrow, guest, 1, t + 10, t + 13);
      const [, , total] = await escrow.quote(1, ETH, t + 12, t + 14);
      await expect(escrow.connect(other).book(1, ETH, t + 12, t + 14, { value: total }))
        .to.be.revertedWithCustomError(escrow, "DatesUnavailable")
        .withArgs(t + 12);
    });

    it("rejects wrong payment, bad dates, self booking and min/max nights", async function () {
      const { escrow, host, guest } = await loadFixture(deploy);
      const t = await today();
      await expect(escrow.connect(guest).book(1, ETH, t + 3, t + 5, { value: 1 })).to.be.revertedWithCustomError(
        escrow,
        "WrongPayment"
      );
      await expect(escrow.connect(guest).book(1, ETH, t + 5, t + 5)).to.be.revertedWithCustomError(escrow, "InvalidDates");
      await expect(escrow.connect(guest).book(1, ETH, t - 2, t + 1)).to.be.revertedWithCustomError(escrow, "InvalidDates");
      await expect(escrow.connect(guest).book(1, ETH, t + 1, t + 40)).to.be.revertedWithCustomError(escrow, "InvalidDates");
      await expect(escrow.connect(host).book(1, ETH, t + 3, t + 5)).to.be.revertedWithCustomError(escrow, "SelfBooking");
    });

    it("respects host-blocked days and inactive listings", async function () {
      const { escrow, host, guest } = await loadFixture(deploy);
      const t = await today();
      await escrow.connect(host).setBlockedDays(1, [t + 4], true);
      await expect(escrow.connect(guest).book(1, ETH, t + 3, t + 5, { value: 0 })).to.be.revertedWithCustomError(
        escrow,
        "DatesUnavailable"
      );
      await escrow.connect(host).setBlockedDays(1, [t + 4], false);
      await bookEth(escrow, guest, 1, t + 3, t + 5);
      await expect(escrow.connect(host).setBlockedDays(1, [t + 4], true)).to.be.revertedWithCustomError(
        escrow,
        "DatesUnavailable"
      );
      await escrow.connect(host).updateListing(1, 0, false, 1, 30, "x");
      await expect(escrow.connect(guest).book(1, ETH, t + 8, t + 9)).to.be.revertedWithCustomError(escrow, "ListingInactive");
    });

    it("is pausable by the owner", async function () {
      const { escrow, guest } = await loadFixture(deploy);
      await escrow.pause();
      const t = await today();
      await expect(escrow.connect(guest).book(1, ETH, t + 3, t + 5)).to.be.revertedWithCustomError(escrow, "EnforcedPause");
    });
  });

  describe("release and payouts", function () {
    it("releases to host 24h after check-in and splits fees", async function () {
      const { escrow, host, guest, treasury, other } = await loadFixture(deploy);
      const t = await today();
      const total = await bookEth(escrow, guest, 1, t + 2, t + 4);
      await expect(escrow.connect(other).release(1)).to.be.revertedWithCustomError(escrow, "TooEarly");
      await time.increaseTo((t + 2) * DAY + 15 * 3600 + DAY);
      await escrow.connect(other).release(1);
      const b = await escrow.getBooking(1);
      expect(b.status).to.equal(Status.Completed);
      const hostBal = await escrow.balances(host.address, ETH);
      const treasuryBal = await escrow.balances(treasury.address, ETH);
      expect(hostBal).to.equal(b.subtotal - b.hostFee);
      expect(hostBal + treasuryBal).to.equal(total);
      await expect(escrow.connect(host).withdraw(ETH)).to.changeEtherBalance(host, hostBal);
      await expect(escrow.connect(host).withdraw(ETH)).to.be.revertedWithCustomError(escrow, "NothingToWithdraw");
    });

    it("lets the guest release early", async function () {
      const { escrow, guest } = await loadFixture(deploy);
      const t = await today();
      await bookEth(escrow, guest, 1, t + 20, t + 21);
      await expect(escrow.connect(guest).release(1)).to.emit(escrow, "Released");
    });
  });

  describe("cancellations", function () {
    it("flexible: full refund more than 24h before check-in, dates freed", async function () {
      const { escrow, guest } = await loadFixture(deploy);
      const t = await today();
      const total = await bookEth(escrow, guest, 1, t + 5, t + 7);
      await expect(escrow.connect(guest).cancelByGuest(1)).to.changeEtherBalance(guest, total);
      expect(await escrow.isAvailable(1, t + 5, t + 7)).to.equal(true);
      expect((await escrow.getBooking(1)).status).to.equal(Status.CancelledByGuest);
    });

    it("flexible: no refund within 24h of check-in; host is paid", async function () {
      const { escrow, host, guest } = await loadFixture(deploy);
      const t = await today();
      await bookEth(escrow, guest, 1, t + 3, t + 5);
      await time.increaseTo((t + 3) * DAY + 15 * 3600 - 3600);
      await expect(escrow.connect(guest).cancelByGuest(1)).to.changeEtherBalance(guest, 0);
      const b = await escrow.getBooking(1);
      expect(await escrow.balances(host.address, ETH)).to.equal(b.subtotal - b.hostFee);
    });

    it("moderate: 50% refund inside 5 days", async function () {
      const { escrow, host, guest } = await loadFixture(deploy);
      const t = await today();
      await escrow.connect(host).updateListing(1, Policy.Moderate, true, 1, 30, "");
      const total = await bookEth(escrow, guest, 1, t + 3, t + 5);
      expect(await escrow.guestRefundBps(1)).to.equal(5000);
      await expect(escrow.connect(guest).cancelByGuest(1)).to.changeEtherBalance(guest, total / 2n);
    });

    it("strict: full refund within 48h of booking when >= 14 days away, then 50%", async function () {
      const { escrow, host, guest } = await loadFixture(deploy);
      const t = await today();
      await escrow.connect(host).updateListing(1, Policy.Strict, true, 1, 30, "");
      await bookEth(escrow, guest, 1, t + 20, t + 22);
      expect(await escrow.guestRefundBps(1)).to.equal(10000);
      await time.increase(3 * DAY);
      expect(await escrow.guestRefundBps(1)).to.equal(5000);
      await time.increaseTo((t + 18) * DAY);
      expect(await escrow.guestRefundBps(1)).to.equal(0);
    });

    it("host cancellation refunds the guest in full and is tracked", async function () {
      const { escrow, host, guest } = await loadFixture(deploy);
      const t = await today();
      const total = await bookEth(escrow, guest, 1, t + 5, t + 7);
      await escrow.connect(host).cancelByHost(1);
      expect(await escrow.balances(guest.address, ETH)).to.equal(total);
      expect(await escrow.hostCancellations(host.address)).to.equal(1);
      await expect(escrow.connect(guest).withdraw(ETH)).to.changeEtherBalance(guest, total);
    });

    it("cannot cancel after check-in", async function () {
      const { escrow, host, guest } = await loadFixture(deploy);
      const t = await today();
      await bookEth(escrow, guest, 1, t + 1, t + 3);
      await time.increaseTo((t + 1) * DAY + 16 * 3600);
      await expect(escrow.connect(guest).cancelByGuest(1)).to.be.revertedWithCustomError(escrow, "TooLate");
      await expect(escrow.connect(host).cancelByHost(1)).to.be.revertedWithCustomError(escrow, "TooLate");
    });
  });

  describe("disputes", function () {
    it("arbiter splits a disputed booking", async function () {
      const { escrow, host, guest, arbiter, treasury } = await loadFixture(deploy);
      const t = await today();
      const total = await bookEth(escrow, guest, 1, t + 1, t + 3);
      await time.increaseTo((t + 1) * DAY + 16 * 3600);
      await expect(escrow.connect(guest).openDispute(1, "No hot water")).to.emit(escrow, "Disputed");
      await expect(escrow.connect(host).release(1)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
      await expect(escrow.connect(guest).resolveDispute(1, 5000)).to.be.revertedWithCustomError(escrow, "NotArbiter");
      await escrow.connect(arbiter).resolveDispute(1, 5000);
      const g = await escrow.balances(guest.address, ETH);
      const h = await escrow.balances(host.address, ETH);
      const p = await escrow.balances(treasury.address, ETH);
      expect(g + h + p).to.equal(total);
      expect(g).to.equal(total / 2n);
    });

    it("dispute window closes 24h after check-in", async function () {
      const { escrow, guest } = await loadFixture(deploy);
      const t = await today();
      await bookEth(escrow, guest, 1, t + 1, t + 3);
      await time.increaseTo((t + 2) * DAY + 16 * 3600);
      await expect(escrow.connect(guest).openDispute(1, "late")).to.be.revertedWithCustomError(escrow, "TooLate");
    });
  });

  describe("reviews", function () {
    it("supports two-sided reviews after completion, once each", async function () {
      const { escrow, host, guest } = await loadFixture(deploy);
      const t = await today();
      await bookEth(escrow, guest, 1, t + 2, t + 4);
      await expect(escrow.connect(guest).reviewListing(1, 5, "early")).to.be.revertedWithCustomError(escrow, "InvalidStatus");
      await escrow.connect(guest).release(1);
      await expect(escrow.connect(guest).reviewListing(1, 6, "x")).to.be.revertedWithCustomError(escrow, "InvalidRating");
      await expect(escrow.connect(guest).reviewListing(1, 5, "Amazing riad!"))
        .to.emit(escrow, "ListingReviewed")
        .withArgs(1, 1, 5, "Amazing riad!");
      await expect(escrow.connect(guest).reviewListing(1, 4, "again")).to.be.revertedWithCustomError(escrow, "AlreadyReviewed");
      await escrow.connect(host).reviewGuest(1, 4, "Great guest");
      const l = await escrow.getListing(1);
      expect(l.ratingCount).to.equal(1);
      expect(l.ratingSum).to.equal(5);
      expect(await escrow.guestRatingSum(guest.address)).to.equal(4);
    });
  });

  describe("admin", function () {
    it("caps fees and restricts admin functions", async function () {
      const { escrow, other } = await loadFixture(deploy);
      await expect(escrow.setFees(2001, 0)).to.be.revertedWithCustomError(escrow, "InvalidFee");
      await escrow.setFees(1000, 500);
      expect(await escrow.guestFeeBps()).to.equal(1000);
      await expect(escrow.connect(other).setFees(1, 1)).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });
  });
});
