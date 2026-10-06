import {
  Accessibility,
  AirVent,
  Bath,
  Bike,
  Building2,
  CableCar,
  Car,
  Castle,
  Coffee,
  Dumbbell,
  Flame,
  Home,
  Landmark,
  Laptop,
  Mountain,
  MountainSnow,
  Palmtree,
  Plane,
  Sailboat,
  ShowerHead,
  Snowflake,
  Soup,
  Sparkles,
  Sprout,
  Sun,
  Tent,
  Thermometer,
  TreePine,
  Tv,
  Utensils,
  Warehouse,
  Waves,
  WashingMachine,
  Wifi,
  Wind,
  Baby,
  ArrowUpDown,
  Camera,
  Flower2,
  Hammer,
  Music,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: Utensils,
  wellness: Flower2,
  camera: Camera,
  craft: Hammer,
  music: Music,
  riad: Castle,
  beach: Palmtree,
  landmark: Landmark,
  desert: Sun,
  mountain: MountainSnow,
  pool: Waves,
  surf: Sailboat,
  palm: TreePine,
  barn: Warehouse,
  city: Building2,
  cabin: Home,
  tent: Tent,
};

export const AMENITY_ICONS: Record<string, LucideIcon> = {
  wifi: Wifi,
  kitchen: Utensils,
  washer: WashingMachine,
  ac: AirVent,
  heating: Thermometer,
  workspace: Laptop,
  tv: Tv,
  essentials: ShowerHead,
  pool: Waves,
  hot_tub: Bath,
  sauna: Flame,
  hammam: Wind,
  free_parking: Car,
  gym: Dumbbell,
  bbq: Flame,
  fireplace: Flame,
  rooftop: Sun,
  garden: Sprout,
  elevator: ArrowUpDown,
  crib: Baby,
  sea_view: Sailboat,
  mountain_view: Mountain,
  city_view: Building2,
  beach_access: Palmtree,
  ski_in: Snowflake,
  breakfast: Coffee,
  dinner: Soup,
  airport_shuttle: Plane,
  camel_trek: Sun,
  surfboards: Waves,
  bikes: Bike,
  accessible: Accessibility,
  lift: CableCar,
};

export const amenityIcon = (id: string) => AMENITY_ICONS[id] || Sparkles;

/** Brand mark: a hexagonal "portal" with a gradient core – reads as a key/token at any size. */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="tourisme-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F23B9E" />
          <stop offset=".6" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#3DF5A8" />
        </linearGradient>
      </defs>
      <path d="M16 2.5 28 9.25v13.5L16 29.5 4 22.75V9.25z" fill="none" stroke="url(#tourisme-logo)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M16 8.5 22.5 12.2v7.6L16 23.5l-6.5-3.7v-7.6z" fill="url(#tourisme-logo)" />
      <circle cx="16" cy="16" r="2.4" fill="#0A0920" />
    </svg>
  );
}

/** Wordmark with the gradient accent used across the brand. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-[22px] font-extrabold tracking-tight text-ink ${className}`}>
      touris<span className="text-gradient-brand">me</span>
    </span>
  );
}

/** Small chain badges used in listing cards and checkout. */
export function ChainIcon({ chain, className = "h-4 w-4" }: { chain: "evm" | "solana" | "eos"; className?: string }) {
  if (chain === "solana")
    return (
      <svg viewBox="0 0 24 24" className={className} aria-label="Solana">
        <defs>
          <linearGradient id="sol" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0" stopColor="#9945FF" />
            <stop offset="1" stopColor="#14F195" />
          </linearGradient>
        </defs>
        <path fill="url(#sol)" d="M5 16.5h14l-2.5 3H2.5zM5 4.5h14l-2.5 3H2.5zM19 10.5H5l-2.5 3h14z" />
      </svg>
    );
  if (chain === "eos")
    return (
      <svg viewBox="0 0 24 24" className={className} aria-label="EOS">
        <path fill="currentColor" d="M12 1 5 10.5 3 18l9 5 9-5-2-7.5zm0 3.2 4.6 6.3L12 19.8 7.4 10.5zm-5.4 8.2L10.3 20l-5.1-2.8zm10.8 0 1.2 4.8-5.1 2.8z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Ethereum">
      <path fill="#627EEA" d="M12 1.5 5 12.2l7 4.1 7-4.1z" opacity=".9" />
      <path fill="#627EEA" d="M12 17.7 5 13.5l7 9 7-9z" opacity=".6" />
    </svg>
  );
}
