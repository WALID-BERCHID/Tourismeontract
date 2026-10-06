import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { toast } from "sonner";
import { CalendarCheck, Check, Clock, Globe2, Grid3x3, KeyRound, MapPin, Medal, Share, ShieldCheck, Star, Users, Zap } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCurrency } from "../lib/currency";
import { useTitle } from "../lib/hooks";
import { POLICY_TEXT, fromDay, longDate, toDay, yearsSince } from "../lib/format";
import type { Listing, Quote, Review, User } from "../lib/types";
import { LocationMap } from "../components/MapView";
import { HeartButton } from "../components/ListingCard";
import { durationLabel } from "../components/ExperienceCard";
import SingleDatePicker from "../components/SingleDatePicker";
import { ChainIcon } from "../components/icons";
import { Avatar, Button, Container, Counter, Divider, Img, Modal, PageLoader } from "../components/ui";
import { ContactHost, Gallery, RatingSummary, ReviewCard } from "./ListingPage";

interface ListingResponse {
  listing: Listing;
  host: User;
  reviews: Review[];
  occupiedDays: number[];
  networks: { chain: "evm" | "solana" | "eos"; network: string; name: string }[];
}

function BookingCard({ listing, occupied, date, setDate, guests, setGuests }: { listing: Listing; occupied: Set<number>; date: string | null; setDate: (d: string | null) => void; guests: number; setGuests: (n: number) => void }) {
  const { fmt } = useCurrency();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showCal, setShowCal] = useState(!date);
  const checkOut = date ? fromDay(toDay(date) + 1) : null;
  const { data: quote } = useQuery({
    queryKey: ["quote", listing.id, date, checkOut],
    queryFn: () => api.get<{ available: boolean; error: string | null; quote: Quote | null }>(`/listings/${listing.id}/quote${qs({ checkIn: date, checkOut })}`),
    enabled: !!date,
  });
  const isOwner = user?.id === listing.hostId;
  const reserve = () => {
    if (!date) return setShowCal(true);
    navigate(`/book/${listing.id}${qs({ checkIn: date, checkOut, adults: guests })}`);
  };
  return (
    <div className="glass-strong border-gradient relative rounded-3xl p-6 shadow-card">
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <span className="font-mono text-[24px] font-semibold">{fmt(listing.priceUsd, false)}</span>
          <span className="ml-1 text-sm text-ink-muted">per group · up to {listing.guests}</span>
        </div>
        {listing.reviewCount > 0 && (
          <span className="flex items-center gap-1 text-sm">
            <Star className="h-3.5 w-3.5 fill-current" /> {listing.rating?.toFixed(2)}
          </span>
        )}
      </div>

      <button type="button" onClick={() => setShowCal((s) => !s)} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-canvas-2/60 px-4 py-3 text-left">
        <span>
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">Date</span>
          <span className={clsx("text-sm", !date && "text-ink-muted")}>{date ? longDate(date) : "Choose a date"}</span>
        </span>
        <span className="text-xs text-ink-muted">{listing.startTime ? `Starts ${listing.startTime}` : ""}</span>
      </button>
      {showCal && (
        <div className="mt-3 rounded-2xl border border-white/10 bg-canvas-2/60 p-4">
          <SingleDatePicker
            value={date}
            occupied={occupied}
            onChange={(d) => {
              setDate(d);
              if (d) setShowCal(false);
            }}
          />
        </div>
      )}
      <div className="mt-3 rounded-2xl border border-white/10 bg-canvas-2/60 px-4">
        <Counter label="Guests" sub={`Maximum ${listing.guests} for this private group`} value={guests} min={1} max={listing.guests} onChange={setGuests} />
      </div>

      {quote && !quote.available && date && <p className="mt-3 text-sm text-red-300">{quote.error}</p>}
      <Button full size="lg" className="mt-4" onClick={reserve} disabled={isOwner || (!!quote && !quote.available)}>
        {isOwner ? "This is your experience" : !date ? "Choose a date" : listing.instantBook ? "Reserve" : "Request to book"}
      </Button>
      {date && quote?.quote && (
        <div className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-soft">Private experience · {guests} guest{guests > 1 ? "s" : ""}</span>
            <span className="font-mono">{fmt(quote.quote.base)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Tourisme service fee</span>
            <span className="font-mono">{fmt(quote.quote.serviceFee)}</span>
          </div>
          <Divider />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="font-mono">{fmt(quote.quote.total)}</span>
          </div>
          <p className="text-xs text-ink-muted">≈ {fmt(quote.quote.total / guests)} per person</p>
        </div>
      )}
      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-ink-muted">
        <ShieldCheck className="h-4 w-4 text-brand-mint" /> Held in escrow · released the day after
      </div>
    </div>
  );
}

export default function ExperiencePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { fmt } = useCurrency();
  const [gallery, setGallery] = useState<number | null>(null);
  const [modal, setModal] = useState<"reviews" | null>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ["listing", id], queryFn: () => api.get<ListingResponse>(`/listings/${id}`) });
  const firstNetwork = data?.networks[0]?.network;
  const { data: calendar } = useQuery({
    queryKey: ["calendar", id, firstNetwork],
    queryFn: () => api.get<{ occupiedDays: number[] }>(`/listings/${id}/calendar${qs({ network: firstNetwork })}`),
    enabled: !!data,
  });
  const { data: allReviews } = useQuery({ queryKey: ["reviews", id], queryFn: () => api.get<{ reviews: Review[] }>(`/listings/${id}/reviews`), enabled: modal === "reviews" });
  useTitle(data?.listing.title);

  const occupied = useMemo(() => new Set(calendar?.occupiedDays || data?.occupiedDays || []), [calendar, data]);
  const date = params.get("date") || params.get("checkIn");
  const guests = Math.max(1, Number(params.get("guests") || params.get("adults") || 1));
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  };

  if (isLoading) return <PageLoader />;
  if (error || !data)
    return (
      <Container className="py-24 text-center">
        <h1 className="text-3xl font-semibold">This experience isn't available</h1>
        <p className="mt-2 text-ink-muted">It may have been unlisted by the host.</p>
        <Link to="/experiences" className="mt-6 inline-block font-semibold underline">
          Browse experiences
        </Link>
      </Container>
    );

  const { listing, host, reviews } = data;
  const policy = POLICY_TEXT[listing.cancellationPolicy || "flexible"];
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: listing.title, url: window.location.href });
      else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Link copied");
      }
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="pb-28 md:pb-0">
      <Container className="pt-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <span className="rounded-full bg-brand-gradient-soft px-2.5 py-1 text-brand">{listing.propertyType}</span>
              <span className="text-ink-muted">
                {listing.city}, {listing.country}
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold sm:text-[30px]">{listing.title}</h1>
          </div>
          <div className="flex gap-2 text-sm font-semibold">
            <button type="button" onClick={share} className="flex items-center gap-2 rounded-xl px-3 py-2 underline hover:bg-white/5">
              <Share className="h-4 w-4" /> Share
            </button>
            <span className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-white/5">
              <HeartButton listing={listing} className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:fill-transparent [&_svg]:text-ink" /> <span className="underline">Save</span>
            </span>
          </div>
        </div>

        <div className="relative grid h-[300px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-3xl sm:h-[420px] lg:h-[480px]">
          {listing.photos.slice(0, 3).map((p, i) => (
            <button key={i} type="button" onClick={() => setGallery(i)} className={clsx("group relative overflow-hidden", i === 0 ? "col-span-4 row-span-2 sm:col-span-3" : "hidden sm:block")}>
              <Img src={p} alt={`${listing.title} photo ${i + 1}`} seed={listing.id + i} className="h-full w-full transition duration-300 group-hover:brightness-90" />
            </button>
          ))}
          <button type="button" onClick={() => setGallery(0)} className="absolute bottom-5 right-5 flex items-center gap-2 rounded-xl border border-white/15 bg-canvas/70 px-4 py-1.5 text-sm font-semibold backdrop-blur hover:bg-canvas">
            <Grid3x3 className="h-4 w-4" /> All photos
          </button>
        </div>
        <Gallery listing={listing} open={gallery !== null} onClose={() => setGallery(null)} start={gallery || 0} />

        <div className="mt-8 grid gap-12 md:grid-cols-[1fr_minmax(0,390px)] lg:gap-20">
          <div className="min-w-0">
            {/* Key facts */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [Clock, "Duration", durationLabel(listing.durationHours) || "Flexible"],
                [Users, "Group size", `Up to ${listing.guests}`],
                [Globe2, "Languages", listing.languages.length ? listing.languages.join(", ") : "English"],
                [Zap, "Booking", listing.instantBook ? "Instant" : "Request"],
              ].map(([Icon, label, value]) => {
                const I = Icon as typeof Clock;
                return (
                  <div key={label as string} className="glass rounded-2xl p-4">
                    <I className="h-5 w-5 text-brand-mint" strokeWidth={1.8} />
                    <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label as string}</div>
                    <div className="truncate text-sm font-semibold" title={value as string}>
                      {value as string}
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="flex items-center gap-4 py-8">
              <Link to={`/users/${host.id}`} className="relative">
                <Avatar src={host.avatarUrl} name={host.firstName} size={48} />
                {host.isSuperhost && <Medal className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-surface p-0.5 text-brand" />}
              </Link>
              <div>
                <div className="font-semibold">Hosted by {host.firstName}</div>
                <div className="text-sm text-ink-muted">
                  {host.isSuperhost ? "Superhost · " : ""}
                  {yearsSince(host.joinedAt) || 1} year{yearsSince(host.joinedAt) > 1 ? "s" : ""} hosting
                  {listing.reviewCount > 0 && (
                    <>
                      {" "}
                      · <Star className="inline h-3.5 w-3.5 fill-current" /> {listing.rating?.toFixed(2)} ({listing.reviewCount})
                    </>
                  )}
                </div>
              </div>
            </section>
            <Divider />

            <section className="py-8">
              <h2 className="mb-4 font-display text-[22px] font-semibold">What you'll do</h2>
              <p className="whitespace-pre-line leading-relaxed text-ink-soft">{listing.description}</p>
            </section>
            <Divider />

            {listing.includes && listing.includes.length > 0 && (
              <>
                <section className="py-8">
                  <h2 className="mb-5 font-display text-[22px] font-semibold">What's included</h2>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {listing.includes.map((x) => (
                      <li key={x} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-mint/15 text-brand-mint">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        {x}
                      </li>
                    ))}
                  </ul>
                </section>
                <Divider />
              </>
            )}

            <section className="space-y-6 py-8">
              <div className="flex gap-5">
                <MapPin className="h-6 w-6 shrink-0 text-brand" />
                <div>
                  <div className="font-semibold">Meeting point</div>
                  <div className="text-sm text-ink-muted">{listing.meetingPoint || `${listing.neighborhood || listing.city} – exact spot shared after booking`}</div>
                </div>
              </div>
              <div className="flex gap-5">
                <CalendarCheck className="h-6 w-6 shrink-0 text-brand" />
                <div>
                  <div className="font-semibold">{policy.label} cancellation</div>
                  <div className="text-sm text-ink-muted">{policy.short}</div>
                </div>
              </div>
              <div className="flex gap-5">
                <ShieldCheck className="h-6 w-6 shrink-0 text-brand" />
                <div>
                  <div className="font-semibold">Escrow-protected payment</div>
                  <div className="text-sm text-ink-muted">Your payment sits in a smart contract until the day after the experience. Report a problem before then and an arbiter reviews it.</div>
                </div>
              </div>
            </section>

            {listing.houseRules && listing.houseRules.length > 0 && (
              <>
                <Divider />
                <section className="py-8">
                  <h2 className="mb-4 font-display text-[22px] font-semibold">Good to know</h2>
                  <ul className="space-y-2 text-ink-soft">
                    {listing.houseRules.map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </div>

          <aside className="hidden md:block">
            <div className="sticky top-28">
              <BookingCard listing={listing} occupied={occupied} date={date} setDate={(d) => setParam("date", d)} guests={guests} setGuests={(n) => setParam("guests", String(n))} />
              {data.networks.length > 0 && (
                <div className="glass mt-5 rounded-2xl p-5 text-sm">
                  <div className="mb-3 font-semibold">Pay with crypto escrow on</div>
                  <div className="flex flex-wrap gap-2">
                    {data.networks.map((n) => (
                      <span key={n.network} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                        <ChainIcon chain={n.chain} /> {n.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>

        <Divider />
        <section className="py-12">
          {listing.reviewCount > 0 ? (
            <>
              <h2 className="mb-8 flex items-center gap-2 font-display text-[22px] font-semibold">
                <Star className="h-5 w-5 fill-current" /> {listing.rating?.toFixed(2)} · {listing.reviewCount} review{listing.reviewCount > 1 ? "s" : ""}
              </h2>
              <RatingSummary listing={listing} />
              <div className="mt-10 grid gap-x-24 gap-y-10 md:grid-cols-2">
                {reviews.map((r) => (
                  <ReviewCard key={r.id} r={r} />
                ))}
              </div>
              {listing.reviewCount > reviews.length && (
                <Button variant="outline" className="mt-10" onClick={() => setModal("reviews")}>
                  Show all {listing.reviewCount} reviews
                </Button>
              )}
            </>
          ) : (
            <h2 className="flex items-center gap-2 font-display text-[22px] font-semibold">
              <Star className="h-5 w-5 fill-current" /> No reviews (yet)
            </h2>
          )}
        </section>
        <Divider />
        <section className="py-12">
          <h2 className="mb-2 font-display text-[22px] font-semibold">Where you'll meet</h2>
          <p className="mb-6 text-ink-soft">
            {listing.neighborhood ? `${listing.neighborhood} · ` : ""}
            {listing.city}, {listing.country}
          </p>
          <div className="h-[360px] overflow-hidden rounded-3xl sm:h-[440px]">
            <LocationMap lat={listing.lat} lng={listing.lng} />
          </div>
        </section>
        <Divider />
        <section className="py-12">
          <h2 className="mb-8 font-display text-[22px] font-semibold">Meet your host</h2>
          <div className="grid gap-10 md:grid-cols-[360px_1fr]">
            <Link to={`/users/${host.id}`} className="glass flex items-center gap-6 rounded-3xl p-6">
              <Avatar src={host.avatarUrl} name={host.firstName} size={88} />
              <div>
                <div className="font-display text-2xl font-bold">{host.firstName}</div>
                <div className="text-sm text-ink-muted">{host.isSuperhost ? "Superhost" : "Host"} · {host.hostReviewCount} reviews</div>
                {host.location && <div className="mt-2 text-sm">📍 {host.location}</div>}
              </div>
            </Link>
            <div>
              <p className="mb-6 leading-relaxed text-ink-soft">{host.bio}</p>
              <ContactHost listing={listing} host={host} />
              <p className="mt-6 flex items-start gap-2 text-xs text-ink-muted">
                <KeyRound className="h-4 w-4 shrink-0" /> Always pay through Tourisme's escrow – never send crypto directly to a host.
              </p>
            </div>
          </div>
        </section>
      </Container>

      {/* Mobile reserve bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-white/10 bg-canvas/90 px-6 py-4 backdrop-blur md:hidden">
        <div>
          <div>
            <span className="font-mono font-semibold">{fmt(listing.priceUsd, false)}</span> <span className="text-sm text-ink-muted">per group</span>
          </div>
          <div className="text-sm underline">{date ? longDate(date) : "Choose a date"}</div>
        </div>
        <Link to={date ? `/book/${listing.id}${qs({ checkIn: date, checkOut: fromDay(toDay(date) + 1), adults: guests })}` : "#"} onClick={(e) => !date && (e.preventDefault(), setModal(null), setParam("pick", "1"))}>
          <Button>{date ? "Reserve" : "Choose a date"}</Button>
        </Link>
      </div>
      <Modal open={params.get("pick") === "1"} onClose={() => setParam("pick", null)} title="Choose a date" size="sm">
        <div className="p-6">
          <SingleDatePicker value={date} occupied={occupied} onChange={(d) => (setParam("date", d), d && setParam("pick", null))} />
        </div>
      </Modal>
      <Modal open={modal === "reviews"} onClose={() => setModal(null)} size="xl" title={`${listing.rating?.toFixed(2) ?? ""} · ${listing.reviewCount} reviews`}>
        <div className="grid gap-10 p-8">{(allReviews?.reviews || reviews).map((r) => <ReviewCard key={r.id} r={r} clamp={false} />)}</div>
      </Modal>
    </div>
  );
}
