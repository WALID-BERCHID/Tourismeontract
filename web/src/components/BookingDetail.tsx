import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, Copy, ExternalLink, KeyRound, MapPin, MessageCircle, Printer, ShieldCheck, Star, Users, Wallet } from "lucide-react";
import { ApiError, api } from "../lib/api";
import { useMeta } from "../lib/hooks";
import { useCurrency } from "../lib/currency";
import { POLICY_TEXT, longDate, shortAddress, todayDay } from "../lib/format";
import type { Booking, Listing } from "../lib/types";
import { bookingAction, errorMessage, refundPreview } from "../lib/payments";
import { evmEscrow } from "../lib/chains/evm";
import { ChainIcon } from "./icons";
import { LocationMap } from "./MapView";
import { Alert, Avatar, Button, Container, Divider, Img, Modal, PageLoader, StatusBadge, Textarea } from "./ui";

type Role = "guest" | "host";

function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <span className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} stars`} onClick={() => onChange(n)}>
            <Star className={clsx("h-6 w-6 transition", n <= value ? "fill-ink text-ink" : "text-ink-line hover:text-ink-muted")} />
          </button>
        ))}
      </span>
    </div>
  );
}

function ReviewModal({ booking, role, open, onClose, onDone, net }: { booking: Booking; role: Role; open: boolean; onClose: () => void; onDone: () => void; net?: ReturnType<typeof useNet> }) {
  const [rating, setRating] = useState(5);
  const [cats, setCats] = useState({ cleanliness: 5, accuracy: 5, communication: 5, location: 5, checkin: 5, value: 5 });
  const [comment, setComment] = useState("");
  const [onChain, setOnChain] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let txHash: string | undefined;
      if (onChain && net?.chain === "evm" && booking.chainBookingId) {
        txHash = role === "guest" ? await evmEscrow.reviewListing(net, booking.chainBookingId, rating, comment) : await evmEscrow.reviewGuest(net, booking.chainBookingId, rating, comment);
      }
      await api.post("/reviews", { bookingId: booking.id, target: role === "guest" ? "listing" : "guest", rating, comment, txHash, ...(role === "guest" ? cats : {}) });
      toast.success("Thanks for your review!");
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={role === "guest" ? "Review your stay" : `Review ${booking.guest.firstName}`} size="md">
      <div className="space-y-4 p-6">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="text-center">
          <p className="mb-3 font-semibold">{role === "guest" ? "How was your stay overall?" : "How was this guest?"}</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
                <Star className={clsx("h-9 w-9 transition", n <= rating ? "fill-brand text-brand" : "text-ink-line hover:text-ink-muted")} />
              </button>
            ))}
          </div>
        </div>
        {role === "guest" && (
          <div className="rounded-xl bg-ink-bg px-4 py-2">
            {(
              [
                ["cleanliness", "Cleanliness"],
                ["accuracy", "Accuracy"],
                ["checkin", "Check-in"],
                ["communication", "Communication"],
                ["location", "Location"],
                ["value", "Value"],
              ] as const
            ).map(([k, label]) => (
              <StarInput key={k} label={label} value={cats[k]} onChange={(v) => setCats({ ...cats, [k]: v })} />
            ))}
          </div>
        )}
        <Textarea rows={5} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={role === "guest" ? "What did you love? Anything future guests should know?" : "How was communication, respect of house rules, cleanliness?"} />
        {net?.chain === "evm" && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={onChain} onChange={(e) => setOnChain(e.target.checked)} className="h-4 w-4 accent-ink" />
            Also record my rating on-chain (small gas fee, tamper-proof)
          </label>
        )}
        <Button full onClick={submit} loading={busy} disabled={comment.trim().length < 10}>
          Submit review
        </Button>
      </div>
    </Modal>
  );
}

function useNet(booking?: Booking) {
  const { data: meta } = useMeta();
  return meta?.networks.find((n) => n.id === booking?.network);
}

export default function BookingDetail({ id, role }: { id: string; role: Role }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { fmt } = useCurrency();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["booking", id], queryFn: () => api.get<{ booking: Booking }>(`/bookings/${id}`) });
  const booking = data?.booking;
  const net = useNet(booking);
  const { data: listingData } = useQuery({
    queryKey: ["listing", booking?.listing.id],
    queryFn: () => api.get<{ listing: Listing }>(`/listings/${booking!.listing.id}`),
    enabled: !!booking,
  });
  const chainListingId = listingData?.listing.chains.find((c) => c.network === booking?.network)?.chainListingId || "";

  const [modal, setModal] = useState<"cancel" | "dispute" | "review" | "release" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refundPct, setRefundPct] = useState<number | null>(null);

  useEffect(() => {
    if (params.get("review") && booking && !booking.reviewed && ["completed", "resolved"].includes(booking.status)) setModal("review");
  }, [params, booking]);

  useEffect(() => {
    if (modal === "cancel" && booking && net && role === "guest") refundPreview(net, booking).then(setRefundPct).catch(() => setRefundPct(null));
  }, [modal, booking, net, role]);

  if (isLoading) return <PageLoader />;
  if (!booking) return <Container className="py-24 text-center">Reservation not found.</Container>;

  const today = todayDay();
  const other = role === "guest" ? booking.host : booking.guest;
  const beforeCheckIn = today < booking.checkInDay || (today === booking.checkInDay && new Date().getUTCHours() < 15);
  const disputeOpen = booking.status === "confirmed" && Date.now() < booking.checkInDay * 86_400_000 + 39 * 3_600_000;
  const releasable = booking.status === "confirmed" && (role === "guest" || Date.now() >= booking.checkInDay * 86_400_000 + 39 * 3_600_000);
  const policy = POLICY_TEXT[booking.listing.cancellationPolicy];

  const run = async (action: "cancelByGuest" | "cancelByHost" | "release" | "openDispute" | "accept") => {
    if (!net && action !== "accept") return setError("This network isn't available in the app configuration.");
    setBusy(action);
    setError(null);
    try {
      if (action === "accept") {
        await api.post(`/bookings/${booking.id}/accept`);
        toast.success("Request accepted – the guest has been notified");
      } else {
        const txHash = await bookingAction(net!, booking, action, chainListingId, reason);
        await api.post(`/bookings/${booking.id}/sync`, { txHash, reason: action === "openDispute" ? reason : undefined });
        toast.success(
          {
            cancelByGuest: "Reservation cancelled – refund sent to your wallet",
            cancelByHost: booking.status === "pending_host" ? "Request declined – the guest was refunded" : "Reservation cancelled – the guest was refunded",
            release: "Payment released to the host",
            openDispute: "Issue reported – payout is on hold",
          }[action]
        );
      }
      setModal(null);
      await refetch();
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["hosting-bookings"] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success("Copied"));

  return (
    <Container className="pb-24 pt-8">
      <button type="button" onClick={() => navigate(role === "guest" ? "/trips" : "/hosting/reservations")} className="mb-6 flex items-center gap-1 text-sm font-semibold hover:underline print:hidden">
        <ChevronLeft className="h-4 w-4" /> {role === "guest" ? "All trips" : "All reservations"}
      </button>
      <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-2xl">
            <Img src={booking.listing.photo} alt={booking.listing.title} seed={booking.listing.id} className="h-[260px] w-full sm:h-[340px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 text-white">
              <StatusBadge status={booking.status} />
              <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{role === "guest" ? `Your stay in ${booking.listing.city}` : `${booking.guest.firstName}'s stay`}</h1>
              <Link to={`/rooms/${booking.listing.id}`} className="text-white/90 hover:underline">
                {booking.listing.title}
              </Link>
            </div>
          </div>

          {error && (
            <Alert tone="error" className="mt-6">
              {error}
            </Alert>
          )}
          {booking.status === "pending_host" && role === "guest" && (
            <Alert tone="warn" className="mt-6">
              Waiting for {booking.host.firstName} to accept. Your {booking.amountNative} is locked in escrow and will be refunded in full if the request is declined.
            </Alert>
          )}
          {booking.status === "disputed" && (
            <Alert tone="error" className="mt-6">
              An issue was reported. The escrow payout is frozen until the Tourisme arbiter settles the case on-chain. Share details and photos in the conversation.
            </Alert>
          )}

          <div className="mt-8 grid grid-cols-2 divide-x divide-ink-faint rounded-2xl border border-ink-faint">
            <div className="p-5">
              <div className="text-sm text-ink-muted">Check-in</div>
              <div className="text-lg font-semibold">{longDate(booking.checkIn)}</div>
              <div className="text-sm">After {booking.listing.checkInTime}</div>
            </div>
            <div className="p-5">
              <div className="text-sm text-ink-muted">Checkout</div>
              <div className="text-lg font-semibold">{longDate(booking.checkOut)}</div>
              <div className="text-sm">Before {booking.listing.checkOutTime}</div>
            </div>
          </div>

          <div className="mt-8 space-y-6">
            <div className="flex gap-4">
              <MapPin className="h-6 w-6 shrink-0" />
              <div>
                <div className="font-semibold">Address</div>
                {booking.listing.address ? (
                  <>
                    <p>{booking.listing.address}</p>
                    <a className="text-sm font-semibold underline" href={`https://www.google.com/maps/dir/?api=1&destination=${booking.listing.lat},${booking.listing.lng}`} target="_blank" rel="noreferrer">
                      Get directions
                    </a>
                  </>
                ) : (
                  <p className="text-ink-muted">Shared once the reservation is confirmed.</p>
                )}
              </div>
            </div>
            <div className="flex gap-4">
              <Users className="h-6 w-6 shrink-0" />
              <div>
                <div className="font-semibold">Who's coming</div>
                <p>
                  {booking.guests} guest{booking.guests > 1 ? "s" : ""} · {booking.nights} night{booking.nights > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <KeyRound className="h-6 w-6 shrink-0" />
              <div>
                <div className="font-semibold">Confirmation code</div>
                <button type="button" onClick={() => copy(booking.code)} className="flex items-center gap-2 font-mono">
                  {booking.code} <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex gap-4">
              <CalendarDays className="h-6 w-6 shrink-0" />
              <div>
                <div className="font-semibold">Cancellation policy · {policy.label}</div>
                <p className="text-ink-soft">{policy.long}</p>
              </div>
            </div>
          </div>

          {booking.listing.address && (
            <div className="mt-8 h-[280px] overflow-hidden rounded-2xl print:hidden">
              <LocationMap lat={booking.listing.lat} lng={booking.listing.lng} exact />
            </div>
          )}

          {booking.message && (
            <div className="mt-8 rounded-2xl bg-ink-bg p-5">
              <div className="mb-1 text-sm font-semibold">Message from {booking.guest.firstName}</div>
              <p className="italic text-ink-soft">“{booking.message}”</p>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-ink-faint p-6">
            <div className="flex items-center gap-4">
              <Avatar src={other.avatarUrl} name={other.firstName} size={56} />
              <div className="flex-1">
                <div className="text-sm text-ink-muted">{role === "guest" ? "Your host" : "Guest"}</div>
                <Link to={`/users/${other.id}`} className="text-lg font-semibold hover:underline">
                  {other.name}
                </Link>
              </div>
            </div>
            {booking.conversationId && (
              <Button variant="outline" full className="mt-5" onClick={() => navigate(`/messages/${booking.conversationId}`)}>
                <MessageCircle className="h-4 w-4" /> Message {other.firstName}
              </Button>
            )}
          </div>

          <div className="rounded-2xl border border-ink-faint p-6">
            <h3 className="mb-4 text-lg font-semibold">Payment</h3>
            <div className="space-y-2.5 text-[15px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">Stay (incl. cleaning)</span>
                <span>{fmt(booking.subtotalUsd)}</span>
              </div>
              {role === "guest" ? (
                <div className="flex justify-between">
                  <span className="text-ink-muted">Service fee</span>
                  <span>{fmt(booking.feeUsd)}</span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-ink-muted">Host fee (3%)</span>
                  <span>−{fmt(booking.subtotalUsd - booking.hostPayoutUsd)}</span>
                </div>
              )}
              <Divider />
              <div className="flex justify-between font-semibold">
                <span>{role === "guest" ? "Total paid" : "Your payout"}</span>
                <span>{fmt(role === "guest" ? booking.totalUsd : booking.hostPayoutUsd)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-ink-bg px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <ChainIcon chain={booking.chain} /> {booking.networkName}
                </span>
                <span className="font-semibold">{booking.amountNative}</span>
              </div>
              {booking.payerAddress && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink-muted">
                    <Wallet className="h-4 w-4" /> Paid from
                  </span>
                  <span className="font-mono">{shortAddress(booking.payerAddress)}</span>
                </div>
              )}
              {booking.txUrl && (
                <a href={booking.txUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm font-semibold underline">
                  Escrow transaction <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                {booking.status === "completed"
                  ? "Escrow released to the host."
                  : booking.status === "resolved"
                    ? "Dispute settled on-chain by the arbiter."
                    : ["cancelled_by_guest", "cancelled_by_host", "declined"].includes(booking.status)
                      ? "Escrow closed – refunds were paid according to the policy."
                      : "Funds held in escrow until 24h after check-in."}
              </div>
            </div>
          </div>

          <div className="space-y-3 print:hidden">
            {role === "host" && booking.status === "pending_host" && (
              <>
                <Button full onClick={() => run("accept")} loading={busy === "accept"}>
                  <Check className="h-4 w-4" /> Accept request
                </Button>
                <Button variant="outline" full onClick={() => setModal("cancel")}>
                  Decline (refund guest)
                </Button>
              </>
            )}
            {role === "guest" && ["confirmed", "pending_host"].includes(booking.status) && beforeCheckIn && (
              <Button variant="outline" full onClick={() => setModal("cancel")}>
                {booking.status === "pending_host" ? "Cancel request" : "Cancel reservation"}
              </Button>
            )}
            {role === "host" && booking.status === "confirmed" && beforeCheckIn && (
              <Button variant="outline" full onClick={() => setModal("cancel")}>
                Cancel reservation
              </Button>
            )}
            {role === "guest" && disputeOpen && !beforeCheckIn && (
              <Button full onClick={() => setModal("release")}>
                Everything's great – release payment
              </Button>
            )}
            {releasable && role === "host" && (
              <Button full onClick={() => run("release")} loading={busy === "release"}>
                Claim payout
              </Button>
            )}
            {role === "guest" && disputeOpen && today >= booking.checkInDay && (
              <Button variant="danger" full onClick={() => setModal("dispute")}>
                <AlertTriangle className="h-4 w-4" /> Report a problem
              </Button>
            )}
            {["completed", "resolved"].includes(booking.status) && (role === "guest" ? !booking.reviewed : !booking.guestReviewed) && (
              <Button full onClick={() => setModal("review")}>
                <Star className="h-4 w-4" /> Write a review
              </Button>
            )}
            <Button variant="ghost" full onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print receipt
            </Button>
          </div>
        </aside>
      </div>

      <Modal open={modal === "cancel"} onClose={() => setModal(null)} title={role === "host" && booking.status === "pending_host" ? "Decline request" : "Cancel reservation"} size="sm">
        <div className="space-y-4 p-6">
          {role === "guest" ? (
            <>
              <p>
                Based on the <b>{policy.label.toLowerCase()}</b> policy, you'll get back{" "}
                <b>{booking.status === "pending_host" ? "100%" : refundPct != null ? `${refundPct}%` : "the refundable amount"}</b> of {booking.amountNative}. The refund is sent straight to your wallet by the escrow contract.
              </p>
              {refundPct === 0 && <Alert tone="warn">This reservation is no longer refundable. The host will receive the payment.</Alert>}
            </>
          ) : (
            <p>
              {booking.guest.firstName} will be refunded <b>100%</b> ({booking.amountNative}) by the escrow contract.{" "}
              {booking.status === "confirmed" && "Host cancellations are recorded on-chain and can affect your Superhost status."}
            </p>
          )}
          <Button variant="dark" full loading={!!busy} onClick={() => run(role === "guest" ? "cancelByGuest" : "cancelByHost")}>
            {role === "host" && booking.status === "pending_host" ? "Decline and refund" : "Confirm cancellation"}
          </Button>
        </div>
      </Modal>
      <Modal open={modal === "release"} onClose={() => setModal(null)} title="Release payment" size="sm">
        <div className="space-y-4 p-6">
          <p>Happy with your stay? Releasing now sends {fmt(booking.hostPayoutUsd)} to {booking.host.firstName} immediately. You won't be able to report a problem afterwards.</p>
          <Button full loading={busy === "release"} onClick={() => run("release")}>
            Release to host
          </Button>
        </div>
      </Modal>
      <Modal open={modal === "dispute"} onClose={() => setModal(null)} title="Report a problem" size="md">
        <div className="space-y-4 p-6">
          <p className="text-ink-soft">Tell us what's wrong. The payout to the host is frozen while the independent arbiter reviews your case, and they can refund you partially or fully.</p>
          <Textarea rows={5} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No hot water since arrival and the host isn't responding." />
          <Button variant="dark" full loading={busy === "openDispute"} disabled={reason.trim().length < 10} onClick={() => run("openDispute")}>
            Submit report
          </Button>
        </div>
      </Modal>
      <ReviewModal booking={booking} role={role} net={net} open={modal === "review"} onClose={() => setModal(null)} onDone={() => (setModal(null), refetch())} />
    </Container>
  );
}
