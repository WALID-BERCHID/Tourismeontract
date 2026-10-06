import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight, Compass, MapPin, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { api, qs } from "../lib/api";
import { useMeta, useTitle } from "../lib/hooks";
import { fromDay, todayDay } from "../lib/format";
import type { Listing } from "../lib/types";
import ExperienceCard, { ExperienceCardSkeleton } from "../components/ExperienceCard";
import { CATEGORY_ICONS } from "../components/icons";
import { Button, Container, Select } from "../components/ui";

interface SearchResponse {
  total: number;
  page: number;
  pages: number;
  results: Listing[];
}

function ExperienceSearch({ params, setParams }: { params: URLSearchParams; setParams: (p: URLSearchParams) => void }) {
  const [location, setLocation] = useState(params.get("location") || "");
  const [date, setDate] = useState(params.get("date") || "");
  const [guests, setGuests] = useState(params.get("guests") || "");
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const next = new URLSearchParams(params);
    const setOrDel = (k: string, v: string) => (v ? next.set(k, v) : next.delete(k));
    setOrDel("location", location.trim());
    setOrDel("date", date);
    setOrDel("guests", guests);
    next.delete("page");
    setParams(next);
  };
  const field = "flex min-w-0 flex-1 items-center gap-3 px-5 py-3";
  return (
    <form onSubmit={submit} className="glass-strong mx-auto flex w-full max-w-3xl flex-col divide-y divide-white/10 rounded-3xl shadow-search sm:flex-row sm:divide-x sm:divide-y-0 sm:rounded-full">
      <label className={field}>
        <MapPin className="h-4 w-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Where</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Marrakech, Lisbon, Kyoto…" className="w-full bg-transparent text-sm focus:outline-none" />
        </span>
      </label>
      <label className={field}>
        <CalendarDays className="h-4 w-4 shrink-0 text-brand-violet" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">When</span>
          <input type="date" min={fromDay(todayDay())} value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-transparent text-sm focus:outline-none" />
        </span>
      </label>
      <label className={clsx(field, "sm:max-w-[170px]")}>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Group</span>
          <input inputMode="numeric" value={guests} onChange={(e) => setGuests(e.target.value.replace(/\D/g, ""))} placeholder="2 people" className="w-full bg-transparent text-sm focus:outline-none" />
        </span>
        <button type="submit" aria-label="Search" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow transition hover:brightness-110">
          <Search className="h-4 w-4" strokeWidth={3} />
        </button>
      </label>
    </form>
  );
}

function CategoryRail({ active, onPick }: { active: string | null; onPick: (id: string | null) => void }) {
  const { data: meta } = useMeta();
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d, behavior: "smooth" });
  return (
    <div className="relative">
      <button type="button" aria-label="Scroll left" onClick={() => scroll(-320)} className="absolute -left-3 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-surface-2 shadow-card md:flex">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div ref={ref} className="scrollbar-hide flex gap-2 overflow-x-auto py-1">
        <button type="button" onClick={() => onPick(null)} className={clsx("shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition", !active ? "border-transparent bg-brand-gradient text-white shadow-glow" : "border-white/10 bg-white/5 text-ink-soft hover:border-brand/50")}>
          All experiences
        </button>
        {meta?.experienceCategories.map((c) => {
          const Icon = CATEGORY_ICONS[c.icon] || Compass;
          const on = active === c.id;
          return (
            <button key={c.id} type="button" onClick={() => onPick(on ? null : c.id)} className={clsx("flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition", on ? "border-transparent bg-brand-gradient text-white shadow-glow" : "border-white/10 bg-white/5 text-ink-soft hover:border-brand/50 hover:text-ink")}>
              <Icon className="h-4 w-4" strokeWidth={1.8} /> {c.label}
            </button>
          );
        })}
      </div>
      <button type="button" aria-label="Scroll right" onClick={() => scroll(320)} className="absolute -right-3 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-surface-2 shadow-card md:flex">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Experiences() {
  const [params, setParams] = useSearchParams();
  const location = params.get("location") || "";
  useTitle(location ? `Experiences in ${location}` : "Experiences & tours");

  const query = useMemo(
    () => ({
      kind: "experience",
      location,
      date: params.get("date"),
      guests: params.get("guests"),
      category: params.get("category"),
      sort: params.get("sort"),
      page: params.get("page"),
      limit: 24,
    }),
    [params, location]
  );
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["experiences", query],
    queryFn: () => api.get<SearchResponse>(`/listings${qs(query)}`),
    placeholderData: keepPreviousData,
  });

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next);
  };
  const detailQuery = qs({ date: params.get("date"), guests: params.get("guests") });
  const filtered = !!(location || params.get("date") || params.get("guests") || params.get("category"));

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_30%,#000,transparent)]" />
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-violet/30 blur-3xl" />
        <div className="absolute -right-24 top-0 h-72 w-72 rounded-full bg-brand/25 blur-3xl" />
        <Container wide className="relative pb-10 pt-10 sm:pt-14">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-brand-mint">
              <Sparkles className="h-3.5 w-3.5" /> New · Experiences & tours
            </span>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] sm:text-5xl">
              Collect <span className="text-gradient">moments</span>, not just places.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-ink-soft">
              Private tours, workshops and adventures hosted by locals. Book the whole group for one date – your payment sits in escrow until the day after your experience.
            </p>
          </div>
          <div className="mt-8">
            <ExperienceSearch params={params} setParams={setParams} />
          </div>
        </Container>
      </section>

      <Container wide className="pb-16 pt-6">
        <CategoryRail active={params.get("category")} onPick={(id) => setParam("category", id)} />

        <div className="mb-6 mt-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">
              {data ? (data.total === 0 ? "No experiences match" : `${data.total} experience${data.total === 1 ? "" : "s"}${location ? ` in ${location.split(",")[0]}` : ""}`) : " "}
            </h2>
            {params.get("date") && <p className="text-sm text-ink-muted">Showing availability for {params.get("date")}</p>}
          </div>
          <div className="flex items-center gap-2">
            {filtered && (
              <Button variant="outline" size="sm" onClick={() => setParams(new URLSearchParams())}>
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
            <Select
              value={params.get("sort") || "recommended"}
              onChange={(v) => setParam("sort", v === "recommended" ? null : v)}
              className="w-44 text-sm"
              options={[
                { value: "recommended", label: "Recommended" },
                { value: "price_asc", label: "Price: low to high" },
                { value: "price_desc", label: "Price: high to low" },
                { value: "rating", label: "Top rated" },
                { value: "newest", label: "Newest" },
              ]}
            />
          </div>
        </div>

        {error ? (
          <div className="py-24 text-center text-ink-muted">We couldn't load experiences right now. Please refresh the page.</div>
        ) : isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ExperienceCardSkeleton key={i} />
            ))}
          </div>
        ) : data?.results.length === 0 ? (
          <div className="glass rounded-3xl py-20 text-center">
            <h2 className="font-display text-2xl font-semibold">Nothing here yet</h2>
            <p className="mt-2 text-ink-muted">Try another date or destination – or clear your filters.</p>
            <Button variant="outline" className="mt-6" onClick={() => setParams(new URLSearchParams())}>
              Show all experiences
            </Button>
          </div>
        ) : (
          <div className={clsx("grid gap-5 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", isFetching && "opacity-60")}>
            {data?.results.map((l) => (
              <ExperienceCard key={l.id} listing={l} query={detailQuery} />
            ))}
          </div>
        )}

        {data && data.pages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-2">
            {Array.from({ length: data.pages }).map((_, i) => (
              <button key={i} type="button" onClick={() => (setParam("page", i ? String(i + 1) : null), window.scrollTo({ top: 0, behavior: "smooth" }))} className={clsx("h-9 w-9 rounded-full text-sm font-semibold", data.page === i + 1 ? "bg-brand-gradient text-white" : "hover:bg-white/10")}>
                {i + 1}
              </button>
            ))}
          </div>
        )}

        <div className="glass mt-16 grid gap-6 rounded-3xl p-6 sm:grid-cols-3 sm:p-8">
          {[
            [ShieldCheck, "Escrow for experiences too", "Your payment is locked in the same smart contract as stays and released to the host the day after."],
            [CalendarDays, "One date, your whole group", "Experiences are booked privately: pick a date and bring up to the host's maximum group size."],
            [Compass, "Hosted by locals", "Every experience is run by a verified host with a public profile, reviews and on-chain history."],
          ].map(([Icon, t, b]) => {
            const I = Icon as typeof ShieldCheck;
            return (
              <div key={t as string} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand">
                  <I className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-display font-semibold">{t as string}</div>
                  <p className="mt-1 text-sm text-ink-muted">{b as string}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-center text-sm text-ink-muted">
          Run tours yourself?{" "}
          <Link to="/hosting/experiences/new" className="font-semibold text-brand-mint underline-offset-2 hover:underline">
            List an experience
          </Link>
        </p>
      </Container>
    </div>
  );
}
