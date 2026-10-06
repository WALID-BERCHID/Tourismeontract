import { useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fromDay, toDay, todayDay } from "../lib/format";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** One-month calendar for experiences: pick a single day. Occupied days are struck through. */
export default function SingleDatePicker({ value, onChange, occupied, className }: { value: string | null; onChange: (date: string | null) => void; occupied?: Set<number>; className?: string }) {
  const today = todayDay();
  const start = value ? new Date(`${value}T00:00:00Z`) : new Date();
  const [cursor, setCursor] = useState({ y: start.getUTCFullYear(), m: start.getUTCMonth() });
  const now = new Date();
  const canPrev = cursor.y > now.getUTCFullYear() || (cursor.y === now.getUTCFullYear() && cursor.m > now.getUTCMonth());
  const shift = (delta: number) =>
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  const first = Date.UTC(cursor.y, cursor.m, 1) / 86_400_000;
  const count = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const pad = new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay();
  const selected = value ? toDay(value) : null;

  return (
    <div className={clsx("select-none", className)}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} disabled={!canPrev} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-20">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="font-display text-[15px] font-semibold">{new Date(Date.UTC(cursor.y, cursor.m, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</div>
        <button type="button" aria-label="Next month" onClick={() => shift(1)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-ink-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: pad }).map((_, k) => (
          <div key={`p${k}`} />
        ))}
        {Array.from({ length: count }).map((_, k) => {
          const day = first + k;
          const booked = occupied?.has(day);
          const disabled = day < today || booked;
          const on = day === selected;
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => onChange(on ? null : fromDay(day))}
              aria-label={fromDay(day)}
              aria-pressed={on}
              className={clsx(
                "mx-auto flex aspect-square w-full max-w-[42px] items-center justify-center rounded-full text-sm font-medium transition",
                on && "bg-brand-gradient text-white shadow-glow",
                !on && !disabled && "hover:ring-1 hover:ring-brand",
                disabled && "cursor-not-allowed text-ink-line",
                booked && "line-through"
              )}
            >
              {k + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
