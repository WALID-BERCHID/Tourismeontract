import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { ChevronLeft, Loader2, Minus, Plus, Star, X } from "lucide-react";
import { useLockBody } from "../lib/hooks";
import { STATUS_LABEL } from "../lib/format";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "dark" | "outline" | "ghost" | "link" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  full?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, full, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "relative inline-flex select-none items-center justify-center gap-2 rounded-lg font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-3.5 py-2 text-sm",
        size === "md" && "px-5 py-3 text-[15px]",
        size === "lg" && "px-6 py-3.5 text-base",
        variant === "primary" && "bg-gradient-to-r from-[#E61E4D] via-[#E31C5F] to-[#D70466] text-white hover:brightness-110",
        variant === "dark" && "bg-ink text-white hover:bg-black",
        variant === "outline" && "border border-ink bg-white text-ink hover:bg-ink-bg",
        variant === "ghost" && "text-ink hover:bg-ink-bg",
        variant === "link" && "px-0 py-0 text-ink underline underline-offset-2 hover:text-black",
        variant === "danger" && "border border-red-600 bg-white text-red-600 hover:bg-red-50",
        full && "w-full",
        className
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

export function IconButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={clsx("inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-ink-bg", className)} {...rest}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

type FieldProps = { label?: string; error?: string; hint?: string };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input({ label, error, hint, className, id, ...rest }, ref) {
  const inputId = id || rest.name;
  return (
    <div className={className}>
      <label htmlFor={inputId} className={clsx("relative block rounded-lg border bg-white transition focus-within:border-ink focus-within:ring-1 focus-within:ring-ink", error ? "border-red-600" : "border-ink-line")}>
        {label && <span className="block px-3 pt-2 text-xs text-ink-muted">{label}</span>}
        <input ref={ref} id={inputId} className={clsx("w-full rounded-lg bg-transparent px-3 text-[15px] text-ink placeholder:text-ink-muted focus:outline-none", label ? "pb-2 pt-0.5" : "py-3")} {...rest} />
      </label>
      {error ? <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function Textarea({ label, error, hint, className, ...rest }, ref) {
  return (
    <div className={className}>
      {label && <label className="mb-2 block text-sm font-semibold">{label}</label>}
      <textarea
        ref={ref}
        className={clsx("w-full rounded-lg border bg-white px-3 py-3 text-[15px] focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink", error ? "border-red-600" : "border-ink-line")}
        {...rest}
      />
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
});

export function Select({ label, value, onChange, options, className }: { label?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <label className={clsx("relative block rounded-lg border border-ink-line bg-white focus-within:border-ink focus-within:ring-1 focus-within:ring-ink", className)}>
      {label && <span className="block px-3 pt-2 text-xs text-ink-muted">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={clsx("w-full appearance-none rounded-lg bg-transparent px-3 text-[15px] focus:outline-none", label ? "pb-2" : "py-3")}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute bottom-3 right-3 text-ink-muted">▾</span>
    </label>
  );
}

export function Counter({ value, onChange, min = 0, max = 99, label, sub }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-4">
      <div>
        <div className="font-medium">{label}</div>
        {sub && <div className="text-sm text-ink-muted">{sub}</div>}
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-line text-ink-muted transition hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-ink-line"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-6 text-center tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-line text-ink-muted transition hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-ink-line"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx("relative h-8 w-12 shrink-0 rounded-full transition", checked ? "bg-ink" : "bg-ink-line")}
    >
      <span className={clsx("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all", checked ? "left-5" : "left-1")} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Modal / sheet
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  onBack,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  onBack?: () => void;
}) {
  useLockBody(open);
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} />
      <div
        className={clsx(
          "relative flex max-h-[94vh] w-full animate-slide-up flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop sm:rounded-2xl",
          size === "sm" && "sm:max-w-md",
          size === "md" && "sm:max-w-xl",
          size === "lg" && "sm:max-w-3xl",
          size === "xl" && "sm:max-w-5xl",
          size === "full" && "h-[94vh] sm:max-w-6xl"
        )}
      >
        <div className="relative flex min-h-[64px] shrink-0 items-center justify-center border-b border-ink-faint px-14">
          <IconButton onClick={onBack || onClose} className="absolute left-4" aria-label={onBack ? "Back" : "Close"}>
            {onBack ? <ChevronLeft className="h-5 w-5" /> : <X className="h-4 w-4" />}
          </IconButton>
          {title && <h2 className="text-base font-bold">{title}</h2>}
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 border-t border-ink-faint px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

const FALLBACK_GRADIENTS = ["from-rose-200 to-amber-100", "from-sky-200 to-emerald-100", "from-violet-200 to-pink-100", "from-amber-200 to-orange-100", "from-teal-200 to-cyan-100"];

/** Image with a graceful gradient placeholder when the source fails (offline, blocked CDN...). */
export function Img({ src, alt, className, seed = 0 }: { src?: string | null; alt: string; className?: string; seed?: number }) {
  const [failed, setFailed] = useState(!src);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(!src);
    setLoaded(false);
  }, [src]);
  if (failed) {
    return (
      <div className={clsx("flex items-center justify-center bg-gradient-to-br", FALLBACK_GRADIENTS[Math.abs(seed) % FALLBACK_GRADIENTS.length], className)} role="img" aria-label={alt}>
        <svg viewBox="0 0 64 64" className="h-1/4 max-h-16 w-1/4 max-w-16 text-white/80" fill="currentColor">
          <path d="M32 8 6 30h7v24h15V40h8v14h15V30h7z" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={src!}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={clsx("bg-ink-faint object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0", className)}
    />
  );
}

export function Avatar({ src, name, size = 40, className }: { src?: string | null; name?: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={clsx("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-white", className)} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src && !failed ? <img src={src} alt={name || ""} className="h-full w-full object-cover" onError={() => setFailed(true)} /> : <span className="font-semibold">{initial}</span>}
    </span>
  );
}

export function Stars({ rating, count, size = "sm", className }: { rating: number | null; count?: number; size?: "sm" | "md"; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1", size === "md" ? "text-base" : "text-sm", className)}>
      <Star className={clsx("fill-current", size === "md" ? "h-4 w-4" : "h-3.5 w-3.5")} />
      {rating ? <span className="font-medium">{rating.toFixed(2).replace(/0$/, "")}</span> : <span className="font-medium">New</span>}
      {count ? <span className="text-ink-muted">({count})</span> : null}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] || { label: status, tone: "gray" };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        s.tone === "green" && "bg-emerald-50 text-emerald-700",
        s.tone === "amber" && "bg-amber-50 text-amber-700",
        s.tone === "gray" && "bg-ink-bg text-ink-muted",
        s.tone === "red" && "bg-red-50 text-red-700",
        s.tone === "blue" && "bg-sky-50 text-sky-700"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin text-ink-muted", className || "h-6 w-6")} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("relative overflow-hidden rounded-lg bg-ink-faint before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent", className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-ink-faint p-8 sm:p-10">
      {icon && <div className="text-ink">{icon}</div>}
      <h3 className="text-xl font-semibold">{title}</h3>
      {body && <p className="max-w-md text-ink-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Container({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={clsx("mx-auto w-full px-5 sm:px-10", wide ? "max-w-[2520px] xl:px-20" : "max-w-[1280px]", className)}>{children}</div>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={clsx("border-ink-faint", className)} />;
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3 text-sm",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-900",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "error" && "border-red-200 bg-red-50 text-red-800",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        className
      )}
    >
      {children}
    </div>
  );
}
