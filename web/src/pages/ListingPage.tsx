import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { toast } from "sonner";
import {
  Award,
  CalendarCheck,
  ChevronDown,
  DoorOpen,
  Grid3x3,
  KeyRound,
  Medal,
  MessageCircle,
  Share,
  ShieldCheck,
  Star,
  Zap,
} from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCurrency } from "../lib/currency";
import { useClickOutside, useMeta, useTitle } from "../lib/hooks";
import { POLICY_TEXT, monthYear, nightsBetween, shortDate, toDay, yearsSince } from "../lib/format";
import type { Listing, Quote, Review, User } from "../lib/types";
import DateRangePicker from "../components/DateRangePicker";
import { LocationMap } from "../components/MapView";
import { HeartButton } from "../components/ListingCard";
import { ChainIcon, amenityIcon } from "../components/icons";
import { Avatar, Button, Container, Counter, Divider, Img, Modal, PageLoader, Textarea } from "../components/ui";

interface ListingResponse {
  listing: Listing;
  host: User;
  reviews: Review[];
  occupiedDays: number[];
  networks: { chain: "evm" | "solana" | "eos"; network: string; name: string }[];
}

const ROOM_LABEL = { entire: "Entire", private: "Room in", shared: "Shared room in" } as const;

function Gallery({ listing, open, onClose, start = 0 }: { listing: Listing; open: boolean; onClose: () => void; start?: number }) {
  return (
    <Modal open={open} onClose={onClose} size="full" title="Photo tour">
      <div className="mx-auto max-w-3xl space-y-3 p-4 sm:p-8">
        {listing.photos.slice(start).concat(listing.photos.slice(0, start)).map((p, i) => (
          <Img key={i} src={p} alt={`${listing.title} photo ${i + 1}`} seed={listing.id + i} className="w-full rounded-lg" />
        ))}
      </div>
    </Modal>
  );
}

function ReviewCard({ r, clamp = true }: { r: Review; clamp?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar src={r.author.avatarUrl} name={r.author.name} size={48} />
        <div>
          <div className="font-semibold">{r.author.name}</div>
          <div className="text-sm text-ink-muted">{r.author.location || (r.author.joinedAt ? `${yearsSince(r.author.joinedAt) || 1} years on Tourisme` : "")}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={clsx("h-2.5 w-2.5", i < r.rating ? "fill-ink text-ink" : "text-ink-line")} />
          ))}
        </span>
        <span className="font-semibold">· {monthYear(r.createdAt)}</span>
        {r.txHash && <span className="rounded bg-emerald-50 px-1.5 text-emerald-700">on-chain</span>}
      </div>
      <p className={clsx("mt-2 leading-relaxed", clamp && "line-clamp-4")}>{r.comment}</p>
    </div>
  );
}

function RatingSummary({ listing }: { listing: Listing }) {
  const cats: [string, string][] = [
    ["cleanliness", "Cleanliness"],
    ["accuracy", "Accuracy"],
    ["checkin", "Check-in"],
    ["communication", "Communication"],
    ["location", "Location"],
    ["value", "Value"],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-0 lg:divide-x lg:divide-ink-faint">
      {cats.map(([k, label]) => (
        <div key={k} className="lg:px-4 lg:first:pl-0">
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-lg font-semibold">{listing.ratingDetails?.[k]?.toFixed(1) ?? "–"}</div>
        </div>
      ))}
    </div>
  );
}

function ContactHost({ listing, host }: { listing: Listing; host: User }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const { user, requireAuth } = useAuth();
  const navigate = useNavigate();
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ conversationId: number }>("/conversations", { listingId: listing.id, body });
      toast.success(`Message sent to ${host.firstName}`);
      navigate(`/messages/${r.conversationId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (user?.id === host.id) return null;
  return (
    <>
      <Button variant="dark" onClick={() => requireAuth(() => setOpen(true)) && setOpen(true)}>
        <MessageCircle className="h-4 w-4" /> Message host
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Contact ${host.firstName}`} size="md">
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <Avatar src={host.avatarUrl} name={host.firstName} size={56} />
            <div>
              <div className="font-semibold">{host.firstName} usually responds within an hour</div>
              <div className="text-sm text-ink-muted">Ask about check-in, the neighbourhood, or anything else.</div>
            </div>
          </div>
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Hi ${host.firstName}! I'm planning a trip to ${listing.city}…`} />
          <p className="text-xs text-ink-muted">To protect your payment, never pay or communicate outside of Tourisme.</p>
          <Button full onClick={send} loading={busy} disabled={!body.trim()}>
            Send message
          </Button>
        </div>
      </Modal>
    </>
  );
}

function BookingCard({
  listing,
  occupied,
  checkIn,
  checkOut,
  setDates,
  guests,
  setGuests,
}: {
  listing: Listing;
  occupied: Set<number>;
  checkIn: string | null;
  checkOut: string | null;
  setDates: (a: string | null, b: string | null) => void;
  guests: { adults: number; children: number; infants: number; pets: number };
  setGuests: (g: Partial<{ adults: number; children: number; infants: number; pets: number }>) => void;
}) {
  const { fmt } = useCurrency();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<"dates" | "guests" | null>(null);
  const close = useCallback(() => setPanel(null), []);
  const ref = useClickOutside<HTMLDivElement>(close, panel !== null);
  const nights = nightsBetween(checkIn, checkOut);
  const totalGuests = guests.adults + guests.children;

  const { data: quote } = useQuery({
    queryKey: ["quote", listing.id, checkIn, checkOut],
    queryFn: () => api.get<{ available: boolean; error: string | null; quote: Quote | null }>(`/listings/${listing.id}/quote${qs({ checkIn, checkOut })}`),
    enabled: !!checkIn && !!checkOut,
  });

  const reserve = () => {
    if (!checkIn || !checkOut) return setPanel("dates");
    navigate(`/book/${listing.id}${qs({ checkIn, checkOut, adults: guests.adults || 1, children: guests.children, infants: guests.infants, pets: guests.pets })}`);
  };
  const isOwner = user?.id === listing.hostId;

  return (
    <div ref={ref} className="rounded-xl border border-ink-line p-6 shadow-card">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          {nights && quote?.quote ? (
            <>
              <span className="text-[22px] font-semibold">{fmt(quote.quote.total, false)}</span> <span className="text-ink-muted">for {nights} night{nights > 1 ? "s" : ""}</span>
            </>
          ) : (
            <>
              <span className="text-[22px] font-semibold">{fmt(listing.priceUsd, false)}</span> <span>night</span>
            </>
          )}
        </div>
        {listing.reviewCount > 0 && (
          <span className="flex items-center gap-1 text-sm">
            <Star className="h-3.5 w-3.5 fill-current" /> {listing.rating?.toFixed(2)} · <span className="text-ink-muted underline">{listing.reviewCount} reviews</span>
          </span>
        )}
      </div>

      <div className="relative rounded-xl border border-ink-muted">
        <div className="grid grid-cols-2">
          <button type="button" onClick={() => setPanel("dates")} className="border-r border-ink-muted px-3 py-2.5 text-left">
            <div className="text-[10px] font-extrabold uppercase">Check-in</div>
            <div className={clsx("text-sm", !checkIn && "text-ink-muted")}>{checkIn ? new Date(`${checkIn}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC" }) : "Add date"}</div>
          </button>
          <button type="button" onClick={() => setPanel("dates")} className="px-3 py-2.5 text-left">
            <div className="text-[10px] font-extrabold uppercase">Checkout</div>
            <div className={clsx("text-sm", !checkOut && "text-ink-muted")}>{checkOut ? new Date(`${checkOut}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC" }) : "Add date"}</div>
          </button>
        </div>
        <button type="button" onClick={() => setPanel(panel === "guests" ? null : "guests")} className="flex w-full items-center justify-between border-t border-ink-muted px-3 py-2.5 text-left">
          <span>
            <span className="block text-[10px] font-extrabold uppercase">Guests</span>
            <span className="text-sm">
              {totalGuests || 1} guest{(totalGuests || 1) > 1 ? "s" : ""}
              {guests.infants ? `, ${guests.infants} infant${guests.infants > 1 ? "s" : ""}` : ""}
              {guests.pets ? `, ${guests.pets} pet${guests.pets > 1 ? "s" : ""}` : ""}
            </span>
          </span>
          <ChevronDown className={clsx("h-5 w-5 transition", panel === "guests" && "rotate-180")} />
        </button>

        {panel === "dates" && (
          <div className="absolute -right-6 -top-6 z-30 w-[680px] animate-fade-in rounded-2xl bg-white p-8 shadow-pop">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h3 className="text-[22px] font-semibold">{nights ? `${nights} night${nights > 1 ? "s" : ""}` : "Select dates"}</h3>
                <p className="text-sm text-ink-muted">
                  {checkIn && checkOut ? `${shortDate(checkIn, true)} – ${shortDate(checkOut, true)}` : `Minimum stay: ${listing.minNights} night${listing.minNights! > 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
            <DateRangePicker checkIn={checkIn} checkOut={checkOut} onChange={(a, b) => (setDates(a, b), a && b && setPanel(null))} occupied={occupied} minNights={listing.minNights} maxNights={listing.maxNights} />
            <div className="mt-6 flex justify-end gap-4">
              <Button variant="link" onClick={() => setDates(null, null)}>
                Clear dates
              </Button>
              <Button variant="dark" size="sm" onClick={() => setPanel(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
        {panel === "guests" && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 animate-fade-in rounded-xl bg-white px-4 shadow-pop">
            <Counter label="Adults" sub="Age 13+" value={guests.adults || 1} min={1} max={listing.guests - guests.children} onChange={(v) => setGuests({ adults: v })} />
            <Counter label="Children" sub="Ages 2–12" value={guests.children} max={listing.guests - (guests.adults || 1)} onChange={(v) => setGuests({ children: v })} />
            <Counter label="Infants" sub="Under 2" value={guests.infants} max={5} onChange={(v) => setGuests({ infants: v })} />
            <Counter label="Pets" value={guests.pets} max={2} onChange={(v) => setGuests({ pets: v })} />
            <p className="pb-4 text-xs text-ink-muted">This place has a maximum of {listing.guests} guests, not including infants.</p>
          </div>
        )}
      </div>

      {quote && !quote.available && checkIn && checkOut && <p className="mt-3 text-sm text-red-600">{quote.error}</p>}
      <Button full size="lg" className="mt-4" onClick={reserve} disabled={isOwner || (!!quote && !quote.available)}>
        {isOwner ? "This is your listing" : !checkIn || !checkOut ? "Check availability" : listing.instantBook ? "Reserve" : "Request to book"}
      </Button>
      {nights > 0 && quote?.quote && (
        <>
          <p className="mt-3 text-center text-sm text-ink-muted">You won't be charged yet</p>
          <div className="mt-5 space-y-3 text-[15px]">
            <div className="flex justify-between">
              <span className="underline">
                {fmt(quote.quote.nightly)} x {nights} night{nights > 1 ? "s" : ""}
              </span>
              <span>{fmt(quote.quote.base)}</span>
            </div>
            {quote.quote.cleaningFee > 0 && (
              <div className="flex justify-between">
                <span className="underline">Cleaning fee</span>
                <span>{fmt(quote.quote.cleaningFee)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="underline">Tourisme service fee</span>
              <span>{fmt(quote.quote.serviceFee)}</span>
            </div>
            <Divider />
            <div className="flex justify-between font-semibold">
              <span>Total before taxes</span>
              <span>{fmt(quote.quote.total)}</span>
            </div>
          </div>
        </>
      )}
      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-ink-muted">
        <ShieldCheck className="h-4 w-4 text-emerald-600" /> Paid into escrow · released 24h after check-in
      </div>
    </div>
  );
}

export default function ListingPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: meta } = useMeta();
  const { fmt } = useCurrency();
  const [gallery, setGallery] = useState<number | null>(null);
  const [modal, setModal] = useState<"description" | "amenities" | "reviews" | "rules" | null>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ["listing", id], queryFn: () => api.get<ListingResponse>(`/listings/${id}`) });
  const firstNetwork = data?.networks[0]?.network;
  const { data: calendar } = useQuery({
    queryKey: ["calendar", id, firstNetwork],
    queryFn: () => api.get<{ occupiedDays: number[] }>(`/listings/${id}/calendar${qs({ network: firstNetwork })}`),
    enabled: !!data,
  });
  const { data: allReviews } = useQuery({
    queryKey: ["reviews", id],
    queryFn: () => api.get<{ reviews: Review[] }>(`/listings/${id}/reviews`),
    enabled: modal === "reviews",
  });
  useTitle(data?.listing.title);

  const occupied = useMemo(() => new Set(calendar?.occupiedDays || data?.occupiedDays || []), [calendar, data]);
  const checkIn = params.get("checkIn");
  const checkOut = params.get("checkOut");
  const guests = { adults: Number(params.get("adults") || 1), children: Number(params.get("children") || 0), infants: Number(params.get("infants") || 0), pets: Number(params.get("pets") || 0) };

  // If the URL dates collide with bookings, drop them rather than showing an impossible quote.
  const datesValid = !checkIn || !checkOut || ![...Array(Math.max(0, toDay(checkOut) - toDay(checkIn)))].some((_, i) => occupied.has(toDay(checkIn) + i));

  const setDates = (a: string | null, b: string | null) => {
    const next = new URLSearchParams(params);
    a ? next.set("checkIn", a) : next.delete("checkIn");
    b ? next.set("checkOut", b) : next.delete("checkOut");
    setParams(next, { replace: true });
  };
  const setGuests = (g: Partial<typeof guests>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(g)) v ? next.set(k, String(v)) : next.delete(k);
    setParams(next, { replace: true });
  };

  if (isLoading) return <PageLoader />;
  if (error || !data)
    return (
      <Container className="py-24 text-center">
        <h1 className="text-3xl font-semibold">This place isn't available</h1>
        <p className="mt-2 text-ink-muted">It may have been unlisted by the host.</p>
        <Link to="/" className="mt-6 inline-block font-semibold underline">
          Keep exploring
        </Link>
      </Container>
    );

  const { listing, host, reviews } = data;
  const amenityLabel = (a: string) => meta?.amenities.find((m) => m.id === a)?.label || a;
  const nights = nightsBetween(checkIn, checkOut);
  const policy = POLICY_TEXT[listing.cancellationPolicy || "flexible"];

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: listing.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className="pb-28 md:pb-0">
      <Container className="pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold sm:text-[26px]">{listing.title}</h1>
          <div className="flex gap-2 text-sm font-semibold">
            <button type="button" onClick={share} className="flex items-center gap-2 rounded-lg px-3 py-2 underline hover:bg-ink-bg">
              <Share className="h-4 w-4" /> Share
            </button>
            <span className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-ink-bg">
              <HeartButton listing={listing} className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:fill-transparent [&_svg]:text-ink" /> <span className="underline">Save</span>
            </span>
          </div>
        </div>

        {/* Photo grid */}
        <div className="relative grid h-[300px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-xl sm:h-[420px] lg:h-[480px]">
          {listing.photos.slice(0, 5).map((p, i) => (
            <button key={i} type="button" onClick={() => setGallery(i)} className={clsx("group relative overflow-hidden", i === 0 ? "col-span-4 row-span-2 sm:col-span-2" : "hidden sm:block")}>
              <Img src={p} alt={`${listing.title} photo ${i + 1}`} seed={listing.id + i} className="h-full w-full transition duration-300 group-hover:brightness-90" />
            </button>
          ))}
          <button type="button" onClick={() => setGallery(0)} className="absolute bottom-6 right-6 flex items-center gap-2 rounded-lg border border-ink bg-white px-4 py-1.5 text-sm font-semibold shadow-sm hover:bg-ink-bg">
            <Grid3x3 className="h-4 w-4" /> Show all photos
          </button>
        </div>
        <Gallery listing={listing} open={gallery !== null} onClose={() => setGallery(null)} start={gallery || 0} />

        <div className="mt-8 grid gap-16 md:grid-cols-[1fr_minmax(0,370px)] lg:gap-24">
          <div className="min-w-0">
            <section className="pb-8">
              <h2 className="text-[22px] font-semibold">
                {ROOM_LABEL[listing.roomType]} {listing.propertyType.toLowerCase()} in {listing.city}, {listing.country}
              </h2>
              <p className="text-ink-soft">
                {listing.guests} guests · {listing.bedrooms} bedroom{listing.bedrooms !== 1 ? "s" : ""} · {listing.beds} bed{listing.beds !== 1 ? "s" : ""} · {listing.baths} bath{listing.baths !== 1 ? "s" : ""}
              </p>
              {listing.reviewCount > 0 ? (
                listing.reviewCount >= 5 && (listing.rating || 0) >= 4.85 ? (
                  <div className="mt-6 flex items-center gap-6 rounded-xl border border-ink-line px-6 py-4">
                    <div className="flex items-center gap-2 text-center font-semibold leading-tight">
                      <Award className="h-7 w-7" /> Guest
                      <br /> favorite
                    </div>
                    <p className="hidden flex-1 text-sm sm:block">One of the most loved homes on Tourisme, according to guests</p>
                    <div className="text-center">
                      <div className="text-lg font-semibold">{listing.rating?.toFixed(2)}</div>
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className="h-2.5 w-2.5 fill-current" />
                        ))}
                      </div>
                    </div>
                    <div className="border-l border-ink-line pl-6 text-center">
                      <div className="text-lg font-semibold">{listing.reviewCount}</div>
                      <div className="text-xs underline">Reviews</div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 flex items-center gap-1 font-semibold">
                    <Star className="h-4 w-4 fill-current" /> {listing.rating?.toFixed(2)} ·{" "}
                    <button type="button" className="underline" onClick={() => setModal("reviews")}>
                      {listing.reviewCount} reviews
                    </button>
                  </p>
                )
              ) : (
                <p className="mt-1 flex items-center gap-1 font-semibold">
                  <Star className="h-4 w-4 fill-current" /> New listing
                </p>
              )}
            </section>
            <Divider />
            <section className="flex items-center gap-4 py-6">
              <Link to={`/users/${host.id}`} className="relative">
                <Avatar src={host.avatarUrl} name={host.firstName} size={40} />
                {host.isSuperhost && <Medal className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-white p-0.5 text-brand" />}
              </Link>
              <div>
                <div className="font-semibold">Hosted by {host.firstName}</div>
                <div className="text-sm text-ink-muted">
                  {host.isSuperhost ? "Superhost · " : ""}
                  {yearsSince(host.joinedAt) || 1} year{yearsSince(host.joinedAt) > 1 ? "s" : ""} hosting
                </div>
              </div>
            </section>
            <Divider />
            <section className="space-y-6 py-8">
              {listing.instantBook && (
                <div className="flex gap-6">
                  <Zap className="h-6 w-6 shrink-0" />
                  <div>
                    <div className="font-semibold">Instant Book</div>
                    <div className="text-sm text-ink-muted">Book right away – no need to wait for the host to approve.</div>
                  </div>
                </div>
              )}
              {host.isSuperhost && (
                <div className="flex gap-6">
                  <Medal className="h-6 w-6 shrink-0" />
                  <div>
                    <div className="font-semibold">{host.firstName} is a Superhost</div>
                    <div className="text-sm text-ink-muted">Superhosts are experienced, highly rated hosts.</div>
                  </div>
                </div>
              )}
              <div className="flex gap-6">
                <DoorOpen className="h-6 w-6 shrink-0" />
                <div>
                  <div className="font-semibold">Self check-in from {listing.checkInTime}</div>
                  <div className="text-sm text-ink-muted">Exact address and access details are shared once your booking is confirmed.</div>
                </div>
              </div>
              <div className="flex gap-6">
                <CalendarCheck className="h-6 w-6 shrink-0" />
                <div>
                  <div className="font-semibold">{policy.label} cancellation</div>
                  <div className="text-sm text-ink-muted">{policy.short}</div>
                </div>
              </div>
              <div className="flex gap-6">
                <ShieldCheck className="h-6 w-6 shrink-0" />
                <div>
                  <div className="font-semibold">Escrow-protected payment</div>
                  <div className="text-sm text-ink-muted">Your payment sits in a smart contract until 24h after check-in. Report a problem before then and an arbiter reviews it.</div>
                </div>
              </div>
            </section>
            <Divider />
            <section className="py-8">
              <p className="line-clamp-6 whitespace-pre-line leading-relaxed">{listing.description}</p>
              {(listing.description?.length || 0) > 300 && (
                <button type="button" onClick={() => setModal("description")} className="mt-4 font-semibold underline">
                  Show more ›
                </button>
              )}
            </section>
            <Divider />
            <section className="py-10">
              <h2 className="mb-6 text-[22px] font-semibold">What this place offers</h2>
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {listing.amenities?.slice(0, 10).map((a) => {
                  const Icon = amenityIcon(a);
                  return (
                    <div key={a} className="flex items-center gap-4">
                      <Icon className="h-6 w-6" strokeWidth={1.5} /> {amenityLabel(a)}
                    </div>
                  );
                })}
              </div>
              {(listing.amenities?.length || 0) > 10 && (
                <Button variant="outline" className="mt-8" onClick={() => setModal("amenities")}>
                  Show all {listing.amenities?.length} amenities
                </Button>
              )}
            </section>
            <Divider />
            <section className="py-10">
              <h2 className="text-[22px] font-semibold">{nights ? `${nights} night${nights > 1 ? "s" : ""} in ${listing.city}` : "Select check-in date"}</h2>
              <p className="mb-6 text-sm text-ink-muted">
                {checkIn && checkOut ? `${shortDate(checkIn, true)} – ${shortDate(checkOut, true)}` : `Add your travel dates for exact pricing · ${listing.minNights}-night minimum`}
              </p>
              <DateRangePicker checkIn={checkIn} checkOut={checkOut} onChange={setDates} occupied={occupied} minNights={listing.minNights} maxNights={listing.maxNights} />
              <div className="mt-4 flex justify-end">
                <Button variant="link" onClick={() => setDates(null, null)}>
                  Clear dates
                </Button>
              </div>
            </section>
          </div>
          <aside className="hidden md:block">
            <div className="sticky top-28">
              <BookingCard listing={listing} occupied={occupied} checkIn={datesValid ? checkIn : null} checkOut={datesValid ? checkOut : null} setDates={setDates} guests={guests} setGuests={setGuests} />
              {data.networks.length > 0 && (
                <div className="mt-6 rounded-xl border border-ink-line p-5 text-sm">
                  <div className="mb-3 font-semibold">Pay with crypto escrow on</div>
                  <div className="flex flex-wrap gap-2">
                    {data.networks.map((n) => (
                      <span key={n.network} className="flex items-center gap-1.5 rounded-full bg-ink-bg px-3 py-1.5">
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
        {/* Reviews */}
        <section className="py-12">
          {listing.reviewCount > 0 ? (
            <>
              <h2 className="mb-8 flex items-center gap-2 text-[22px] font-semibold">
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
            <h2 className="flex items-center gap-2 text-[22px] font-semibold">
              <Star className="h-5 w-5 fill-current" /> No reviews (yet)
            </h2>
          )}
        </section>
        <Divider />
        <section className="py-12">
          <h2 className="mb-2 text-[22px] font-semibold">Where you'll be</h2>
          <p className="mb-6 text-ink-soft">
            {listing.neighborhood ? `${listing.neighborhood} · ` : ""}
            {listing.city}, {listing.region ? `${listing.region}, ` : ""}
            {listing.country}
          </p>
          <div className="h-[380px] overflow-hidden rounded-xl sm:h-[480px]">
            <LocationMap lat={listing.lat} lng={listing.lng} />
          </div>
          <p className="mt-4 text-sm text-ink-muted">Exact location provided after booking.</p>
        </section>
        <Divider />
        <section className="py-12">
          <h2 className="mb-8 text-[22px] font-semibold">Meet your host</h2>
          <div className="grid gap-12 md:grid-cols-[380px_1fr]">
            <Link to={`/users/${host.id}`} className="grid grid-cols-[1fr_120px] items-center rounded-3xl p-8 shadow-card">
              <div className="flex flex-col items-center text-center">
                <span className="relative">
                  <Avatar src={host.avatarUrl} name={host.firstName} size={104} />
                  {host.isSuperhost && <Medal className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-brand p-1.5 text-white" />}
                </span>
                <div className="mt-3 text-[28px] font-bold leading-tight">{host.firstName}</div>
                <div className="text-sm font-semibold">{host.isSuperhost ? "Superhost" : "Host"}</div>
              </div>
              <div className="divide-y divide-ink-line">
                <div className="pb-3">
                  <div className="text-[22px] font-bold">{host.hostReviewCount}</div>
                  <div className="text-xs font-semibold">Reviews</div>
                </div>
                <div className="py-3">
                  <div className="flex items-center gap-1 text-[22px] font-bold">
                    {host.hostRating?.toFixed(2) ?? "–"} <Star className="h-3.5 w-3.5 fill-current" />
                  </div>
                  <div className="text-xs font-semibold">Rating</div>
                </div>
                <div className="pt-3">
                  <div className="text-[22px] font-bold">{yearsSince(host.joinedAt) || 1}</div>
                  <div className="text-xs font-semibold">Years hosting</div>
                </div>
              </div>
            </Link>
            <div>
              {host.work && <p className="mb-2">💼 {host.work}</p>}
              {host.languages.length > 0 && <p className="mb-2">🗣 Speaks {host.languages.join(", ")}</p>}
              {host.location && <p className="mb-4">📍 Lives in {host.location}</p>}
              <p className="mb-6 leading-relaxed text-ink-soft">{host.bio}</p>
              <p className="mb-2 font-semibold">Host details</p>
              <p className="mb-6 text-ink-soft">Response rate: 100% · Responds within an hour</p>
              <ContactHost listing={listing} host={host} />
              <p className="mt-6 flex items-start gap-2 text-xs text-ink-muted">
                <KeyRound className="h-4 w-4 shrink-0" /> To protect your payment, always use Tourisme's escrow to pay – never send crypto directly to a host.
              </p>
            </div>
          </div>
        </section>
        <Divider />
        <section className="grid gap-10 py-12 md:grid-cols-3">
          <div>
            <h3 className="mb-3 font-semibold">House rules</h3>
            <ul className="space-y-2 text-ink-soft">
              <li>Check-in after {listing.checkInTime}</li>
              <li>Checkout before {listing.checkOutTime}</li>
              <li>{listing.guests} guests maximum</li>
              {listing.houseRules?.slice(0, 2).map((r) => <li key={r}>{r}</li>)}
            </ul>
            {(listing.houseRules?.length || 0) > 2 && (
              <button type="button" className="mt-3 font-semibold underline" onClick={() => setModal("rules")}>
                Show more ›
              </button>
            )}
          </div>
          <div>
            <h3 className="mb-3 font-semibold">Safety & property</h3>
            <ul className="space-y-2 text-ink-soft">
              <li>Smoke alarm installed</li>
              <li>Host verified with an on-chain wallet</li>
              <li>Payment protected by smart-contract escrow</li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 font-semibold">Cancellation policy</h3>
            <p className="text-ink-soft">{policy.long}</p>
            <p className="mt-2 text-sm text-ink-muted">Refunds are executed automatically by the escrow contract.</p>
          </div>
        </section>
      </Container>

      {/* Mobile reserve bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-ink-faint bg-white px-6 py-4 md:hidden">
        <div>
          <div>
            <span className="font-semibold">{fmt(listing.priceUsd, false)}</span> night
          </div>
          <div className="text-sm underline">{checkIn && checkOut ? `${shortDate(checkIn)} – ${shortDate(checkOut)}` : "Add dates"}</div>
        </div>
        <Link to={checkIn && checkOut ? `/book/${listing.id}${qs({ checkIn, checkOut, adults: guests.adults, children: guests.children })}` : "#"} onClick={(e) => (!checkIn || !checkOut) && (e.preventDefault(), window.scrollTo({ top: document.body.scrollHeight * 0.45, behavior: "smooth" }))}>
          <Button>{checkIn && checkOut ? "Reserve" : "Check availability"}</Button>
        </Link>
      </div>

      <Modal open={modal === "description"} onClose={() => setModal(null)} title="About this space" size="lg">
        <p className="whitespace-pre-line p-8 leading-relaxed">{listing.description}</p>
      </Modal>
      <Modal open={modal === "amenities"} onClose={() => setModal(null)} title="What this place offers" size="lg">
        <div className="p-8">
          {[...new Set(meta?.amenities.filter((a) => listing.amenities?.includes(a.id)).map((a) => a.group))].map((group) => (
            <div key={group} className="mb-8">
              <h3 className="mb-2 text-lg font-semibold">{group}</h3>
              {meta?.amenities
                .filter((a) => a.group === group && listing.amenities?.includes(a.id))
                .map((a) => {
                  const Icon = amenityIcon(a.id);
                  return (
                    <div key={a.id} className="flex items-center gap-4 border-b border-ink-faint py-5">
                      <Icon className="h-6 w-6" strokeWidth={1.5} /> {a.label}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </Modal>
      <Modal open={modal === "reviews"} onClose={() => setModal(null)} size="xl" title={`${listing.rating?.toFixed(2) ?? ""} · ${listing.reviewCount} reviews`}>
        <div className="grid gap-10 p-8">{(allReviews?.reviews || reviews).map((r) => <ReviewCard key={r.id} r={r} clamp={false} />)}</div>
      </Modal>
      <Modal open={modal === "rules"} onClose={() => setModal(null)} title="House rules" size="md">
        <ul className="divide-y divide-ink-faint px-8 py-4">
          <li className="py-4">Check-in after {listing.checkInTime}</li>
          <li className="py-4">Checkout before {listing.checkOutTime}</li>
          {listing.houseRules?.map((r) => (
            <li key={r} className="py-4">
              {r}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
