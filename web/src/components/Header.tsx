import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, Compass, Globe, Menu, MessageSquare, Search, Luggage, UserCircle2, Wallet } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { useClickOutside } from "../lib/hooks";
import { timeAgo } from "../lib/format";
import type { Notification } from "../lib/types";
import { Logo, Wordmark } from "./icons";
import { Avatar } from "./ui";
import { MobileSearch, SearchBar, SearchPill } from "./SearchBar";
import { useCurrency } from "../lib/currency";

function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const { unreadNotifications, refresh } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(close, open);
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<{ notifications: Notification[] }>("/notifications"), enabled: open });

  const toggle = async () => {
    setOpen((o) => !o);
    if (!open && unreadNotifications) {
      await api.post("/notifications/read-all");
      refresh();
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} aria-label="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
        <Bell className="h-[18px] w-[18px]" />
        {unreadNotifications > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unreadNotifications}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[380px] glass-strong animate-fade-in overflow-hidden rounded-2xl shadow-pop">
          <div className="border-b border-ink-faint px-5 py-4 font-semibold">Notifications</div>
          <div className="max-h-[420px] overflow-y-auto">
            {!data?.notifications.length && <p className="px-5 py-10 text-center text-sm text-ink-muted">You're all caught up ✨</p>}
            {data?.notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (n.link) navigate(n.link);
                }}
                className="flex w-full gap-3 border-b border-ink-faint px-5 py-3.5 text-left last:border-0 hover:bg-white/10"
              >
                <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{n.title}</span>
                  {n.body && <span className="block truncate text-sm text-ink-muted">{n.body}</span>}
                  <span className="mt-0.5 block text-xs text-ink-muted">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CurrencyMenu() {
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(close, open);
  return (
    <div ref={ref} className="relative hidden lg:block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Currency" className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium hover:bg-white/10">
        <Globe className="h-4 w-4" /> {currency}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-56 glass-strong animate-fade-in rounded-2xl py-2 shadow-pop">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Display currency</div>
          {[
            ["USD", "US dollar"],
            ["EUR", "Euro"],
            ["MAD", "Moroccan dirham"],
            ["GBP", "British pound"],
          ].map(([code, label]) => (
            <button key={code} type="button" onClick={() => (setCurrency(code), setOpen(false))} className={clsx("flex w-full justify-between px-4 py-2.5 text-sm hover:bg-white/10", currency === code && "font-semibold")}>
              {label} <span className="text-ink-muted">{code}</span>
            </button>
          ))}
          <p className="px-4 pb-2 pt-1 text-xs text-ink-muted">Payments settle in crypto on-chain; prices are shown in your currency for convenience.</p>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, openAuth, logout, unreadMessages, unreadNotifications } = useAuth();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(close, open);
  const navigate = useNavigate();
  const item = "block w-full px-4 py-3 text-left text-sm hover:bg-white/10";
  const go = (to: string) => (setOpen(false), navigate(to));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Main menu"
        className="relative flex items-center gap-3 rounded-full border border-white/15 bg-white/5 py-1.5 pl-3.5 pr-1.5 transition hover:border-brand/60 hover:shadow-glow"
      >
        <Menu className="h-4 w-4" />
        {user ? <Avatar src={user.avatarUrl} name={user.firstName || user.name} size={30} /> : <UserCircle2 className="h-[30px] w-[30px] text-ink-muted" strokeWidth={1.2} />}
        {user && unreadMessages + unreadNotifications > 0 && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-brand" />}
      </button>
      {open && (
        <div className="absolute right-0 top-14 z-50 w-64 glass-strong animate-fade-in overflow-hidden rounded-2xl py-2 shadow-pop">
          {user ? (
            <>
              <button type="button" className={clsx(item, "flex justify-between font-semibold")} onClick={() => go("/messages")}>
                Messages {unreadMessages > 0 && <span className="rounded-full bg-brand px-2 text-xs text-white">{unreadMessages}</span>}
              </button>
              <button type="button" className={clsx(item, "font-semibold")} onClick={() => go("/trips")}>
                Trips
              </button>
              <button type="button" className={clsx(item, "font-semibold")} onClick={() => go("/wishlists")}>
                Wishlists
              </button>
              <hr className="my-2 border-ink-faint" />
              <button type="button" className={item} onClick={() => go("/hosting")}>
                {user.listingCount ? "Manage listings" : "List your home"}
              </button>
              <button type="button" className={item} onClick={() => go("/hosting/earnings")}>
                Earnings & payouts
              </button>
              <button type="button" className={item} onClick={() => go("/account")}>
                Account
              </button>
              {user.isAdmin && (
                <button type="button" className={item} onClick={() => go("/admin")}>
                  Admin & disputes
                </button>
              )}
              <hr className="my-2 border-ink-faint" />
              <button type="button" className={item} onClick={() => go("/help")}>
                Help Center
              </button>
              <button type="button" className={item} onClick={() => (setOpen(false), logout(), navigate("/"))}>
                Log out
              </button>
            </>
          ) : (
            <>
              <button type="button" className={clsx(item, "font-semibold")} onClick={() => (setOpen(false), openAuth("signup"))}>
                Sign up
              </button>
              <button type="button" className={item} onClick={() => (setOpen(false), openAuth("login"))}>
                Log in
              </button>
              <hr className="my-2 border-ink-faint" />
              <button type="button" className={item} onClick={() => go("/hosting")}>
                List your home
              </button>
              <button type="button" className={item} onClick={() => go("/help")}>
                Help Center
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { pathname } = useLocation();
  const { user, openAuth } = useAuth();
  const isHome = pathname === "/";
  const isExperiences = pathname.startsWith("/experiences");
  const [scrolled, setScrolled] = useState(false);
  const [expanded, setExpanded] = useState<null | "where" | "checkIn" | "checkOut" | "who">(null);
  const wideContent = isHome || pathname.startsWith("/rooms") === false;

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  useEffect(() => {
    setExpanded(null);
  }, [pathname]);

  const big = (isHome && !scrolled) || expanded !== null;
  const hosting = pathname.startsWith("/hosting");
  const navLink = ({ isActive }: { isActive: boolean }) =>
    clsx("rounded-full px-4 py-2 text-sm font-semibold transition", isActive ? "bg-white/10 text-ink" : "text-ink-soft hover:bg-white/5 hover:text-ink");

  return (
    <>
      {expanded && <div className="fixed inset-0 z-30 animate-fade-in bg-canvas/60 backdrop-blur-sm" onClick={() => setExpanded(null)} />}
      <header className={clsx("sticky top-0 z-40 border-b border-white/5 bg-canvas/80 backdrop-blur-xl", big ? "pb-5" : "")}>
        <div className={clsx("mx-auto hidden h-20 items-center justify-between gap-4 px-10 md:flex xl:px-20", wideContent ? "max-w-[2520px]" : "max-w-[1280px]")}>
          <Link to="/" className="flex items-center gap-2" aria-label="Tourisme home">
            <Logo className="h-9 w-9" />
            <Wordmark className="hidden lg:inline" />
          </Link>

          {hosting ? (
            <nav className="flex items-center gap-1 text-sm font-medium">
              {[
                ["/hosting", "Today"],
                ["/hosting/listings", "Listings"],
                ["/hosting/reservations", "Reservations"],
                ["/hosting/earnings", "Earnings"],
                ["/messages", "Inbox"],
              ].map(([to, label]) => (
                <NavLink key={to} to={to} end className={navLink}>
                  {label}
                </NavLink>
              ))}
            </nav>
          ) : big || isExperiences ? (
            <nav className="flex items-center gap-1">
              <NavLink to="/" end className={navLink}>
                Stays
              </NavLink>
              <NavLink to="/experiences" className={navLink}>
                Experiences
              </NavLink>
              <NavLink to="/help#escrow" className={navLink}>
                How escrow works
              </NavLink>
              <span className="ml-2 hidden items-center gap-1.5 rounded-full border border-brand-mint/30 bg-brand-mint/10 px-3 py-1 text-xs font-semibold text-brand-mint xl:flex">
                <span className="glow-dot h-1.5 w-1.5 rounded-full bg-brand-mint" /> Escrow live on 5 chains
              </span>
            </nav>
          ) : (
            <SearchPill onOpen={(p) => setExpanded(p)} />
          )}

          <div className="flex items-center gap-1">
            <Link to={hosting ? "/" : "/hosting"} className="hidden rounded-full px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-white/5 hover:text-ink lg:block">
              {hosting ? "Switch to traveling" : user?.listingCount ? "Switch to hosting" : "Become a host"}
            </Link>
            <CurrencyMenu />
            {user && <NotificationsMenu />}
            {!user && (
              <button type="button" onClick={() => openAuth("login")} className="mx-1 hidden items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 lg:flex">
                <Wallet className="h-4 w-4" /> Connect wallet
              </button>
            )}
            <UserMenu />
          </div>
        </div>
        {big && !hosting && !isExperiences && (
          <div className="hidden px-10 md:block">
            <SearchBar autoOpen={expanded} onDone={() => setExpanded(null)} />
          </div>
        )}
        {/* Mobile */}
        <div className="px-5 py-3 md:hidden">
          {hosting ? (
            <div className="flex items-center gap-2">
              <Logo className="h-7 w-7" />
              <span className="font-display font-bold">Hosting</span>
            </div>
          ) : isExperiences ? (
            <div className="flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2">
                <Logo className="h-7 w-7" />
                <Wordmark />
              </Link>
              <Link to="/" className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold">
                Stays
              </Link>
            </div>
          ) : (
            <MobileSearch />
          )}
        </div>
      </header>
    </>
  );
}

export function MobileTabBar() {
  const { user, unreadMessages } = useAuth();
  const { pathname } = useLocation();
  // Focused flows have their own bottom action bar.
  if (/^\/(rooms|experiences|book)\//.test(pathname) || /^\/messages\/\d/.test(pathname) || /^\/hosting\/listings\/(new|\d+)/.test(pathname)) return null;
  const tab = "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium";
  const cls = ({ isActive }: { isActive: boolean }) => clsx(tab, isActive ? "text-brand" : "text-ink-muted");
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <NavLink to="/" end className={cls}>
        <Search className="h-6 w-6" strokeWidth={1.6} /> Explore
      </NavLink>
      <NavLink to="/experiences" className={cls}>
        <Compass className="h-6 w-6" strokeWidth={1.6} /> Experiences
      </NavLink>
      <NavLink to="/trips" className={cls}>
        <Luggage className="h-6 w-6" strokeWidth={1.6} /> Trips
      </NavLink>
      <NavLink to="/messages" className={cls}>
        <span className="relative">
          <MessageSquare className="h-6 w-6" strokeWidth={1.6} />
          {unreadMessages > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-brand" />}
        </span>
        Inbox
      </NavLink>
      <NavLink to={user ? "/account" : "/login"} className={cls}>
        {user ? <Avatar src={user.avatarUrl} name={user.firstName} size={24} /> : <UserCircle2 className="h-6 w-6" strokeWidth={1.6} />}
        {user ? "Profile" : "Log in"}
      </NavLink>
    </nav>
  );
}
