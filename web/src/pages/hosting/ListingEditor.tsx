import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import clsx from "clsx";
import { toast } from "sonner";
import { parseEther } from "ethers";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ExternalLink, ImagePlus, Link2, Loader2, MapPin, Search, Star, Trash2, X } from "lucide-react";
import { ApiError, api } from "../../lib/api";
import { useMeta, useRates, useTitle } from "../../lib/hooks";
import { POLICY_TEXT, fromDay, toDay, todayDay } from "../../lib/format";
import { ZERO, evmEscrow, evmPublishListing } from "../../lib/chains/evm";
import { solanaPublishListing } from "../../lib/chains/solana";
import { eosPublishListing } from "../../lib/chains/eos";
import { errorMessage } from "../../lib/payments";
import type { Listing, Network } from "../../lib/types";
import DateRangePicker from "../../components/DateRangePicker";
import { CATEGORY_ICONS, ChainIcon, amenityIcon } from "../../components/icons";
import { Alert, Button, Container, Counter, Img, Input, PageLoader, Textarea, Toggle } from "../../components/ui";

type Draft = {
  title: string;
  propertyType: string;
  roomType: "entire" | "private" | "shared";
  category: string;
  description: string;
  city: string;
  region: string;
  country: string;
  neighborhood: string;
  address: string;
  lat: number | null;
  lng: number | null;
  guests: number;
  bedrooms: number;
  beds: number;
  baths: number;
  amenities: string[];
  photos: string[];
  houseRules: string[];
  priceUsd: number;
  cleaningFeeUsd: number;
  cancellationPolicy: "flexible" | "moderate" | "strict";
  minNights: number;
  maxNights: number;
  instantBook: boolean;
  checkInTime: string;
  checkOutTime: string;
  status: "draft" | "published" | "unlisted";
};

const EMPTY: Draft = {
  title: "",
  propertyType: "",
  roomType: "entire",
  category: "",
  description: "",
  city: "",
  region: "",
  country: "",
  neighborhood: "",
  address: "",
  lat: null,
  lng: null,
  guests: 2,
  bedrooms: 1,
  beds: 1,
  baths: 1,
  amenities: ["wifi", "essentials"],
  photos: [],
  houseRules: ["No smoking", "No parties or events"],
  priceUsd: 80,
  cleaningFeeUsd: 20,
  cancellationPolicy: "flexible",
  minNights: 1,
  maxNights: 30,
  instantBook: true,
  checkInTime: "15:00",
  checkOutTime: "11:00",
  status: "draft",
};

const STEPS = [
  { id: "type", label: "Property type" },
  { id: "location", label: "Location" },
  { id: "basics", label: "Guests & rooms" },
  { id: "amenities", label: "Amenities" },
  { id: "photos", label: "Photos" },
  { id: "description", label: "Title & description" },
  { id: "pricing", label: "Pricing & policies" },
  { id: "publish", label: "Review & publish" },
] as const;
type StepId = (typeof STEPS)[number]["id"] | "availability" | "payments";

function validate(step: StepId, d: Draft): string | null {
  switch (step) {
    case "type":
      return !d.propertyType ? "Choose a property type" : !d.category ? "Choose a category" : null;
    case "location":
      return !d.city || !d.country ? "Add a city and country" : d.lat == null ? "Place the pin on the map" : null;
    case "photos":
      return d.photos.length < 1 ? "Add at least one photo (5+ recommended)" : null;
    case "description":
      return d.title.trim().length < 10 ? "Title needs at least 10 characters" : d.description.trim().length < 30 ? "Description needs at least 30 characters" : null;
    case "pricing":
      return d.priceUsd < 10 ? "Minimum price is $10" : d.maxNights < d.minNights ? "Maximum nights must be ≥ minimum" : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Location picker
// ---------------------------------------------------------------------------

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}
function Recenter({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], Math.max(map.getZoom(), 13));
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function LocationStep({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ display_name: string; lat: string; lon: string; address: Record<string, string> }[]>([]);
  const [searching, setSearching] = useState(false);
  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "en" } });
      setResults(await r.json());
    } catch {
      toast.error("Address search is unavailable – place the pin on the map and fill the fields manually.");
    } finally {
      setSearching(false);
    }
  };
  const pick = (r: (typeof results)[number]) => {
    const a = r.address || {};
    set({
      lat: Number(r.lat),
      lng: Number(r.lon),
      city: a.city || a.town || a.village || a.municipality || d.city,
      region: a.state || a.region || d.region,
      country: a.country || d.country,
      neighborhood: a.suburb || a.neighbourhood || d.neighborhood,
      address: r.display_name.split(",").slice(0, 3).join(","),
    });
    setResults([]);
  };
  return (
    <div className="space-y-5">
      <div className="relative">
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="Search for your address" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} />
          <Button type="button" variant="dark" onClick={search} loading={searching}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        {results.length > 0 && (
          <div className="absolute z-[500] mt-2 w-full overflow-hidden rounded-xl bg-white shadow-pop">
            {results.map((r) => (
              <button key={r.display_name} type="button" onClick={() => pick(r)} className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-ink-bg">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="h-[340px] overflow-hidden rounded-2xl border border-ink-line">
        <MapContainer center={[d.lat ?? 31.63, d.lng ?? -7.99]} zoom={d.lat ? 13 : 5} className="h-full w-full">
          <TileLayer attribution="&copy; OpenStreetMap &copy; CARTO" url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          <ClickToPlace onPick={(lat, lng) => set({ lat, lng })} />
          <Recenter lat={d.lat} lng={d.lng} />
          {d.lat != null && d.lng != null && (
            <Marker
              position={[d.lat, d.lng]}
              draggable
              eventHandlers={{ dragend: (e) => set({ lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng }) }}
              icon={L.divIcon({ className: "", html: '<div class="home-pin"></div>', iconSize: [0, 0] })}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-sm text-ink-muted">Click the map or drag the pin to your exact location. Guests only see an approximate area until they book.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Street address (private)" value={d.address} onChange={(e) => set({ address: e.target.value })} />
        <Input label="Neighborhood / landmark" value={d.neighborhood} onChange={(e) => set({ neighborhood: e.target.value })} />
        <Input label="City" value={d.city} onChange={(e) => set({ city: e.target.value })} />
        <Input label="State / region" value={d.region} onChange={(e) => set({ region: e.target.value })} />
        <Input label="Country" value={d.country} onChange={(e) => set({ country: e.target.value })} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

function PhotosStep({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [url, setUrl] = useState("");
  const upload = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append("photos", f));
      const { urls } = await api.post<{ urls: string[] }>("/uploads", fd);
      set({ photos: [...d.photos, ...urls] });
      toast.success(`${urls.length} photo${urls.length > 1 ? "s" : ""} uploaded`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const move = (i: number, dir: number) => {
    const p = [...d.photos];
    const j = i + dir;
    if (j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]];
    set({ photos: p });
  };
  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => (e.preventDefault(), setDrag(false), upload(e.dataTransfer.files))}
        className={clsx("flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition", drag ? "border-ink bg-ink-bg" : "border-ink-line")}
      >
        {uploading ? <Loader2 className="h-10 w-10 animate-spin" /> : <ImagePlus className="h-10 w-10" strokeWidth={1.3} />}
        <p className="mt-3 text-lg font-semibold">Drag your photos here</p>
        <p className="text-sm text-ink-muted">JPG, PNG or WebP · up to 10 MB each · 5 or more recommended</p>
        <Button type="button" variant="outline" className="mt-5" onClick={() => input.current?.click()}>
          Upload from your device
        </Button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>
      <div className="flex gap-2">
        <Input className="flex-1" placeholder="…or paste an image URL (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button type="button" variant="outline" disabled={!/^https?:\/\//.test(url)} onClick={() => (set({ photos: [...d.photos, url] }), setUrl(""))}>
          <Link2 className="h-4 w-4" /> Add
        </Button>
      </div>
      {d.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {d.photos.map((p, i) => (
            <div key={`${p}-${i}`} className={clsx("group relative overflow-hidden rounded-xl", i === 0 && "col-span-2 sm:col-span-3")}>
              <Img src={p} alt={`Photo ${i + 1}`} seed={i} className={clsx("w-full", i === 0 ? "aspect-[16/9]" : "aspect-[4/3]")} />
              {i === 0 && <span className="absolute left-3 top-3 rounded-md bg-white px-2.5 py-1 text-xs font-semibold shadow">Cover photo</span>}
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                {i > 0 && (
                  <button type="button" onClick={() => move(i, -1)} aria-label="Move left" className="rounded-full bg-white p-1.5 shadow">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                {i < d.photos.length - 1 && (
                  <button type="button" onClick={() => move(i, 1)} aria-label="Move right" className="rounded-full bg-white p-1.5 shadow">
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                <button type="button" onClick={() => set({ photos: d.photos.filter((_, j) => j !== i) })} aria-label="Remove" className="rounded-full bg-white p-1.5 shadow">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// On-chain payments panel
// ---------------------------------------------------------------------------

function PaymentsPanel({ listing, onChange }: { listing: Listing; onChange: () => void }) {
  const { data: meta } = useMeta();
  const { data: rates } = useRates();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const publish = async (net: Network) => {
    if (!rates) return;
    setBusy(net.id);
    try {
      const policy = listing.cancellationPolicy || "flexible";
      const uri = `${window.location.origin}/rooms/${listing.id}`;
      let result: { listingId: string; txHash: string };
      if (net.chain === "evm") {
        const nativeUsd = rates.usd[net.nativeSymbol] || rates.usd.ETH;
        const native = (usd: number) => parseEther((usd / nativeUsd).toFixed(8));
        const usdc = net.tokens.find((t) => t.symbol === "USDC");
        result = await evmPublishListing(
          net,
          {
            policy,
            minNights: listing.minNights || 1,
            maxNights: listing.maxNights || 30,
            uri,
            prices: [
              { token: ZERO, nightly: native(listing.priceUsd), cleaning: native(listing.cleaningFeeUsd) },
              ...(usdc ? [{ token: usdc.address!, nightly: BigInt(Math.round(listing.priceUsd * 1e6)), cleaning: BigInt(Math.round(listing.cleaningFeeUsd * 1e6)) }] : []),
            ],
          },
          setProgress
        );
      } else if (net.chain === "solana") {
        setProgress("Confirm in your Solana wallet…");
        const lamports = (usd: number) => BigInt(Math.round((usd / (rates.usd.SOL || 150)) * 1e9));
        result = await solanaPublishListing(net, { policy, minNights: listing.minNights || 1, maxNights: listing.maxNights || 30, nightlyLamports: lamports(listing.priceUsd), cleaningLamports: lamports(listing.cleaningFeeUsd), uri });
      } else {
        setProgress("Confirm in Anchor…");
        const eos = (usd: number) => usd / (rates.usd.EOS || 0.6);
        result = await eosPublishListing(net, { policy, minNights: listing.minNights || 1, maxNights: listing.maxNights || 30, nightlyEos: eos(listing.priceUsd), cleaningEos: eos(listing.cleaningFeeUsd), uri });
      }
      setProgress("Saving…");
      await api.post(`/listings/${listing.id}/chains`, { network: net.id, chainListingId: result.listingId, txHash: result.txHash });
      toast.success(`Bookable on ${net.name}`);
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : errorMessage(e));
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-ink-soft">
        Choose where guests can pay. Publishing creates your listing in the escrow contract with your price, stay limits and cancellation policy – guests' payments and your payouts are then handled entirely on-chain.
      </p>
      <Alert tone="info">Your wallet must be linked to your account (Account → Wallets) so we can verify you own the on-chain listing.</Alert>
      {meta?.networks.map((n) => {
        const pub = listing.chains.find((c) => c.network === n.id);
        return (
          <div key={n.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink-line p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-bg">
              <ChainIcon chain={n.chain} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{n.name}</div>
              <div className="text-sm text-ink-muted">{pub ? `Listing #${pub.chainListingId} · accepting ${n.tokens.map((t) => t.symbol).join(", ")}` : `Accept ${n.tokens.map((t) => t.symbol).join(", ")}`}</div>
            </div>
            {pub ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                <Check className="h-4 w-4" /> Live
              </span>
            ) : (
              <Button variant="dark" size="sm" onClick={() => publish(n)} loading={busy === n.id} disabled={!!busy || listing.status !== "published"}>
                Enable
              </Button>
            )}
          </div>
        );
      })}
      {progress && <p className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" /> {progress}</p>}
      {listing.status !== "published" && <p className="text-sm text-ink-muted">Publish the listing first to enable on-chain payments.</p>}
      <p className="text-xs text-ink-muted">Native coin prices are converted from your USD price at today's rate. USDC prices always match USD exactly.</p>
    </div>
  );
}

function AvailabilityPanel({ listing }: { listing: Listing }) {
  const { data, refetch } = useQuery({ queryKey: ["calendar-host", listing.id], queryFn: () => api.get<{ occupiedDays: number[] }>(`/listings/${listing.id}/calendar`) });
  const { data: meta } = useMeta();
  const [range, setRange] = useState<[string | null, string | null]>([null, null]);
  const [busy, setBusy] = useState(false);
  const occupied = useMemo(() => new Set(data?.occupiedDays || []), [data]);
  const apply = async (blocked: boolean) => {
    if (!range[0] || !range[1]) return;
    const days: number[] = [];
    for (let d = toDay(range[0]); d < toDay(range[1]); d++) days.push(d);
    setBusy(true);
    try {
      await api.put(`/listings/${listing.id}/blocked`, { days, blocked });
      // Mirror on-chain so the escrow also rejects these nights.
      for (const c of listing.chains.filter((x) => x.chain === "evm")) {
        const net = meta?.networks.find((n) => n.id === c.network);
        if (net) await evmEscrow.setBlockedDays(net, c.chainListingId, days, blocked).catch((e) => toast.error(`${net.name}: ${errorMessage(e)}`));
      }
      toast.success(blocked ? "Dates blocked" : "Dates reopened");
      setRange([null, null]);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <p className="mb-6 text-ink-soft">Select a range to block nights (e.g. personal use, bookings elsewhere) or reopen blocked nights. Booked nights are struck through.</p>
      <DateRangePicker checkIn={range[0]} checkOut={range[1]} onChange={(a, b) => setRange([a, b])} occupied={occupied} />
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="dark" disabled={!range[1]} loading={busy} onClick={() => apply(true)}>
          Block selected nights
        </Button>
        <Button variant="outline" disabled={!range[1]} loading={busy} onClick={() => apply(false)}>
          Reopen selected nights
        </Button>
      </div>
      <p className="mt-4 text-xs text-ink-muted">Today is {fromDay(todayDay())}. Blocks are also written to the on-chain calendar on EVM networks (one wallet confirmation).</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export default function ListingEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: meta } = useMeta();
  const [d, setD] = useState<Draft>(EMPTY);
  const [step, setStep] = useState<StepId>(isNew ? "type" : "type");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(id ? Number(id) : null);
  const [rule, setRule] = useState("");
  useTitle(isNew ? "Create listing" : "Edit listing");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["edit-listing", savedId],
    queryFn: () => api.get<{ listing: Listing & { address: string | null } }>(`/listings/${savedId}`),
    enabled: !!savedId,
  });
  useEffect(() => {
    if (data?.listing && (!isNew || savedId)) {
      const l = data.listing;
      setD({
        title: l.title,
        propertyType: l.propertyType,
        roomType: l.roomType,
        category: l.category,
        description: l.description || "",
        city: l.city,
        region: l.region,
        country: l.country,
        neighborhood: l.neighborhood || "",
        address: l.address || "",
        lat: l.lat,
        lng: l.lng,
        guests: l.guests,
        bedrooms: l.bedrooms,
        beds: l.beds,
        baths: l.baths,
        amenities: l.amenities || [],
        photos: l.photos,
        houseRules: l.houseRules || [],
        priceUsd: l.priceUsd,
        cleaningFeeUsd: l.cleaningFeeUsd,
        cancellationPolicy: l.cancellationPolicy || "flexible",
        minNights: l.minNights || 1,
        maxNights: l.maxNights || 30,
        instantBook: l.instantBook,
        checkInTime: l.checkInTime || "15:00",
        checkOutTime: l.checkOutTime || "11:00",
        status: l.status,
      });
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p }));
  const idx = STEPS.findIndex((s) => s.id === step);

  const save = async (status?: Draft["status"]) => {
    setSaving(true);
    setError(null);
    try {
      const body = { ...d, status: status || d.status, lat: d.lat ?? 0, lng: d.lng ?? 0 };
      const r = savedId ? await api.patch<{ listing: Listing }>(`/listings/${savedId}`, body) : await api.post<{ listing: Listing }>("/listings", body);
      setSavedId(r.listing.id);
      set({ status: r.listing.status });
      qc.invalidateQueries({ queryKey: ["my-listings"] });
      qc.invalidateQueries({ queryKey: ["listing"] });
      await refetch();
      return r.listing;
    } catch (e) {
      const err = e as ApiError;
      setError(err.fields ? `${err.message}: ${Object.entries(err.fields).map(([k, v]) => `${k} – ${v}`).join("; ")}` : err.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    const v = validate(step, d);
    if (v) return setError(v);
    setError(null);
    if (isNew && idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1].id);
      window.scrollTo({ top: 0 });
    }
  };

  const publish = async () => {
    for (const s of STEPS) {
      const v = validate(s.id, d);
      if (v) {
        setStep(s.id);
        return setError(v);
      }
    }
    const l = await save("published");
    if (l) {
      toast.success("Your listing is live! 🎉");
      setStep("payments");
    }
  };

  if (!isNew && isLoading) return <PageLoader />;

  const chip = (on: boolean) => clsx("rounded-xl border-2 p-4 text-left transition", on ? "border-ink bg-ink-bg" : "border-ink-faint hover:border-ink-line");

  const content: Record<StepId, React.ReactNode> = {
    type: (
      <div className="space-y-10">
        <div>
          <h3 className="mb-4 text-lg font-semibold">Which of these best describes your place?</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {meta?.propertyTypes.map((t) => (
              <button key={t} type="button" onClick={() => set({ propertyType: t })} className={chip(d.propertyType === t)}>
                <span className="font-semibold">{t}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-4 text-lg font-semibold">What type of place will guests have?</h3>
          <div className="space-y-3">
            {(
              [
                ["entire", "An entire place", "Guests have the whole place to themselves."],
                ["private", "A room", "Guests have their own room plus access to shared spaces."],
                ["shared", "A shared room", "Guests sleep in a room or common area shared with others."],
              ] as const
            ).map(([v, t, s]) => (
              <button key={v} type="button" onClick={() => set({ roomType: v })} className={clsx(chip(d.roomType === v), "w-full")}>
                <div className="font-semibold">{t}</div>
                <div className="text-sm text-ink-muted">{s}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-4 text-lg font-semibold">Pick the category guests will find you in</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {meta?.categories.map((c) => {
              const Icon = CATEGORY_ICONS[c.icon];
              return (
                <button key={c.id} type="button" onClick={() => set({ category: c.id })} className={chip(d.category === c.id)}>
                  {Icon && <Icon className="mb-2 h-7 w-7" strokeWidth={1.4} />}
                  <span className="text-sm font-semibold">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    ),
    location: <LocationStep d={d} set={set} />,
    basics: (
      <div className="divide-y divide-ink-faint">
        <Counter label="Guests" value={d.guests} min={1} max={50} onChange={(v) => set({ guests: v })} />
        <Counter label="Bedrooms" value={d.bedrooms} min={0} max={50} onChange={(v) => set({ bedrooms: v })} />
        <Counter label="Beds" value={d.beds} min={1} max={100} onChange={(v) => set({ beds: v })} />
        <Counter label="Bathrooms" value={d.baths} min={0} max={50} onChange={(v) => set({ baths: v })} />
      </div>
    ),
    amenities: (
      <div className="space-y-8">
        {[...new Set(meta?.amenities.map((a) => a.group))].map((g) => (
          <div key={g}>
            <h3 className="mb-3 font-semibold">{g}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {meta?.amenities
                .filter((a) => a.group === g)
                .map((a) => {
                  const Icon = amenityIcon(a.id);
                  const on = d.amenities.includes(a.id);
                  return (
                    <button key={a.id} type="button" onClick={() => set({ amenities: on ? d.amenities.filter((x) => x !== a.id) : [...d.amenities, a.id] })} className={chip(on)}>
                      <Icon className="mb-2 h-6 w-6" strokeWidth={1.4} />
                      <span className="text-sm font-medium">{a.label}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    ),
    photos: <PhotosStep d={d} set={set} />,
    description: (
      <div className="space-y-6">
        <div>
          <Textarea label="Title" rows={2} maxLength={100} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Riad with rooftop pool in the heart of the Medina" hint={`${d.title.length}/100 · Short titles work best. Have fun with it!`} />
        </div>
        <Textarea
          label="Description"
          rows={10}
          maxLength={5000}
          value={d.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Share what makes your place special: the space, the neighbourhood, how guests get around…"
          hint={`${d.description.length}/5000`}
        />
      </div>
    ),
    pricing: (
      <div className="space-y-10">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nightly price (USD)" type="number" min={10} value={d.priceUsd} onChange={(e) => set({ priceUsd: Number(e.target.value) })} hint={`Guests pay about $${Math.round(d.priceUsd * 1.08)} incl. service fee · you earn $${Math.round(d.priceUsd * 0.97)}`} />
          <Input label="Cleaning fee (USD)" type="number" min={0} value={d.cleaningFeeUsd} onChange={(e) => set({ cleaningFeeUsd: Number(e.target.value) })} hint="Charged once per stay" />
          <Input label="Minimum nights" type="number" min={1} max={365} value={d.minNights} onChange={(e) => set({ minNights: Number(e.target.value) })} />
          <Input label="Maximum nights" type="number" min={1} max={365} value={d.maxNights} onChange={(e) => set({ maxNights: Number(e.target.value) })} />
          <Input label="Check-in from" type="time" value={d.checkInTime} onChange={(e) => set({ checkInTime: e.target.value })} />
          <Input label="Checkout by" type="time" value={d.checkOutTime} onChange={(e) => set({ checkOutTime: e.target.value })} />
        </div>
        <div className="flex items-center justify-between gap-6 rounded-2xl border border-ink-line p-5">
          <div>
            <div className="font-semibold">Instant Book</div>
            <div className="text-sm text-ink-muted">Guests can book right away. Turn off to review each request (payment is held in escrow meanwhile).</div>
          </div>
          <Toggle checked={d.instantBook} onChange={(v) => set({ instantBook: v })} />
        </div>
        <div>
          <h3 className="mb-3 text-lg font-semibold">Cancellation policy</h3>
          <div className="space-y-3">
            {(Object.keys(POLICY_TEXT) as (keyof typeof POLICY_TEXT)[]).map((k) => (
              <button key={k} type="button" onClick={() => set({ cancellationPolicy: k })} className={clsx(chip(d.cancellationPolicy === k), "w-full")}>
                <div className="font-semibold">{POLICY_TEXT[k].label}</div>
                <div className="text-sm text-ink-muted">{POLICY_TEXT[k].long}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">The policy is enforced by the escrow contract. Changes apply to new bookings only.</p>
        </div>
        <div>
          <h3 className="mb-3 text-lg font-semibold">House rules</h3>
          <div className="space-y-2">
            {d.houseRules.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-ink-bg px-4 py-3">
                {r}
                <button type="button" onClick={() => set({ houseRules: d.houseRules.filter((_, j) => j !== i) })} aria-label="Remove rule">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input className="flex-1" placeholder="e.g. Quiet hours after 22:00" value={rule} onChange={(e) => setRule(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rule.trim() && (e.preventDefault(), set({ houseRules: [...d.houseRules, rule.trim()] }), setRule(""))} />
            <Button type="button" variant="outline" disabled={!rule.trim()} onClick={() => (set({ houseRules: [...d.houseRules, rule.trim()] }), setRule(""))}>
              Add
            </Button>
          </div>
        </div>
      </div>
    ),
    publish: (
      <div className="space-y-6">
        <div className="overflow-hidden rounded-2xl shadow-card sm:max-w-sm">
          <Img src={d.photos[0]} alt={d.title} className="aspect-[4/3] w-full" />
          <div className="p-5">
            <div className="flex justify-between gap-3">
              <span className="truncate font-semibold">{d.title || "Your listing"}</span>
              <span className="flex items-center gap-1 text-sm">
                New <Star className="h-3.5 w-3.5 fill-current" />
              </span>
            </div>
            <p className="text-sm text-ink-muted">
              {d.city}, {d.country}
            </p>
            <p className="mt-1">
              <b>${d.priceUsd}</b> night
            </p>
          </div>
        </div>
        <ul className="space-y-3 text-ink-soft">
          <li>✓ {d.photos.length} photos · {d.amenities.length} amenities</li>
          <li>
            ✓ {d.guests} guests · {d.bedrooms} bedrooms · {d.beds} beds · {d.baths} baths
          </li>
          <li>
            ✓ {POLICY_TEXT[d.cancellationPolicy].label} cancellation · {d.minNights}–{d.maxNights} nights · {d.instantBook ? "Instant Book" : "Request to book"}
          </li>
        </ul>
        <Alert tone="info">After publishing you'll enable payments on your preferred blockchains – that's when guests can book.</Alert>
      </div>
    ),
    availability: savedId && data ? <AvailabilityPanel listing={data.listing} /> : null,
    payments: savedId && data ? <PaymentsPanel listing={data.listing} onChange={() => refetch()} /> : null,
  };

  const editSections: { id: StepId; label: string }[] = [...STEPS.filter((s) => s.id !== "publish"), { id: "availability", label: "Availability" }, { id: "payments", label: "On-chain payments" }];
  const titles: Record<StepId, string> = {
    type: "Tell us about your place",
    location: "Where's your place located?",
    basics: "Share some basics about your place",
    amenities: "Tell guests what your place has to offer",
    photos: "Add some photos of your place",
    description: "Now, let's give your place a title and description",
    pricing: "Set your price and policies",
    publish: "Review your listing",
    availability: "Availability",
    payments: "Get paid on-chain",
  };
  const editing = !isNew || step === "payments";

  return (
    <div className="pb-32">
      <Container className="pt-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link to="/hosting/listings" className="flex items-center gap-1 text-sm font-semibold hover:underline">
            <ChevronLeft className="h-4 w-4" /> Listings
          </Link>
          {savedId && (
            <div className="flex items-center gap-3">
              <Link to={`/rooms/${savedId}`} target="_blank" className="flex items-center gap-1 text-sm font-semibold underline">
                Preview <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              {!isNew && d.status === "published" && (
                <Button variant="outline" size="sm" onClick={() => save("unlisted").then((l) => l && toast.success("Listing unlisted"))}>
                  Unlist
                </Button>
              )}
              {!isNew && d.status !== "published" && (
                <Button size="sm" onClick={publish} loading={saving}>
                  Publish
                </Button>
              )}
            </div>
          )}
        </div>

        <div className={clsx(editing && "grid gap-10 lg:grid-cols-[260px_1fr]")}>
          {editing && (
            <nav className="scrollbar-hide flex gap-2 overflow-x-auto lg:sticky lg:top-28 lg:block lg:space-y-1 lg:self-start">
              {editSections.map((s) => (
                <button key={s.id} type="button" onClick={() => (setStep(s.id), setError(null))} className={clsx("shrink-0 rounded-xl px-4 py-3 text-left text-sm font-medium transition lg:w-full", step === s.id ? "bg-ink text-white" : "hover:bg-ink-bg")}>
                  {s.label}
                </button>
              ))}
            </nav>
          )}
          <div className="mx-auto w-full max-w-3xl">
            {!editing && <div className="mb-2 text-sm font-semibold text-ink-muted">Step {idx + 1} of {STEPS.length}</div>}
            <h1 className="mb-8 text-[28px] font-semibold leading-tight sm:text-[32px]">{titles[step]}</h1>
            {error && (
              <Alert tone="error" className="mb-6">
                {error}
              </Alert>
            )}
            {content[step]}
            {isNew && step === "payments" && (
              <Button variant="outline" className="mt-8" onClick={() => navigate("/hosting/listings")}>
                Done – go to my listings
              </Button>
            )}
            {editing && !["availability", "payments"].includes(step) && (
              <div className="mt-10">
                <Button variant="dark" loading={saving} onClick={() => save().then((l) => l && toast.success("Changes saved"))}>
                  Save changes
                </Button>
              </div>
            )}
          </div>
        </div>
      </Container>

      {!editing && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-faint bg-white">
          <div className="h-1.5 bg-ink-faint">
            <div className="h-full bg-ink transition-all duration-500" style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} />
          </div>
          <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-4 sm:px-10">
            <Button variant="link" disabled={idx === 0} onClick={() => (setStep(STEPS[Math.max(0, idx - 1)].id), setError(null))}>
              Back
            </Button>
            <div className="flex gap-3">
              {idx > 0 && (
                <Button variant="outline" loading={saving && d.status === "draft"} onClick={() => save("draft").then((l) => l && toast.success("Draft saved"))}>
                  Save & exit
                </Button>
              )}
              {step === "publish" ? (
                <Button onClick={publish} loading={saving}>
                  Publish listing
                </Button>
              ) : (
                <Button variant="dark" onClick={next}>
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
