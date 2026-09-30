import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import clsx from "clsx";
import { useTitle } from "../../lib/hooks";
import { useCurrency } from "../../lib/currency";
import { shortDate } from "../../lib/format";
import BookingDetail from "../../components/BookingDetail";
import { Avatar, Container, EmptyState, PageLoader, StatusBadge } from "../../components/ui";
import { useHostingBookings } from "./Dashboard";

export default function Reservations() {
  const { id } = useParams();
  useTitle("Reservations");
  if (id) return <BookingDetail id={id} role="host" />;
  return <ReservationList />;
}

function ReservationList() {
  const { data, isLoading } = useHostingBookings();
  const { fmt } = useCurrency();
  const [tab, setTab] = useState<"upcoming" | "completed" | "cancelled" | "all">("upcoming");
  if (isLoading) return <PageLoader />;
  const all = data?.bookings || [];
  const filtered = all.filter((b) =>
    tab === "all"
      ? true
      : tab === "upcoming"
        ? b.bucket === "upcoming" || b.bucket === "current"
        : tab === "completed"
          ? b.bucket === "past"
          : b.bucket === "cancelled"
  );
  return (
    <Container wide className="pb-24 pt-10">
      <h1 className="mb-6 text-[32px] font-semibold">Reservations</h1>
      <div className="mb-6 flex gap-6 border-b border-ink-faint">
        {(["upcoming", "completed", "cancelled", "all"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={clsx("-mb-px border-b-2 pb-3 text-sm font-semibold capitalize", tab === t ? "border-ink" : "border-transparent text-ink-muted hover:text-ink")}>
            {t}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState title={`You have no ${tab === "all" ? "" : tab + " "}reservations`} body="Reservations made by guests on your listings will show up here." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink-faint">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-ink-bg text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Guest</th>
                <th className="px-5 py-3 font-semibold">Check-in</th>
                <th className="px-5 py-3 font-semibold">Checkout</th>
                <th className="px-5 py-3 font-semibold">Listing</th>
                <th className="px-5 py-3 font-semibold">Paid</th>
                <th className="px-5 py-3 font-semibold">Payout</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-faint">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-ink-bg/50">
                  <td className="px-5 py-4">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar src={b.guest.avatarUrl} name={b.guest.firstName} size={32} />
                      <div>
                        <div className="font-semibold">{b.guest.name}</div>
                        <div className="text-xs text-ink-muted">{b.guests} guests</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">{shortDate(b.checkIn, true)}</td>
                  <td className="px-5 py-4">{shortDate(b.checkOut, true)}</td>
                  <td className="max-w-[220px] truncate px-5 py-4">{b.listing.title}</td>
                  <td className="px-5 py-4 font-medium">{b.amountNative}</td>
                  <td className="px-5 py-4">{fmt(b.hostPayoutUsd)}</td>
                  <td className="px-5 py-4 text-right">
                    <Link to={`/hosting/reservations/${b.id}`} className="rounded-lg border border-ink-line px-3 py-1.5 font-semibold hover:border-ink">
                      Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
