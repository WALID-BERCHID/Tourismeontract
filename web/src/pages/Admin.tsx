import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gavel } from "lucide-react";
import { api } from "../lib/api";
import { useCurrency } from "../lib/currency";
import { useMeta, useTitle } from "../lib/hooks";
import { dateRange } from "../lib/format";
import { evmEscrow } from "../lib/chains/evm";
import { solanaEscrow } from "../lib/chains/solana";
import { errorMessage } from "../lib/payments";
import type { Booking } from "../lib/types";
import { Button, Container, EmptyState, PageLoader, StatusBadge } from "../components/ui";

export default function Admin() {
  useTitle("Admin");
  const { fmt } = useCurrency();
  const { data: meta } = useMeta();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin"],
    queryFn: () => api.get<{ users: number; listings: number; bookings: number; gmvUsd: number; disputes: Booking[]; recent: Booking[] }>("/admin/overview"),
  });
  const [split, setSplit] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<number | null>(null);

  if (isLoading) return <PageLoader />;
  if (!data) return <Container className="py-24 text-center">Admins only.</Container>;

  const resolve = async (b: Booking) => {
    const net = meta?.networks.find((n) => n.id === b.network);
    if (!net || !b.chainBookingId) return;
    const pct = split[b.id] ?? 50;
    setBusy(b.id);
    try {
      let txHash: string;
      if (net.chain === "evm") txHash = await evmEscrow.resolveDispute(net, b.chainBookingId, pct * 100);
      else if (net.chain === "solana") {
        const l = await api.get<{ listing: { chains: { network: string; chainListingId: string }[] } }>(`/listings/${b.listing.id}`);
        const chainListingId = l.listing.chains.find((c) => c.network === b.network)!.chainListingId;
        txHash = await solanaEscrow.resolveDispute(net, chainListingId, b.chainBookingId, b.payerAddress!, pct * 100);
      } else throw new Error("Resolve EOS disputes with cleos: push action <contract> resolve");
      await api.post(`/bookings/${b.id}/sync`, { txHash, refundPercent: pct });
      toast.success("Dispute resolved on-chain");
      refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Container className="pb-24 pt-10">
      <h1 className="text-[32px] font-semibold">Admin</h1>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Users", data.users],
          ["Live listings", data.listings],
          ["Bookings", data.bookings],
          ["GMV", fmt(data.gmvUsd, false)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-ink-faint p-5">
            <div className="text-2xl font-semibold">{v}</div>
            <div className="text-sm text-ink-muted">{k}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-4 mt-12 flex items-center gap-2 text-[22px] font-semibold">
        <Gavel className="h-5 w-5" /> Open disputes
      </h2>
      <p className="mb-6 text-sm text-ink-muted">Connect the arbiter wallet configured in the escrow contract to settle cases. The refund percentage goes to the guest; the rest is paid to the host minus fees.</p>
      {data.disputes.length === 0 ? (
        <EmptyState title="No open disputes" body="Nice – every stay is going smoothly." />
      ) : (
        <div className="space-y-4">
          {data.disputes.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-6 rounded-2xl border border-ink-line p-5">
              <div className="min-w-[240px] flex-1">
                <div className="flex items-center gap-2">
                  <StatusBadge status={b.status} /> <b>{b.code}</b>
                </div>
                <Link to={`/trips/${b.id}`} className="mt-1 block font-semibold hover:underline">
                  {b.listing.title}
                </Link>
                <div className="text-sm text-ink-muted">
                  {b.guest.name} → {b.host.name} · {dateRange(b.checkIn, b.checkOut)} · {b.amountNative} on {b.networkName}
                </div>
              </div>
              <label className="flex items-center gap-3 text-sm">
                Refund guest
                <input type="range" min={0} max={100} step={5} value={split[b.id] ?? 50} onChange={(e) => setSplit({ ...split, [b.id]: Number(e.target.value) })} className="accent-ink" />
                <b className="w-10">{split[b.id] ?? 50}%</b>
              </label>
              <Button variant="dark" loading={busy === b.id} onClick={() => resolve(b)}>
                Resolve on-chain
              </Button>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-4 mt-12 text-[22px] font-semibold">Recent bookings</h2>
      <div className="overflow-x-auto rounded-2xl border border-ink-faint">
        <table className="w-full min-w-[720px] text-left text-sm">
          <tbody className="divide-y divide-ink-faint">
            {data.recent.map((b) => (
              <tr key={b.id}>
                <td className="px-5 py-3 font-mono">{b.code}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={b.status} />
                </td>
                <td className="max-w-[240px] truncate px-5 py-3">{b.listing.title}</td>
                <td className="px-5 py-3">{b.guest.name}</td>
                <td className="px-5 py-3">{b.amountNative}</td>
                <td className="px-5 py-3">{b.networkName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
