import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { useCurrency } from "../lib/currency";
import type { Listing } from "../lib/types";
import { Img, Stars } from "./ui";

function priceIcon(label: string, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="price-pin${active ? " active" : ""}">${label}</div>`,
    iconSize: [0, 0],
  });
}

function FitBounds({ listings, disabled }: { listings: Listing[]; disabled: boolean }) {
  const map = useMap();
  const key = listings.map((l) => l.id).join(",");
  useEffect(() => {
    if (disabled || !listings.length) return;
    const b = L.latLngBounds(listings.map((l) => [l.lat, l.lng] as [number, number]));
    map.fitBounds(b, { padding: [60, 60], maxZoom: 13 });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function BoundsWatcher({ onMove }: { onMove?: (bounds: string) => void }) {
  const moved = useRef(false);
  useMapEvents({
    dragend: (e) => {
      moved.current = true;
      const b = e.target.getBounds();
      onMove?.([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n: number) => n.toFixed(4)).join(","));
    },
    zoomend: (e) => {
      if (!moved.current) return;
      const b = e.target.getBounds();
      onMove?.([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n: number) => n.toFixed(4)).join(","));
    },
  });
  return null;
}

export default function MapView({
  listings,
  activeId,
  onMove,
  fixedBounds = false,
  query = "",
}: {
  listings: Listing[];
  activeId?: number | null;
  onMove?: (bounds: string) => void;
  fixedBounds?: boolean;
  query?: string;
}) {
  const { fmt } = useCurrency();
  const center = useMemo<[number, number]>(() => (listings[0] ? [listings[0].lat, listings[0].lng] : [31.63, -7.99]), [listings]);
  return (
    <MapContainer center={center} zoom={5} scrollWheelZoom className="h-full w-full" zoomControl>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      <FitBounds listings={listings} disabled={fixedBounds} />
      <BoundsWatcher onMove={onMove} />
      {listings.map((l) => (
        <Marker key={l.id} position={[l.lat, l.lng]} icon={priceIcon(fmt(l.priceUsd, false), activeId === l.id)} zIndexOffset={activeId === l.id ? 1000 : 0}>
          <Popup closeButton={false} className="listing-popup" minWidth={280} maxWidth={280}>
            <Link to={`/rooms/${l.id}${query}`} className="block overflow-hidden rounded-xl text-ink no-underline">
              <Img src={l.photos[0]} alt={l.title} seed={l.id} className="aspect-[3/2] w-full" />
              <div className="p-3">
                <div className="flex justify-between gap-2 text-[15px]">
                  <span className="truncate font-semibold">{l.city}</span>
                  <Stars rating={l.rating} />
                </div>
                <p className="truncate text-sm text-ink-muted">{l.title}</p>
                <p className="mt-1 text-sm">
                  <b>{fmt(l.priceUsd, false)}</b> night
                </p>
              </div>
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

/** Single-location map for the listing page (approximate area circle, like Airbnb). */
export function LocationMap({ lat, lng, exact = false }: { lat: number; lng: number; exact?: boolean }) {
  return (
    <MapContainer center={[lat, lng]} zoom={13} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer attribution='&copy; OpenStreetMap &copy; CARTO' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      {exact ? (
        <Marker position={[lat, lng]} icon={L.divIcon({ className: "", html: '<div class="home-pin"></div>', iconSize: [0, 0] })} />
      ) : (
        <Marker position={[lat, lng]} icon={L.divIcon({ className: "", html: '<div class="area-circle"><div class="home-pin"></div></div>', iconSize: [0, 0] })} />
      )}
    </MapContainer>
  );
}
