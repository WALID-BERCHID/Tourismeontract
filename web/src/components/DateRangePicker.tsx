import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fromDay, todayDay, toDay } from "../lib/format";
import { useMediaQuery } from "../lib/hooks";

interface Props {
  checkIn: string | null;
  checkOut: string | null;
  onChange: (checkIn: string | null, checkOut: string | null) => void;
  occupied?: Set<number>;
  minNights?: number;
  maxNights?: number;
  months?: 1 | 2;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function monthDays(year: number, month: number) {
  const first = Date.UTC(year, month, 1) / 86_400_000;
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const pad = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return { first, count, pad };
}

/**
 * Airbnb-style two-month range picker. Booked nights are struck through; a checkout can land on
 * the first booked night (it's a departure day), but a stay can't span booked nights.
 */
export default function DateRangePicker({ checkIn, checkOut, onChange, occupied, minNights = 1, maxNights = 365, months }: Props) {
  const wide = useMediaQuery("(min-width: 768px)");
  const count = months ?? (wide ? 2 : 1);
  const today = todayDay();
  const start = checkIn ? new Date(`${checkIn}T00:00:00Z`) : new Date();
  const [cursor, setCursor] = useState({ y: start.getUTCFullYear(), m: start.getUTCMonth() });
  const [hover, setHover] = useState<number | null>(null);

  const inDay = checkIn ? toDay(checkIn) : null;
  const outDay = checkOut ? toDay(checkOut) : null;

  // When only check-in is chosen, the latest possible checkout is the first occupied night after it.
  const maxOut = useMemo(() => {
    if (inDay == null || outDay != null) return null;
    let d = inDay;
    while (d < inDay + maxNights && !occupied?.has(d)) d++;
    return d;
  }, [inDay, outDay, occupied, maxNights]);

  const now = new Date();
  const canPrev = cursor.y > now.getUTCFullYear() || (cursor.y === now.getUTCFullYear() && cursor.m > now.getUTCMonth());

  const shift = (delta: number) =>
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  function click(day: number) {
    if (inDay == null || outDay != null || day <= inDay) {
      if (occupied?.has(day)) return;
      onChange(fromDay(day), null);
      return;
    }
    if (maxOut != null && day > maxOut) {
      onChange(fromDay(day), null);
      return;
    }
    if (day - inDay < minNights) return;
    onChange(checkIn, fromDay(day));
  }

  return (
    <div className="select-none">
      <div className="relative flex gap-10">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shift(-1)}
          disabled={!canPrev}
          className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full hover:bg-ink-bg disabled:opacity-20"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Next month" onClick={() => shift(1)} className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full hover:bg-ink-bg">
          <ChevronRight className="h-4 w-4" />
        </button>
        {Array.from({ length: count }).map((_, i) => {
          const d = new Date(Date.UTC(cursor.y, cursor.m + i, 1));
          const y = d.getUTCFullYear();
          const m = d.getUTCMonth();
          const { first, count: n, pad } = monthDays(y, m);
          return (
            <div key={`${y}-${m}`} className="flex-1">
              <div className="mb-4 text-center text-[15px] font-semibold leading-8">
                {d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
              </div>
              <div className="grid grid-cols-7 text-center text-xs font-semibold text-ink-muted">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="pb-2">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: pad }).map((_, k) => (
                  <div key={`p${k}`} />
                ))}
                {Array.from({ length: n }).map((_, k) => {
                  const day = first + k;
                  const past = day < today;
                  const booked = occupied?.has(day);
                  const isIn = day === inDay;
                  const isOut = day === outDay;
                  const rangeEnd = outDay ?? (hover != null && inDay != null && hover > inDay && (maxOut == null || hover <= maxOut) ? hover : null);
                  const inRange = inDay != null && rangeEnd != null && day > inDay && day < rangeEnd;
                  const tooShort = inDay != null && outDay == null && day > inDay && day - inDay < minNights;
                  const beyond = inDay != null && outDay == null && maxOut != null && day > maxOut;
                  // A booked night can still be picked as checkout when it's the first one after check-in.
                  const checkoutOnly = booked && inDay != null && outDay == null && day === maxOut;
                  const disabled = past || (booked && !checkoutOnly) || tooShort;
                  return (
                    <div
                      key={day}
                      className={clsx(
                        "relative aspect-square",
                        inRange && "bg-ink-bg",
                        isIn && rangeEnd != null && "rounded-l-full bg-ink-bg",
                        (isOut || (outDay == null && day === rangeEnd)) && "rounded-r-full bg-ink-bg"
                      )}
                      onMouseEnter={() => setHover(day)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => click(day)}
                        aria-label={fromDay(day)}
                        className={clsx(
                          "absolute inset-0 m-auto flex h-full w-full items-center justify-center rounded-full text-sm font-medium transition",
                          (isIn || isOut) && "bg-ink text-white",
                          !isIn && !isOut && !disabled && "hover:ring-1 hover:ring-ink",
                          disabled && "cursor-not-allowed text-ink-line",
                          booked && !checkoutOnly && "line-through",
                          beyond && !disabled && "text-ink-muted"
                        )}
                      >
                        {k + 1}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
