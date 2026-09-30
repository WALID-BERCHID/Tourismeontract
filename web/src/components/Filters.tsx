import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, SlidersHorizontal, Zap } from "lucide-react";
import { useMeta } from "../lib/hooks";
import { useCurrency } from "../lib/currency";
import { CATEGORY_ICONS, ChainIcon, amenityIcon } from "./icons";
import { Button, Counter, Modal, Toggle } from "./ui";

export function CategoryBar({ onFilters, filterCount }: { onFilters: () => void; filterCount: number }) {
  const { data: meta } = useMeta();
  const [params, setParams] = useSearchParams();
  const active = params.get("category");
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: true });

  const onScroll = () => {
    const el = scroller.current;
    if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    onScroll();
  }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id && id !== active) next.set("category", id);
    else next.delete("category");
    next.delete("page");
    setParams(next);
  };

  return (
    <div className="flex items-center gap-6">
      <div className="relative min-w-0 flex-1">
        {edges.left && (
          <button type="button" aria-label="Scroll left" onClick={() => scroller.current?.scrollBy({ left: -400, behavior: "smooth" })} className="absolute left-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-ink-line bg-white shadow-sm hover:shadow-card">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div ref={scroller} onScroll={onScroll} className="scrollbar-hide flex gap-8 overflow-x-auto scroll-smooth">
          {meta?.categories.map((c) => {
            const Icon = CATEGORY_ICONS[c.icon];
            const on = active === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className={clsx("group flex shrink-0 flex-col items-center gap-2 border-b-2 pb-3 pt-4 text-xs font-semibold transition", on ? "border-ink text-ink" : "border-transparent text-ink-muted hover:border-ink-line hover:text-ink")}
              >
                {Icon && <Icon className="h-6 w-6" strokeWidth={1.5} />}
                <span className="whitespace-nowrap">{c.label}</span>
              </button>
            );
          })}
        </div>
        {edges.right && (
          <button type="button" aria-label="Scroll right" onClick={() => scroller.current?.scrollBy({ left: 400, behavior: "smooth" })} className="absolute right-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-ink-line bg-white shadow-sm hover:shadow-card">
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {edges.right && <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white" />}
      </div>
      <button type="button" onClick={onFilters} className="relative hidden shrink-0 items-center gap-2 rounded-xl border border-ink-line px-4 py-3 text-xs font-semibold hover:border-ink hover:bg-ink-bg sm:flex">
        <SlidersHorizontal className="h-4 w-4" /> Filters
        {filterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-white">{filterCount}</span>}
      </button>
    </div>
  );
}

const FILTER_KEYS = ["roomType", "minPrice", "maxPrice", "bedrooms", "beds", "baths", "amenities", "propertyTypes", "instantBook", "network"];

export function countFilters(params: URLSearchParams) {
  return FILTER_KEYS.reduce((n, k) => n + (params.get(k) ? (k === "amenities" || k === "propertyTypes" ? params.get(k)!.split(",").length : 1) : 0), 0);
}

export function FiltersModal({ open, onClose, total, priceRange }: { open: boolean; onClose: () => void; total?: number; priceRange?: { min: number; max: number } | null }) {
  const { data: meta } = useMeta();
  const { fmt } = useCurrency();
  const [params, setParams] = useSearchParams();
  const init = () => ({
    roomType: params.get("roomType") || "",
    minPrice: params.get("minPrice") || "",
    maxPrice: params.get("maxPrice") || "",
    bedrooms: Number(params.get("bedrooms") || 0),
    beds: Number(params.get("beds") || 0),
    baths: Number(params.get("baths") || 0),
    amenities: new Set((params.get("amenities") || "").split(",").filter(Boolean)),
    propertyTypes: new Set((params.get("propertyTypes") || "").split(",").filter(Boolean)),
    instantBook: params.get("instantBook") === "1",
    network: params.get("network") || "",
  });
  const [f, setF] = useState(init);
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  useEffect(() => {
    if (open) setF(init());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    const next = new URLSearchParams(params);
    const setOrDel = (k: string, v: string | number | boolean) => (v && v !== "0" ? next.set(k, String(v === true ? 1 : v)) : next.delete(k));
    setOrDel("roomType", f.roomType);
    setOrDel("minPrice", f.minPrice);
    setOrDel("maxPrice", f.maxPrice);
    setOrDel("bedrooms", f.bedrooms);
    setOrDel("beds", f.beds);
    setOrDel("baths", f.baths);
    setOrDel("amenities", [...f.amenities].join(","));
    setOrDel("propertyTypes", [...f.propertyTypes].join(","));
    setOrDel("instantBook", f.instantBook);
    setOrDel("network", f.network);
    next.delete("page");
    setParams(next);
    onClose();
  };

  const toggleSet = (key: "amenities" | "propertyTypes", v: string) =>
    setF((p) => {
      const s = new Set(p[key]);
      if (s.has(v)) s.delete(v);
      else s.add(v);
      return { ...p, [key]: s };
    });

  const chip = (on: boolean) => clsx("rounded-full border px-5 py-2.5 text-sm transition", on ? "border-ink bg-ink text-white" : "border-ink-line hover:border-ink");
  const amenities = meta?.amenities || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filters"
      size="lg"
      footer={
        <div className="flex items-center justify-between">
          <Button variant="link" onClick={() => setF({ roomType: "", minPrice: "", maxPrice: "", bedrooms: 0, beds: 0, baths: 0, amenities: new Set(), propertyTypes: new Set(), instantBook: false, network: "" })}>
            Clear all
          </Button>
          <Button variant="dark" onClick={apply}>
            Show {total != null ? `${total} ` : ""}places
          </Button>
        </div>
      }
    >
      <div className="divide-y divide-ink-faint px-6">
        <section className="py-8">
          <h3 className="text-[22px] font-semibold">Type of place</h3>
          <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-2xl border border-ink-line text-sm font-medium">
            {[
              ["", "Any type"],
              ["entire", "Entire home"],
              ["private", "Room"],
            ].map(([v, label]) => (
              <button key={v} type="button" onClick={() => setF({ ...f, roomType: v })} className={clsx("py-4 transition", f.roomType === v ? "bg-ink text-white" : "hover:bg-ink-bg")}>
                {label}
              </button>
            ))}
          </div>
        </section>
        <section className="py-8">
          <h3 className="text-[22px] font-semibold">Price range</h3>
          <p className="text-sm text-ink-muted">Nightly prices before fees{priceRange ? ` · from ${fmt(priceRange.min, false)} to ${fmt(priceRange.max, false)}` : ""}</p>
          <div className="mt-5 flex items-center gap-4">
            <label className="flex-1 rounded-xl border border-ink-line px-4 py-2">
              <span className="block text-xs text-ink-muted">Minimum (USD)</span>
              <input inputMode="numeric" value={f.minPrice} onChange={(e) => setF({ ...f, minPrice: e.target.value.replace(/\D/g, "") })} placeholder="10" className="w-full text-[15px] focus:outline-none" />
            </label>
            <span className="text-ink-muted">–</span>
            <label className="flex-1 rounded-xl border border-ink-line px-4 py-2">
              <span className="block text-xs text-ink-muted">Maximum (USD)</span>
              <input inputMode="numeric" value={f.maxPrice} onChange={(e) => setF({ ...f, maxPrice: e.target.value.replace(/\D/g, "") })} placeholder="1000+" className="w-full text-[15px] focus:outline-none" />
            </label>
          </div>
        </section>
        <section className="py-6">
          <h3 className="mb-2 text-[22px] font-semibold">Rooms and beds</h3>
          <Counter label="Bedrooms" value={f.bedrooms} onChange={(v) => setF({ ...f, bedrooms: v })} max={10} />
          <Counter label="Beds" value={f.beds} onChange={(v) => setF({ ...f, beds: v })} max={16} />
          <Counter label="Bathrooms" value={f.baths} onChange={(v) => setF({ ...f, baths: v })} max={8} />
        </section>
        <section className="py-8">
          <h3 className="text-[22px] font-semibold">Amenities</h3>
          <div className="mt-5 flex flex-wrap gap-3">
            {(showAllAmenities ? amenities : amenities.slice(0, 12)).map((a) => {
              const Icon = amenityIcon(a.id);
              return (
                <button key={a.id} type="button" onClick={() => toggleSet("amenities", a.id)} className={clsx(chip(f.amenities.has(a.id)), "flex items-center gap-2")}>
                  <Icon className="h-4 w-4" /> {a.label}
                </button>
              );
            })}
          </div>
          {amenities.length > 12 && (
            <Button variant="link" className="mt-5" onClick={() => setShowAllAmenities((s) => !s)}>
              {showAllAmenities ? "Show less" : "Show more"}
            </Button>
          )}
        </section>
        <section className="py-8">
          <h3 className="text-[22px] font-semibold">Property type</h3>
          <div className="mt-5 flex flex-wrap gap-3">
            {meta?.propertyTypes.map((t) => (
              <button key={t} type="button" onClick={() => toggleSet("propertyTypes", t)} className={chip(f.propertyTypes.has(t))}>
                {t}
              </button>
            ))}
          </div>
        </section>
        <section className="py-8">
          <h3 className="text-[22px] font-semibold">Pay with</h3>
          <p className="text-sm text-ink-muted">Only show places accepting escrow payments on this network</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => setF({ ...f, network: "" })} className={chip(!f.network)}>
              Any network
            </button>
            {meta?.networks.map((n) => (
              <button key={n.id} type="button" onClick={() => setF({ ...f, network: n.id })} className={clsx(chip(f.network === n.id), "flex items-center gap-2")}>
                <ChainIcon chain={n.chain} /> {n.name}
              </button>
            ))}
          </div>
        </section>
        <section className="flex items-center justify-between gap-6 py-8">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Zap className="h-5 w-5" /> Instant Book
            </h3>
            <p className="text-sm text-ink-muted">Listings you can book without waiting for host approval</p>
          </div>
          <Toggle checked={f.instantBook} onChange={(v) => setF({ ...f, instantBook: v })} label="Instant Book" />
        </section>
      </div>
    </Modal>
  );
}
