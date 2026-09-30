import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Luggage } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTitle } from "../lib/hooks";
import { dateRange } from "../lib/format";
import type { Booking, Listing } from "../lib/types";
import BookingDetail from "../components/BookingDetail";
import ListingCard from "../components/ListingCard";
import { Avatar, Button, Container, EmptyState, Img, PageLoader, StatusBadge } from "../components/ui";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, openAuth } = useAuth();
  if (loading) return <PageLoader />;
  if (!user)
    return (
      <Container className="py-24">
        <h1 className="text-3xl font-semibold">Log in to continue</h1>
        <p className="mt-2 text-ink-muted">You need an account to see this page.</p>
        <Button className="mt-6" onClick={() => openAuth("login")}>
          Log in
        </Button>
      </Container>
    );
  return <>{children}</>;
}

function TripCard({ b }: { b: Booking }) {
  return (
    <Link to={`/trips/${b.id}`} className="group flex gap-4 rounded-2xl border border-ink-faint p-3 transition hover:shadow-card">
      <Img src={b.listing.photo} alt={b.listing.title} seed={b.listing.id} className="h-24 w-24 shrink-0 rounded-xl sm:h-28 sm:w-28" />
      <div className="min-w-0 flex-1 py-1">
        <div className="flex items-start justify-between gap-2">
          <div className="truncate font-semibold">{b.listing.city}</div>
          <StatusBadge status={b.status} />
        </div>
        <div className="truncate text-sm text-ink-muted">Hosted by {b.host.firstName}</div>
        <div className="mt-1 text-sm">{dateRange(b.checkIn, b.checkOut)}</div>
        <div className="mt-1 truncate text-sm text-ink-muted">{b.listing.title}</div>
      </div>
    </Link>
  );
}

export default function Trips() {
  const { id } = useParams();
  useTitle("Trips");
  if (id)
    return (
      <RequireAuth>
        <BookingDetail id={id} role="guest" />
      </RequireAuth>
    );
  return (
    <RequireAuth>
      <TripsList />
    </RequireAuth>
  );
}

function TripsList() {
  const [tab, setTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const { data, isLoading } = useQuery({ queryKey: ["trips"], queryFn: () => api.get<{ bookings: Booking[] }>("/bookings/trips") });
  const { data: ideas } = useQuery({ queryKey: ["ideas"], queryFn: () => api.get<{ results: Listing[] }>("/listings?limit=4&sort=rating") });
  if (isLoading) return <PageLoader />;
  const bookings = data?.bookings || [];
  const groups = {
    upcoming: bookings.filter((b) => b.bucket === "upcoming" || b.bucket === "current").sort((a, b) => a.checkInDay - b.checkInDay),
    past: bookings.filter((b) => b.bucket === "past"),
    cancelled: bookings.filter((b) => b.bucket === "cancelled"),
  };
  const current = bookings.find((b) => b.bucket === "current" && b.status === "confirmed");

  return (
    <Container className="pb-24 pt-10">
      <h1 className="mb-8 text-[32px] font-semibold">Trips</h1>
      {current && (
        <Link to={`/trips/${current.id}`} className="mb-10 flex flex-col overflow-hidden rounded-3xl shadow-card sm:flex-row">
          <Img src={current.listing.photo} alt="" seed={current.listing.id} className="h-56 w-full sm:h-auto sm:w-2/5" />
          <div className="flex-1 p-8">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Happening now</span>
            <h2 className="mt-3 text-2xl font-semibold">{current.listing.city}</h2>
            <p className="text-ink-muted">{current.listing.title}</p>
            <p className="mt-4">
              {dateRange(current.checkIn, current.checkOut)} · Checkout before {current.listing.checkOutTime}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Avatar src={current.host.avatarUrl} name={current.host.firstName} size={32} />
              <span className="text-sm">Your host {current.host.firstName}</span>
            </div>
          </div>
        </Link>
      )}
      <div className="mb-8 flex gap-6 border-b border-ink-faint">
        {(["upcoming", "past", "cancelled"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={clsx("-mb-px border-b-2 pb-3 text-sm font-semibold capitalize", tab === t ? "border-ink" : "border-transparent text-ink-muted hover:text-ink")}>
            {t} {groups[t].length > 0 && <span className="ml-1 text-ink-muted">({groups[t].length})</span>}
          </button>
        ))}
      </div>
      {groups[tab].length === 0 ? (
        <>
          <EmptyState
            icon={<Luggage className="h-10 w-10" strokeWidth={1.4} />}
            title={tab === "upcoming" ? "No trips booked… yet!" : tab === "past" ? "No past trips" : "No cancelled trips"}
            body={tab === "upcoming" ? "Time to dust off your bags and start planning your next adventure." : undefined}
            action={
              tab === "upcoming" && (
                <Link to="/">
                  <Button variant="outline">Start searching</Button>
                </Link>
              )
            }
          />
          {tab === "upcoming" && ideas && (
            <>
              <h2 className="mb-6 mt-14 text-[22px] font-semibold">Inspiration for your next trip</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {ideas.results.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups[tab].map((b) => (
            <TripCard key={b.id} b={b} />
          ))}
        </div>
      )}
      <p className="mt-12 text-sm text-ink-muted">
        Can't find your reservation here? <Link to="/help" className="font-semibold text-ink underline">Visit the Help Center</Link>
      </p>
    </Container>
  );
}
