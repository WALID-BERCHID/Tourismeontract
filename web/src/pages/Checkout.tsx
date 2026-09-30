import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronLeft, Droplets, Loader2, ShieldCheck, Star, Wallet } from "lucide-react";
import { ApiError, api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCurrency } from "../lib/currency";
import { useMeta, useTitle } from "../lib/hooks";
import { POLICY_TEXT, dateRange, fromDay, nightsBetween, shortAddress, toDay, todayDay } from "../lib/format";
import type { Booking, Listing, Network, Quote } from "../lib/types";
import { balanceOf, connectWallet, errorMessage, fmtToken, pay, quote as cryptoQuote, type PayStep } from "../lib/payments";
import { evmFaucet } from "../lib/chains/evm";
import DateRangePicker from "../components/DateRangePicker";
import { ChainIcon } from "../components/icons";
import { Alert, Button, Container, Counter, Divider, Img, Modal, PageLoader, Textarea } from "../components/ui";

type Stage = "idle" | "approve" | "pay" | "confirming" | "registering" | "done" | "error";

const STEPS: { id: Stage; label: string }[] = [
  { id: "approve", label: "Approve token spending" },
  { id: "pay", label: "Confirm payment in your wallet" },
  { id: "confirming", label: "Waiting for block confirmation" },
  { id: "registering", label: "Verifying escrow & confirming reservation" },
];

export default function Checkout() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, openAuth, linkWallet, setUser } = useAuth();
  const { fmt } = useCurrency();
  const { data: meta } = useMeta();

  const checkIn = params.get("checkIn");
  const checkOut = params.get("checkOut");
  const adults = Number(params.get("adults") || 1);
  const children = Number(params.get("children") || 0);
  const nights = nightsBetween(checkIn, checkOut);

  const { data, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api.get<{ listing: Listing; networks: { chain: string; network: string; name: string; chainListingId: string }[] }>(`/listings/${id}`),
  });
  const listing = data?.listing;
  useTitle(listing?.instantBook === false ? "Request to book" : "Confirm and pay");

  const { data: quoteRes } = useQuery({
    queryKey: ["quote", id, checkIn, checkOut],
    queryFn: () => api.get<{ available: boolean; error: string | null; quote: Quote | null }>(`/listings/${id}/quote${qs({ checkIn, checkOut })}`),
    enabled: !!checkIn && !!checkOut,
  });

  const networks = useMemo(() => {
    if (!listing || !meta) return [] as (Network & { chainListingId: string })[];
    return listing.chains.flatMap((c) => {
      const n = meta.networks.find((m) => m.id === c.network);
      return n ? [{ ...n, chainListingId: c.chainListingId }] : [];
    });
  }, [listing, meta]);

  const [netId, setNetId] = useState<string | null>(null);
  const net = networks.find((n) => n.id === netId) || networks[0];
  const [token, setToken] = useState<string | null>(null);
  const tokenAddr = net?.chain === "evm" ? token || net.tokens.find((t) => t.symbol === "USDC")?.address || net.tokens[0].address! : net?.tokens[0].symbol || "";

  const [address, setAddress] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [editDates, setEditDates] = useState(false);
  const [editGuests, setEditGuests] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);

  useEffect(() => {
    setAddress(null);
  }, [net?.chain]);

  const ciDay = checkIn ? toDay(checkIn) : 0;
  const coDay = checkOut ? toDay(checkOut) : 0;

  const { data: crypto, error: quoteError, isFetching: quoting } = useQuery({
    queryKey: ["crypto-quote", net?.id, net?.chainListingId, ciDay, coDay, tokenAddr],
    queryFn: () => cryptoQuote(net!, net!.chainListingId, ciDay, coDay, tokenAddr),
    enabled: !!net && nights > 0,
    retry: 1,
  });

  const { data: balance, refetch: refetchBalance } = useQuery({
    queryKey: ["balance", net?.id, tokenAddr, address],
    queryFn: () => balanceOf(net!, tokenAddr, address!),
    enabled: !!net && !!address,
  });

  const linked = !!address && !!user?.wallets.some((w) => w.chain === net?.chain && w.address.toLowerCase() === address.toLowerCase());
  const insufficient = balance != null && crypto != null && balance < crypto.total;
  const { data: calendar } = useQuery({
    queryKey: ["calendar", id, net?.id],
    queryFn: () => api.get<{ occupiedDays: number[] }>(`/listings/${id}/calendar${qs({ network: net?.id })}`),
    enabled: !!listing,
  });
  const occupied = useMemo(() => new Set<number>(calendar?.occupiedDays || []), [calendar]);

  if (isLoading || !meta) return <PageLoader />;
  if (!listing) return <Container className="py-24 text-center">Listing not found.</Container>;
  if (!checkIn || !checkOut || nights <= 0) {
    return (
      <Container className="py-24 text-center">
        <h1 className="text-2xl font-semibold">Choose your dates first</h1>
        <Link to={`/rooms/${listing.id}`} className="mt-4 inline-block font-semibold underline">
          Back to listing
        </Link>
      </Container>
    );
  }

  const policy = POLICY_TEXT[listing.cancellationPolicy || "flexible"];
  const q = quoteRes?.quote;
  const requestMode = !listing.instantBook;
  const freeCancelUntil =
    listing.cancellationPolicy === "flexible" ? fromDay(ciDay - 1) : listing.cancellationPolicy === "moderate" ? fromDay(ciDay - 5) : ciDay - todayDay() >= 14 ? fromDay(Math.min(todayDay() + 2, ciDay - 14)) : null;

  const connect = async () => {
    setError(null);
    try {
      const a = await connectWallet(net!);
      setAddress(a);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const verify = async () => {
    setError(null);
    try {
      if (net!.chain === "eos") {
        const r = await api.post<{ user: typeof user }>("/users/me/wallets", { chain: "eos", address });
        if (r.user) setUser(r.user);
      } else {
        const a = await linkWallet(net!.chain as "evm" | "solana");
        setAddress(a);
      }
      toast.success("Wallet verified");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : errorMessage(e));
    }
  };

  const submit = async () => {
    if (!crypto || !net) return;
    setError(null);
    let txHash: string | null = null;
    try {
      const res = await pay(net, { chainListingId: net.chainListingId, checkIn: ciDay, checkOut: coDay, quote: crypto }, (s: PayStep) => setStage(s));
      txHash = res.txHash;
      setStage("registering");
      const payer = res.payer || address!;
      // The backend verifies the transaction on-chain; retry briefly while RPC nodes catch up.
      let created: { booking: Booking } | null = null;
      for (let attempt = 0; attempt < 6 && !created; attempt++) {
        try {
          created = await api.post<{ booking: Booking }>("/bookings", {
            listingId: listing.id,
            network: net.id,
            txHash,
            payerAddress: payer,
            checkIn,
            checkOut,
            guests: adults + children,
            message,
          });
        } catch (e) {
          if (e instanceof ApiError && e.status === 409 && /not found yet|wait/i.test(e.message)) await new Promise((r) => setTimeout(r, 2500));
          else throw e;
        }
      }
      if (!created) throw new Error("The payment went through but confirmation is taking longer than usual. It will appear in your trips shortly.");
      setBooking(created.booking);
      setStage("done");
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (e) {
      setStage("error");
      const msg = e instanceof ApiError ? e.message : errorMessage(e);
      setError(txHash ? `${msg} (transaction ${shortAddress(txHash)})` : msg);
    }
  };

  const busy = ["approve", "pay", "confirming", "registering"].includes(stage);
  const canPay = !!user && !!address && linked && !!crypto && !insufficient && quoteRes?.available !== false && (!requestMode || message.trim().length > 0);

  return (
    <Container className="pb-24 pt-8 sm:pt-12">
      <div className="mb-8 flex items-center gap-4">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink-bg">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[28px] font-semibold sm:text-[32px]">{requestMode ? "Request to book" : "Confirm and pay"}</h1>
      </div>

      <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-24">
        <div className="min-w-0">
          {requestMode && (
            <div className="mb-8 flex items-start justify-between gap-6 rounded-xl border border-ink-line p-6">
              <div>
                <div className="font-semibold">This is a rare find.</div>
                <p className="text-ink-muted">The host will review your request within 24 hours. Your payment is locked in escrow meanwhile and refunded in full if they decline.</p>
              </div>
              <span className="text-3xl">💎</span>
            </div>
          )}

          <section>
            <h2 className="mb-6 text-[22px] font-semibold">Your trip</h2>
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">Dates</div>
                <div>{dateRange(checkIn, checkOut)}</div>
              </div>
              <button type="button" className="font-semibold underline" onClick={() => setEditDates(true)} disabled={busy}>
                Edit
              </button>
            </div>
            <div className="mt-6 flex justify-between">
              <div>
                <div className="font-semibold">Guests</div>
                <div>
                  {adults + children} guest{adults + children > 1 ? "s" : ""}
                </div>
              </div>
              <button type="button" className="font-semibold underline" onClick={() => setEditGuests(true)} disabled={busy}>
                Edit
              </button>
            </div>
          </section>

          <Divider className="my-8" />

          {!user ? (
            <section>
              <h2 className="mb-4 text-[22px] font-semibold">Log in or sign up to book</h2>
              <p className="mb-6 text-ink-muted">Use your email or connect a wallet – signing in with a wallet costs no gas.</p>
              <Button size="lg" onClick={() => openAuth("login")}>
                Continue
              </Button>
            </section>
          ) : (
            <>
              <section>
                <h2 className="mb-2 text-[22px] font-semibold">Pay with</h2>
                <p className="mb-5 text-sm text-ink-muted">Choose the blockchain and currency for your escrow payment.</p>
                {networks.length === 0 ? (
                  <Alert tone="warn">This host hasn't enabled on-chain payments yet. Message them to ask when they'll be bookable.</Alert>
                ) : (
                  <div className="space-y-3">
                    {networks.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        disabled={busy}
                        onClick={() => (setNetId(n.id), setToken(null))}
                        className={clsx("flex w-full items-center gap-4 rounded-xl border p-4 text-left transition", n.id === net?.id ? "border-ink ring-1 ring-ink" : "border-ink-line hover:border-ink")}
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-bg">
                          <ChainIcon chain={n.chain} className="h-5 w-5" />
                        </span>
                        <span className="flex-1">
                          <span className="block font-semibold">{n.name}</span>
                          <span className="block text-sm text-ink-muted">{n.tokens.map((t) => t.symbol).join(" · ")} {n.testnet && "· test network"}</span>
                        </span>
                        <span className={clsx("h-5 w-5 rounded-full border-2", n.id === net?.id ? "border-[6px] border-ink" : "border-ink-line")} />
                      </button>
                    ))}
                  </div>
                )}
                {net?.chain === "evm" && net.tokens.length > 1 && (
                  <div className="mt-5 flex gap-2">
                    {net.tokens.map((t) => (
                      <button
                        key={t.symbol}
                        type="button"
                        disabled={busy}
                        onClick={() => setToken(t.address!)}
                        className={clsx("rounded-full border px-5 py-2 text-sm font-semibold transition", tokenAddr === t.address ? "border-ink bg-ink text-white" : "border-ink-line hover:border-ink")}
                      >
                        {t.symbol}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {net && (
                <section className="mt-8 rounded-xl bg-ink-bg p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Wallet className="h-5 w-5" />
                      <div>
                        <div className="font-semibold">{address ? shortAddress(address) : "Wallet not connected"}</div>
                        <div className="text-sm text-ink-muted">
                          {address
                            ? balance != null
                              ? `Balance: ${fmtToken(balance, crypto?.decimals ?? 18, crypto?.symbol ?? "")}`
                              : linked
                                ? "Verified on your account"
                                : "Verify ownership to pay with this wallet"
                            : net.chain === "evm"
                              ? "MetaMask, Rabby, Coinbase Wallet…"
                              : net.chain === "solana"
                                ? "Phantom, Solflare…"
                                : "Anchor wallet"}
                        </div>
                      </div>
                    </div>
                    {!address ? (
                      <Button variant="dark" size="sm" onClick={connect}>
                        Connect
                      </Button>
                    ) : !linked ? (
                      <Button variant="dark" size="sm" onClick={verify}>
                        Verify wallet
                      </Button>
                    ) : (
                      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    )}
                  </div>
                  {insufficient && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm">
                      <span className="flex items-center gap-2 text-amber-700">
                        <AlertTriangle className="h-4 w-4" /> Not enough {crypto?.symbol} for this payment.
                      </span>
                      {net.testnet && crypto?.symbol === "USDC" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await evmFaucet(net);
                              toast.success("10,000 test USDC added");
                              refetchBalance();
                            } catch (e) {
                              toast.error(errorMessage(e));
                            }
                          }}
                        >
                          <Droplets className="h-4 w-4" /> Get test USDC
                        </Button>
                      )}
                    </div>
                  )}
                </section>
              )}

              <Divider className="my-8" />
              <section>
                <h2 className="mb-2 text-[22px] font-semibold">{requestMode ? "Message the host" : "Say hello to your host"}</h2>
                <p className="mb-4 text-ink-muted">
                  {requestMode ? "Required: tell the host a little about your trip and who's coming." : "Share why you're traveling, who's coming with you and what you love about the space."}
                </p>
                <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi! We're a couple celebrating our anniversary and can't wait to…" disabled={busy} />
              </section>
            </>
          )}

          <Divider className="my-8" />
          <section>
            <h2 className="mb-4 text-[22px] font-semibold">Cancellation policy</h2>
            <p>
              {freeCancelUntil && freeCancelUntil > fromDay(todayDay()) ? (
                <>
                  <b>Free cancellation before {dateRange(freeCancelUntil, freeCancelUntil).split(" –")[0]}.</b>{" "}
                </>
              ) : null}
              {policy.long} <Link to="/help#cancellation" className="font-semibold underline">Learn more</Link>
            </p>
          </section>
          <Divider className="my-8" />
          <section>
            <h2 className="mb-4 text-[22px] font-semibold">Ground rules</h2>
            <p className="mb-2">We ask every guest to remember a few simple things about what makes a great guest.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Follow the house rules</li>
              <li>Treat your host's home like your own</li>
            </ul>
          </section>
          <Divider className="my-8" />

          {error && (
            <Alert tone="error" className="mb-6">
              {error}
            </Alert>
          )}
          {quoteError && (
            <Alert tone="warn" className="mb-6">
              Couldn't fetch the on-chain price from {net?.name}: {errorMessage(quoteError)}
            </Alert>
          )}
          <p className="mb-6 text-xs leading-relaxed text-ink-muted">
            By selecting the button below, I agree to the Host's House Rules, Ground rules for guests, and that Tourisme's escrow contract will {requestMode ? "hold my payment until the host responds and then " : ""}release funds to the host
            24 hours after check-in unless I report an issue. Refunds follow the cancellation policy and are executed by the smart contract.
          </p>
          <Button size="lg" className="w-full sm:w-auto sm:px-10" disabled={!canPay || busy} loading={busy} onClick={submit}>
            {requestMode ? "Request to book" : "Confirm and pay"}
            {crypto && canPay ? ` · ${crypto.display}` : ""}
          </Button>
          {user && !canPay && !busy && (
            <p className="mt-3 text-sm text-ink-muted">
              {!address ? "Connect a wallet to continue." : !linked ? "Verify your wallet to continue." : insufficient ? "Top up your wallet to continue." : requestMode && !message.trim() ? "Write a message to the host to continue." : quoting ? "Fetching on-chain price…" : ""}
            </p>
          )}
        </div>

        {/* Summary */}
        <aside>
          <div className="sticky top-28 rounded-xl border border-ink-line p-6">
            <div className="flex gap-4">
              <Img src={listing.photos[0]} alt={listing.title} seed={listing.id} className="h-[106px] w-[124px] shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-col justify-between">
                <div>
                  <div className="text-xs text-ink-muted">
                    {listing.propertyType} in {listing.city}
                  </div>
                  <div className="line-clamp-2 text-sm">{listing.title}</div>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <Star className="h-3 w-3 fill-current" /> {listing.rating?.toFixed(2) ?? "New"} {listing.reviewCount > 0 && <span className="text-ink-muted">({listing.reviewCount} reviews)</span>}
                </div>
              </div>
            </div>
            <Divider className="my-6" />
            <h3 className="mb-4 text-[22px] font-semibold">Price details</h3>
            {q ? (
              <div className="space-y-3 text-[15px]">
                <div className="flex justify-between">
                  <span>
                    {fmt(q.nightly)} x {nights} night{nights > 1 ? "s" : ""}
                  </span>
                  <span>{fmt(q.base)}</span>
                </div>
                {q.cleaningFee > 0 && (
                  <div className="flex justify-between">
                    <span>Cleaning fee</span>
                    <span>{fmt(q.cleaningFee)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Tourisme service fee</span>
                  <span>{fmt(q.serviceFee)}</span>
                </div>
                <Divider />
                <div className="flex justify-between font-semibold">
                  <span>Total (USD)</span>
                  <span>{fmt(q.total)}</span>
                </div>
                <div className="flex justify-between rounded-lg bg-ink-bg px-3 py-2.5 font-semibold">
                  <span className="flex items-center gap-2">{net && <ChainIcon chain={net.chain} />} You pay</span>
                  <span>{quoting ? <Loader2 className="h-4 w-4 animate-spin" /> : crypto?.display ?? "—"}</span>
                </div>
                {crypto?.symbol !== "USDC" && crypto && <p className="text-xs text-ink-muted">Native-coin prices are set by the host on-chain and may differ slightly from the USD estimate.</p>}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">{quoteRes?.error || "Loading…"}</p>
            )}
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Funds are held by the escrow smart contract – not by us, not by the host – until 24 hours after check-in.</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Progress / success */}
      <Modal open={stage !== "idle" && stage !== "error"} onClose={() => stage === "done" && navigate(`/trips/${booking?.id}`)} title={stage === "done" ? undefined : "Processing payment"} size="sm">
        {stage === "done" && booking ? (
          <div className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-semibold">{booking.status === "pending_host" ? "Request sent!" : "You're going to " + listing.city + "!"}</h2>
            <p className="mt-2 text-ink-muted">
              {booking.status === "pending_host" ? `${booking.host.firstName} will reply within 24 hours. ` : "Your reservation is confirmed. "}
              Confirmation code <b className="text-ink">{booking.code}</b>. We've emailed you the details.
            </p>
            {booking.txUrl && (
              <a href={booking.txUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold underline">
                View escrow transaction ↗
              </a>
            )}
            <Button full className="mt-6" onClick={() => navigate(`/trips/${booking.id}`)}>
              View trip
            </Button>
          </div>
        ) : (
          <div className="space-y-4 p-8">
            {STEPS.filter((s) => s.id !== "approve" || crypto?.symbol === "USDC" || stage === "approve").map((s) => {
              const order = STEPS.findIndex((x) => x.id === stage);
              const idx = STEPS.findIndex((x) => x.id === s.id);
              const state = idx < order ? "done" : idx === order ? "active" : "todo";
              return (
                <div key={s.id} className="flex items-center gap-3">
                  {state === "done" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : state === "active" ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="h-5 w-5 rounded-full border-2 border-ink-line" />}
                  <span className={clsx(state === "todo" && "text-ink-muted", state === "active" && "font-semibold")}>{s.label}</span>
                </div>
              );
            })}
            <p className="pt-2 text-xs text-ink-muted">Keep this window open. Your wallet may ask you to confirm.</p>
          </div>
        )}
      </Modal>

      <Modal open={editDates} onClose={() => setEditDates(false)} title="Change dates" size="lg">
        <div className="p-6">
          <DateRangePicker
            checkIn={checkIn}
            checkOut={checkOut}
            occupied={occupied}
            minNights={listing.minNights}
            maxNights={listing.maxNights}
            onChange={(a, b) => {
              if (a && b) {
                const next = new URLSearchParams(params);
                next.set("checkIn", a);
                next.set("checkOut", b);
                setParams(next, { replace: true });
                setEditDates(false);
              }
            }}
          />
        </div>
      </Modal>
      <Modal open={editGuests} onClose={() => setEditGuests(false)} title="Guests" size="sm" footer={<Button full variant="dark" onClick={() => setEditGuests(false)}>Save</Button>}>
        <div className="px-6">
          <Counter label="Adults" value={adults} min={1} max={listing.guests - children} onChange={(v) => (params.set("adults", String(v)), setParams(params, { replace: true }))} />
          <Counter label="Children" value={children} max={listing.guests - adults} onChange={(v) => (params.set("children", String(v)), setParams(params, { replace: true }))} />
        </div>
      </Modal>
    </Container>
  );
}
