export const DAY_MS = 86_400_000;

export const toDay = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
export const fromDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
export const todayDay = () => Math.floor(Date.now() / DAY_MS);

export function nightsBetween(checkIn?: string | null, checkOut?: string | null) {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, toDay(checkOut) - toDay(checkIn));
}

const CURRENCY_RATES: Record<string, number> = { USD: 1, EUR: 0.92, MAD: 9.9, GBP: 0.79 };

export function money(usd: number, currency = "USD", opts: { cents?: boolean } = {}) {
  const v = usd * (CURRENCY_RATES[currency] ?? 1);
  const cents = opts.cents ?? !Number.isInteger(Math.round(v * 100) / 100);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(v);
}

export function shortDate(iso: string, withYear = false) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: withYear ? "numeric" : undefined, timeZone: "UTC" });
}

export function longDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function dateRange(checkIn: string, checkOut: string) {
  const a = new Date(`${checkIn}T00:00:00Z`);
  const b = new Date(`${checkOut}T00:00:00Z`);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return sameMonth ? `${m(a)} ${a.getUTCDate()} – ${b.getUTCDate()}` : `${m(a)} ${a.getUTCDate()} – ${m(b)} ${b.getUTCDate()}`;
}

export function timeAgo(sqlDate: string) {
  const t = Date.parse(sqlDate.includes("T") ? sqlDate : `${sqlDate.replace(" ", "T")}Z`);
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function monthYear(sqlDate: string) {
  const t = Date.parse(sqlDate.includes("T") ? sqlDate : `${sqlDate.replace(" ", "T")}Z`);
  return new Date(t).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function yearsSince(sqlDate: string) {
  const t = Date.parse(sqlDate.includes("T") ? sqlDate : `${sqlDate.replace(" ", "T")}Z`);
  return Math.max(0, Math.floor((Date.now() - t) / (365.25 * DAY_MS)));
}

export const shortAddress = (a?: string | null) => (!a ? "" : a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;

export const POLICY_TEXT = {
  flexible: {
    label: "Flexible",
    short: "Free cancellation until 24 hours before check-in.",
    long: "Cancel up to 24 hours before check-in for a full refund. After that, the stay is non-refundable.",
  },
  moderate: {
    label: "Moderate",
    short: "Free cancellation until 5 days before check-in.",
    long: "Cancel up to 5 days before check-in for a full refund. After that, you get a 50% refund if you cancel before check-in.",
  },
  strict: {
    label: "Strict",
    short: "Full refund within 48 hours of booking (if check-in is 14+ days away).",
    long: "Full refund if you cancel within 48 hours of booking and at least 14 days before check-in. 50% refund up to 7 days before check-in. No refund after that.",
  },
} as const;

export const STATUS_LABEL: Record<string, { label: string; tone: "green" | "amber" | "gray" | "red" | "blue" }> = {
  pending_host: { label: "Awaiting host", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "green" },
  declined: { label: "Declined · refunded", tone: "gray" },
  cancelled_by_guest: { label: "Cancelled by guest", tone: "gray" },
  cancelled_by_host: { label: "Cancelled by host", tone: "gray" },
  completed: { label: "Completed", tone: "blue" },
  disputed: { label: "Issue reported", tone: "red" },
  resolved: { label: "Resolved", tone: "blue" },
};
