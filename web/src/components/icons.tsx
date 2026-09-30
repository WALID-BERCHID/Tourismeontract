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
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
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

/** Brand mark: a stylised pin/arch that reads well at small sizes. */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 2c-1.9 0-3.3 1.2-4.3 3.4L4.8 20.5c-2.2 4.7.4 9.5 5 9.5 2.6 0 4.6-1.5 6.2-3.6 1.6 2.1 3.6 3.6 6.2 3.6 4.6 0 7.2-4.8 5-9.5L20.3 5.4C19.3 3.2 17.9 2 16 2zm0 22.7c-1.7-2.1-2.8-4.2-2.8-6 0-1.7 1.2-2.8 2.8-2.8s2.8 1.1 2.8 2.8c0 1.8-1.1 3.9-2.8 6z"
      />
    </svg>
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
