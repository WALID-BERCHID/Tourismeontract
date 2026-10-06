import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, List, Map as MapIcon, ShieldCheck } from "lucide-react";
import { api, qs } from "../lib/api";
import { useMediaQuery, useTitle } from "../lib/hooks";
import type { Listing } from "../lib/types";
import ListingCard, { ListingCardSkeleton } from "../components/ListingCard";
import MapView from "../components/MapView";
import { CategoryBar, FiltersModal, countFilters } from "../components/Filters";
import Hero, { HowItWorks } from "../components/Hero";
import ExperienceCard from "../components/ExperienceCard";
import { Button, Container, Select } from "../components/ui";

interface SearchResponse {
  total: number;
  page: number;
  pages: number;
  nights: number | null;
  priceRange: { min: number; max: number } | null;
  results: Listing[];
}

export default function Home() {
  const [params, setParams] = useSearchParams();
  const [showMap, setShowMap] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const desktop = useMediaQuery("(min-width: 1128px)");
  const location = params.get("location") || "";
  useTitle(location ? `Stays in ${location}` : "Unique stays paid on-chain");

  const guests = Number(params.get("adults") || 0) + Number(params.get("children") || 0);
  const query = useMemo(
    () => ({
      location,
      checkIn: params.get("checkIn"),
      checkOut: params.get("checkOut"),
      guests: guests || null,
      category: params.get("category"),
      roomType: params.get("roomType"),
      minPrice: params.get("minPrice"),
      maxPrice: params.get("maxPrice"),
      bedrooms: params.get("bedrooms"),
      beds: params.get("beds"),
      baths: params.get("baths"),
      amenities: params.get("amenities"),
      propertyTypes: params.get("propertyTypes"),
      instantBook: params.get("instantBook"),
      network: params.get("network"),
      bounds: params.get("bounds"),
      sort: params.get("sort"),
      page: params.get("page"),
    }),
    [params, location, guests]
  );

  const landing = !params.toString();
  const { data: featuredExperiences } = useQuery({
    queryKey: ["featured-experiences"],
    queryFn: () => api.get<SearchResponse>("/listings?kind=experience&limit=4&sort=rating"),
    enabled: landing,
    staleTime: 5 * 60_000,
  });
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.get<SearchResponse>(`/listings${qs(query)}`),
    placeholderData: keepPreviousData,
  });

  const detailQuery = qs({ checkIn: query.checkIn, checkOut: query.checkOut, adults: params.get("adults"), children: params.get("children") });
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next);
  };
  const splitMap = desktop && (showMap || !!params.get("bounds"));
  const heading = data
    ? data.total === 0
      ? "No exact matches"
      : `${data.total >= 1000 ? "1,000+" : data.total} ${data.total === 1 ? "stay" : "stays"}${location ? ` in ${location.split(",")[0]}` : ""}`
    : "";

  return (
    <div>
      {landing && <Hero />}
      <div id="explore" className="sticky top-[81px] z-20 border-b border-white/5 bg-canvas/85 backdrop-blur-xl md:top-[80px]">
        <Container wide className="border-b border-ink-faint/0">
          <CategoryBar onFilters={() => setFiltersOpen(true)} filterCount={countFilters(params)} />
        </Container>
      </div>
      <FiltersModal open={filtersOpen} onClose={() => setFiltersOpen(false)} total={data?.total} priceRange={data?.priceRange} />

      <div className={clsx(splitMap ? "flex" : "")}>
        <div className={clsx(splitMap ? "w-[58%] min-w-0" : "w-full")}>
          <Container wide className="pb-10 pt-6">
            {!params.toString() && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-light to-white px-5 py-4 text-sm">
                <ShieldCheck className="h-6 w-6 shrink-0 text-brand" />
                <p>
                  <b>Every booking is protected by a smart-contract escrow.</b> Your payment is only released to the host 24 hours after you check in – and refunds follow the cancellation policy automatically.
                </p>
              </div>
            )}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold">{heading || " "}</h1>
                {data?.nights ? <p className="text-sm text-ink-muted">Prices include all fees for {data.nights} night{data.nights > 1 ? "s" : ""}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                {params.get("bounds") && (
                  <Button variant="outline" size="sm" onClick={() => setParam("bounds", null)}>
                    Clear map area
                  </Button>
                )}
                <Select
                  value={params.get("sort") || "recommended"}
                  onChange={(v) => setParam("sort", v === "recommended" ? null : v)}
                  className="w-48 text-sm"
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
              <div className="py-24 text-center text-ink-muted">We couldn't load stays right now. Please refresh the page.</div>
            ) : isLoading ? (
              <div className={clsx("grid gap-x-6 gap-y-10", splitMap ? "grid-cols-2 2xl:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5")}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <ListingCardSkeleton key={i} />
                ))}
              </div>
            ) : data?.results.length === 0 ? (
              <div className="py-20 text-center">
                <h2 className="text-2xl font-semibold">No exact matches</h2>
                <p className="mt-2 text-ink-muted">Try changing or removing some of your filters or adjusting your search area.</p>
                <Button variant="outline" className="mt-6" onClick={() => setParams(new URLSearchParams())}>
                  Remove all filters
                </Button>
              </div>
            ) : (
              <div className={clsx("grid gap-x-6 gap-y-10 transition-opacity", isFetching && "opacity-60", splitMap ? "grid-cols-2 2xl:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5")}>
                {data?.results.map((l) => (
                  <ListingCard key={l.id} listing={l} nights={data.nights} query={detailQuery} onHover={setHovered} />
                ))}
              </div>
            )}

            {landing && featuredExperiences && featuredExperiences.results.length > 0 && (
              <section className="mt-16">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-mint">New</span>
                    <h2 className="font-display text-2xl font-bold">Experiences & tours</h2>
                    <p className="text-sm text-ink-muted">Private, hosted by locals, paid through the same escrow.</p>
                  </div>
                  <Link to="/experiences" className="flex shrink-0 items-center gap-2 rounded-full border border-brand/40 px-5 py-2 text-sm font-semibold text-brand hover:bg-brand/10">
                    See all <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {featuredExperiences.results.map((l) => (
                    <ExperienceCard key={l.id} listing={l} />
                  ))}
                </div>
              </section>
            )}
            {landing && <HowItWorks />}

            {data && data.pages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                {Array.from({ length: data.pages }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => (setParam("page", i ? String(i + 1) : null), window.scrollTo({ top: 0, behavior: "smooth" }))}
                    className={clsx("h-9 w-9 rounded-full text-sm font-semibold", data.page === i + 1 ? "bg-brand-gradient text-white" : "hover:bg-white/10")}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </Container>
        </div>
        {splitMap && (
          <div className="sticky top-[160px] h-[calc(100vh-160px)] flex-1">
            <MapView listings={data?.results || []} activeId={hovered} onMove={(b) => setParam("bounds", b)} fixedBounds={!!params.get("bounds")} query={detailQuery} />
          </div>
        )}
      </div>

      {!splitMap && showMap && (
        <div className="fixed inset-x-0 bottom-0 top-[136px] z-30 md:top-[160px]">
          <MapView listings={data?.results || []} onMove={(b) => setParam("bounds", b)} fixedBounds={!!params.get("bounds")} query={detailQuery} />
        </div>
      )}

      <button
        type="button"
        style={landing && !showMap ? { opacity: 0, pointerEvents: "none" } : undefined}
        onClick={() => {
          if (showMap || params.get("bounds")) {
            setShowMap(false);
            setParam("bounds", null);
          } else setShowMap(true);
        }}
        className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-surface-2 px-5 py-3.5 text-sm font-semibold text-ink shadow-pop transition hover:scale-105 hover:border-brand/60 md:bottom-10"
      >
        {showMap || params.get("bounds") ? (
          <>
            Show list <List className="h-4 w-4" />
          </>
        ) : (
          <>
            Show map <MapIcon className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}
