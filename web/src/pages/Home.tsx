import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { List, Map as MapIcon, ShieldCheck } from "lucide-react";
import { api, qs } from "../lib/api";
import { useMediaQuery, useTitle } from "../lib/hooks";
import type { Listing } from "../lib/types";
import ListingCard, { ListingCardSkeleton } from "../components/ListingCard";
import MapView from "../components/MapView";
import { CategoryBar, FiltersModal, countFilters } from "../components/Filters";
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
      <div className="sticky top-[81px] z-20 bg-white md:top-[80px]">
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

            {data && data.pages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-2">
                {Array.from({ length: data.pages }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => (setParam("page", i ? String(i + 1) : null), window.scrollTo({ top: 0, behavior: "smooth" }))}
                    className={clsx("h-9 w-9 rounded-full text-sm font-semibold", data.page === i + 1 ? "bg-ink text-white" : "hover:bg-ink-bg")}
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
        onClick={() => {
          if (showMap || params.get("bounds")) {
            setShowMap(false);
            setParam("bounds", null);
          } else setShowMap(true);
        }}
        className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 py-3.5 text-sm font-semibold text-white shadow-pop transition hover:scale-105 md:bottom-10"
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
