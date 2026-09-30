import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { MapPin, Search, X } from "lucide-react";
import { api, qs } from "../lib/api";
import { useClickOutside, useDebounced } from "../lib/hooks";
import { shortDate } from "../lib/format";
import DateRangePicker from "./DateRangePicker";
import { Button, Counter, Modal } from "./ui";

type Panel = "where" | "checkIn" | "checkOut" | "who" | null;

export interface SearchState {
  location: string;
  checkIn: string | null;
  checkOut: string | null;
  adults: number;
  children: number;
  infants: number;
  pets: number;
}

export function useSearchState(): SearchState {
  const [p] = useSearchParams();
  return {
    location: p.get("location") || "",
    checkIn: p.get("checkIn"),
    checkOut: p.get("checkOut"),
    adults: Number(p.get("adults") || 0),
    children: Number(p.get("children") || 0),
    infants: Number(p.get("infants") || 0),
    pets: Number(p.get("pets") || 0),
  };
}

const guestLabel = (s: SearchState) => {
  const g = s.adults + s.children;
  if (!g) return null;
  let label = `${g} guest${g > 1 ? "s" : ""}`;
  if (s.infants) label += `, ${s.infants} infant${s.infants > 1 ? "s" : ""}`;
  if (s.pets) label += `, ${s.pets} pet${s.pets > 1 ? "s" : ""}`;
  return label;
};

function Suggestions({ query, onPick }: { query: string; onPick: (v: string) => void }) {
  const q = useDebounced(query, 150);
  const { data } = useQuery({
    queryKey: ["suggestions", q],
    queryFn: () => api.get<{ label: string; city: string; country: string; count: number }[]>(`/listings/suggestions?q=${encodeURIComponent(q)}`),
    staleTime: 60_000,
  });
  return (
    <div className="py-2">
      {!q && <div className="px-4 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Popular destinations</div>}
      <button type="button" onClick={() => onPick("")} className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left hover:bg-ink-bg">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-bg text-xl">🌍</span>
        <span>
          <span className="block font-medium">I'm flexible</span>
          <span className="block text-sm text-ink-muted">Explore stays everywhere</span>
        </span>
      </button>
      {data?.map((s) => (
        <button key={s.label} type="button" onClick={() => onPick(s.label)} className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left hover:bg-ink-bg">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-bg">
            <MapPin className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-medium">{s.label}</span>
            <span className="block text-sm text-ink-muted">
              {s.count} stay{s.count > 1 ? "s" : ""}
            </span>
          </span>
        </button>
      ))}
      {q && data?.length === 0 && <div className="px-4 py-3 text-sm text-ink-muted">No destinations match “{q}” yet – press search to look anyway.</div>}
    </div>
  );
}

function GuestsPanel({ s, set }: { s: SearchState; set: (p: Partial<SearchState>) => void }) {
  return (
    <div className="divide-y divide-ink-faint">
      <Counter label="Adults" sub="Ages 13 or above" value={s.adults} onChange={(v) => set({ adults: v })} max={16} />
      <Counter label="Children" sub="Ages 2 – 12" value={s.children} onChange={(v) => set({ children: v, adults: Math.max(s.adults, v ? 1 : 0) })} max={15} />
      <Counter label="Infants" sub="Under 2" value={s.infants} onChange={(v) => set({ infants: v, adults: Math.max(s.adults, v ? 1 : 0) })} max={5} />
      <Counter label="Pets" sub="Bringing a service animal?" value={s.pets} onChange={(v) => set({ pets: v, adults: Math.max(s.adults, v ? 1 : 0) })} max={5} />
    </div>
  );
}

function useSubmit() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (s: SearchState) => {
    const keep = Object.fromEntries([...params.entries()].filter(([k]) => ["category", "minPrice", "maxPrice", "amenities", "roomType", "instantBook", "sort"].includes(k)));
    navigate(
      `/${qs({
        ...keep,
        location: s.location,
        checkIn: s.checkIn && s.checkOut ? s.checkIn : null,
        checkOut: s.checkIn && s.checkOut ? s.checkOut : null,
        adults: s.adults || null,
        children: s.children || null,
        infants: s.infants || null,
        pets: s.pets || null,
      })}`
    );
  };
}

/** Desktop expanded search bar (Where · Check in · Check out · Who). */
export function SearchBar({ onDone, autoOpen }: { onDone?: () => void; autoOpen?: Panel }) {
  const initial = useSearchState();
  const [s, setS] = useState<SearchState>(initial);
  const [panel, setPanel] = useState<Panel>(autoOpen ?? null);
  const submit = useSubmit();
  const set = (p: Partial<SearchState>) => setS((prev) => ({ ...prev, ...p }));
  const close = useCallback(() => setPanel(null), []);
  const ref = useClickOutside<HTMLDivElement>(close, panel !== null);

  useEffect(() => setS(initial), [initial.location, initial.checkIn, initial.checkOut, initial.adults]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = () => {
    submit(s);
    setPanel(null);
    onDone?.();
  };

  const seg = (id: Panel, extra?: string, row = false) =>
    clsx("relative flex h-full rounded-full px-6 text-left transition", row ? "flex-row items-center justify-between" : "flex-col justify-center", panel === id ? "bg-white shadow-card" : "hover:bg-ink-faint/70", extra);

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[850px]">
      <div className={clsx("flex h-[66px] items-center rounded-full border border-ink-line shadow-search transition", panel ? "bg-ink-bg" : "bg-white")}>
        <div className={seg("where", "flex-[1.4] cursor-text")} onClick={() => setPanel("where")}>
          <label className="text-xs font-semibold">Where</label>
          <div className="flex items-center">
            <input
              value={s.location}
              onChange={(e) => set({ location: e.target.value })}
              onFocus={() => setPanel("where")}
              onKeyDown={(e) => e.key === "Enter" && go()}
              placeholder="Search destinations"
              className="w-full truncate bg-transparent text-sm placeholder:text-ink-muted focus:outline-none"
            />
            {s.location && panel === "where" && (
              <button type="button" aria-label="Clear" onClick={(e) => (e.stopPropagation(), set({ location: "" }))} className="ml-1 rounded-full bg-ink-faint p-1">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <span className="h-8 w-px bg-ink-line" />
        <button type="button" className={seg("checkIn", "flex-1")} onClick={() => setPanel("checkIn")}>
          <span className="text-xs font-semibold">Check in</span>
          <span className={clsx("text-sm", !s.checkIn && "text-ink-muted")}>{s.checkIn ? shortDate(s.checkIn) : "Add dates"}</span>
        </button>
        <span className="h-8 w-px bg-ink-line" />
        <button type="button" className={seg("checkOut", "flex-1")} onClick={() => setPanel("checkOut")}>
          <span className="text-xs font-semibold">Check out</span>
          <span className={clsx("text-sm", !s.checkOut && "text-ink-muted")}>{s.checkOut ? shortDate(s.checkOut) : "Add dates"}</span>
        </button>
        <span className="h-8 w-px bg-ink-line" />
        <div className={seg("who", "min-w-0 flex-[1.3] gap-2 pr-2", true)} onClick={() => setPanel("who")} role="button" tabIndex={0}>
          <span className="flex min-w-0 flex-col">
            <span className="text-xs font-semibold">Who</span>
            <span className={clsx("truncate text-sm", !guestLabel(s) && "text-ink-muted")}>{guestLabel(s) || "Add guests"}</span>
          </span>
          <button
            type="button"
            onClick={(e) => (e.stopPropagation(), go())}
            className={clsx(
              "flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#E61E4D] to-[#D70466] text-white transition-all hover:brightness-110",
              panel ? "px-5" : "w-12"
            )}
            aria-label="Search"
          >
            <Search className="h-4 w-4" strokeWidth={3} />
            {panel && <span className="font-semibold">Search</span>}
          </button>
        </div>
      </div>

      {panel && (
        <div
          className={clsx(
            "absolute top-[76px] z-50 animate-fade-in overflow-hidden rounded-[32px] bg-white p-4 shadow-pop",
            panel === "where" && "left-0 w-[420px]",
            (panel === "checkIn" || panel === "checkOut") && "left-0 right-0 p-8",
            panel === "who" && "right-0 w-[400px] px-8 py-4"
          )}
        >
          {panel === "where" && (
            <Suggestions
              query={s.location}
              onPick={(v) => {
                set({ location: v });
                setPanel("checkIn");
              }}
            />
          )}
          {(panel === "checkIn" || panel === "checkOut") && (
            <>
              <DateRangePicker
                checkIn={s.checkIn}
                checkOut={s.checkOut}
                onChange={(a, b) => {
                  set({ checkIn: a, checkOut: b });
                  if (a && !b) setPanel("checkOut");
                  if (a && b) setPanel("who");
                }}
              />
              <div className="mt-6 flex justify-end">
                <Button variant="link" onClick={() => set({ checkIn: null, checkOut: null })}>
                  Clear dates
                </Button>
              </div>
            </>
          )}
          {panel === "who" && <GuestsPanel s={s} set={set} />}
        </div>
      )}
    </div>
  );
}

/** Compact pill shown in the header when scrolled / on inner pages. */
export function SearchPill({ onOpen }: { onOpen: (p: Panel) => void }) {
  const s = useSearchState();
  const dates = s.checkIn && s.checkOut ? `${shortDate(s.checkIn)} – ${shortDate(s.checkOut)}` : "Any week";
  return (
    <div className="flex h-12 items-center rounded-full border border-ink-line bg-white pl-6 pr-2 text-sm shadow-search transition hover:shadow-card">
      <button type="button" className="truncate font-semibold" onClick={() => onOpen("where")}>
        {s.location ? s.location.split(",")[0] : "Anywhere"}
      </button>
      <span className="mx-4 h-6 w-px bg-ink-line" />
      <button type="button" className="truncate font-semibold" onClick={() => onOpen("checkIn")}>
        {dates}
      </button>
      <span className="mx-4 h-6 w-px bg-ink-line" />
      <button type="button" className={clsx("truncate", guestLabel(s) ? "font-semibold" : "text-ink-muted")} onClick={() => onOpen("who")}>
        {guestLabel(s) || "Add guests"}
      </button>
      <button type="button" aria-label="Search" onClick={() => onOpen("where")} className="ml-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
        <Search className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
    </div>
  );
}

/** Mobile full-screen search. */
export function MobileSearch() {
  const initial = useSearchState();
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<SearchState>(initial);
  const [step, setStep] = useState<"where" | "when" | "who">("where");
  const submit = useSubmit();
  const set = (p: Partial<SearchState>) => setS((prev) => ({ ...prev, ...p }));

  return (
    <>
      <button
        type="button"
        onClick={() => (setS(initial), setStep("where"), setOpen(true))}
        className="flex w-full items-center gap-3 rounded-full border border-ink-line bg-white px-5 py-2.5 text-left shadow-search"
      >
        <Search className="h-5 w-5" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{initial.location || "Where to?"}</span>
          <span className="block truncate text-xs text-ink-muted">
            {initial.checkIn && initial.checkOut ? `${shortDate(initial.checkIn)} – ${shortDate(initial.checkOut)}` : "Anywhere · Any week"} · {guestLabel(initial) || "Add guests"}
          </span>
        </span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="full"
        title="Search"
        footer={
          <div className="flex items-center justify-between">
            <Button variant="link" onClick={() => setS({ location: "", checkIn: null, checkOut: null, adults: 0, children: 0, infants: 0, pets: 0 })}>
              Clear all
            </Button>
            <Button
              onClick={() => {
                submit(s);
                setOpen(false);
              }}
            >
              <Search className="h-4 w-4" /> Search
            </Button>
          </div>
        }
      >
        <div className="space-y-3 bg-ink-bg p-4">
          <section className="rounded-2xl bg-white p-5 shadow-sm" onClick={() => setStep("where")}>
            {step === "where" ? (
              <>
                <h3 className="mb-4 text-2xl font-bold">Where to?</h3>
                <input autoFocus value={s.location} onChange={(e) => set({ location: e.target.value })} placeholder="Search destinations" className="w-full rounded-xl border border-ink-line px-4 py-3.5 focus:border-ink focus:outline-none" />
                <Suggestions query={s.location} onPick={(v) => (set({ location: v }), setStep("when"))} />
              </>
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Where</span>
                <span className="font-semibold">{s.location || "I'm flexible"}</span>
              </div>
            )}
          </section>
          <section className="rounded-2xl bg-white p-5 shadow-sm" onClick={() => step !== "when" && setStep("when")}>
            {step === "when" ? (
              <>
                <h3 className="mb-4 text-2xl font-bold">When's your trip?</h3>
                <DateRangePicker checkIn={s.checkIn} checkOut={s.checkOut} months={1} onChange={(a, b) => (set({ checkIn: a, checkOut: b }), a && b && setStep("who"))} />
              </>
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">When</span>
                <span className="font-semibold">{s.checkIn && s.checkOut ? `${shortDate(s.checkIn)} – ${shortDate(s.checkOut)}` : "Add dates"}</span>
              </div>
            )}
          </section>
          <section className="rounded-2xl bg-white p-5 shadow-sm" onClick={() => step !== "who" && setStep("who")}>
            {step === "who" ? (
              <>
                <h3 className="mb-2 text-2xl font-bold">Who's coming?</h3>
                <GuestsPanel s={s} set={set} />
              </>
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Who</span>
                <span className="font-semibold">{guestLabel(s) || "Add guests"}</span>
              </div>
            )}
          </section>
        </div>
      </Modal>
    </>
  );
}
