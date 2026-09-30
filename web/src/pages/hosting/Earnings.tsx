import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useCurrency } from "../../lib/currency";
import { useMeta, useTitle } from "../../lib/hooks";
import { shortAddress, shortDate } from "../../lib/format";
import { connectEvm, evmBalances, evmEscrow } from "../../lib/chains/evm";
import { errorMessage } from "../../lib/payments";
import type { Network } from "../../lib/types";
import { ChainIcon } from "../../components/icons";
import { Button, Container, EmptyState, PageLoader, StatusBadge } from "../../components/ui";
import type { HostStats } from "./Dashboard";

function OnChainBalances({ net }: { net: Network }) {
  const { user } = useAuth();
  const [address, setAddress] = useState<string | null>(user?.wallets.find((w) => w.chain === "evm")?.address || null);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, refetch, isLoading, error } = useQuery({
    queryKey: ["escrow-balances", net.id, address],
    queryFn: () => evmBalances(net, address!),
    enabled: !!address,
  });
  const withdraw = async (token: string) => {
    setBusy(token);
    try {
      await evmEscrow.withdraw(net, token);
      toast.success("Withdrawn to your wallet");
      refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="rounded-2xl border border-ink-faint p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <ChainIcon chain="evm" className="h-5 w-5" /> {net.name}
        </div>
        {address ? (
          <span className="font-mono text-sm text-ink-muted">{shortAddress(address)}</span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => connectEvm().then(setAddress).catch((e) => toast.error(errorMessage(e)))}>
            Connect wallet
          </Button>
        )}
      </div>
      {isLoading && address ? (
        <p className="text-sm text-ink-muted">Reading escrow balances…</p>
      ) : error ? (
        <p className="text-sm text-ink-muted">Couldn't reach {net.name}.</p>
      ) : (
        <div className="space-y-3">
          {data?.map((b) => (
            <div key={b.symbol} className="flex items-center justify-between rounded-xl bg-ink-bg px-4 py-3">
              <div>
                <div className="text-lg font-semibold">
                  {Number(b.formatted).toLocaleString("en-US", { maximumFractionDigits: b.symbol === "USDC" ? 2 : 5 })} {b.symbol}
                </div>
                <div className="text-xs text-ink-muted">Available to withdraw</div>
              </div>
              <Button size="sm" variant="dark" disabled={b.amount === 0n} loading={busy === b.address} onClick={() => withdraw(b.address)}>
                Withdraw
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Earnings() {
  useTitle("Earnings");
  const { fmt } = useCurrency();
  const { data: meta } = useMeta();
  const { data: stats, isLoading } = useQuery({ queryKey: ["host-stats"], queryFn: () => api.get<HostStats>("/hosting/stats") });
  if (isLoading || !stats) return <PageLoader />;
  const max = Math.max(1, ...stats.monthly.map((m) => m.earnings));
  const evmNets = meta?.networks.filter((n) => n.chain === "evm") || [];

  return (
    <Container className="pb-24 pt-10">
      <h1 className="text-[32px] font-semibold">Earnings</h1>
      <p className="text-ink-muted">Payouts are released by the escrow contract 24 hours after each check-in and can be withdrawn to your wallet anytime.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-2xl border border-ink-faint p-6">
          <div className="flex flex-wrap items-end gap-10">
            <div>
              <div className="text-sm text-ink-muted">Paid out</div>
              <div className="text-3xl font-semibold">{fmt(stats.earnedUsd)}</div>
            </div>
            <div>
              <div className="text-sm text-ink-muted">Upcoming (in escrow)</div>
              <div className="text-3xl font-semibold text-ink-muted">{fmt(stats.pendingUsd)}</div>
            </div>
          </div>
          <div className="mt-8 flex h-48 items-end gap-2">
            {stats.monthly.length === 0 ? (
              <p className="m-auto text-sm text-ink-muted">Your monthly earnings chart will appear after your first booking.</p>
            ) : (
              stats.monthly.map((m) => (
                <div key={m.month} className="group flex flex-1 flex-col items-center gap-2">
                  <div className="relative flex w-full flex-1 items-end">
                    <div className="w-full rounded-t-md bg-brand/80 transition group-hover:bg-brand" style={{ height: `${Math.max(4, (m.earnings / max) * 100)}%` }} />
                    <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100">{fmt(m.earnings, false)}</span>
                  </div>
                  <span className="text-xs text-ink-muted">{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="space-y-4">
          {evmNets.map((n) => (
            <OnChainBalances key={n.id} net={n} />
          ))}
          {evmNets.length === 0 && <EmptyState icon={<Wallet className="h-8 w-8" />} title="No networks configured" />}
        </div>
      </div>

      <h2 className="mb-4 mt-12 text-[22px] font-semibold">Payout history</h2>
      {stats.payouts.length === 0 ? (
        <EmptyState title="No payouts yet" body="Completed stays and their escrow releases will be listed here." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink-faint">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-ink-bg text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Reservation</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Network</th>
                <th className="px-5 py-3 text-right">Payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-faint">
              {stats.payouts.map((b) => (
                <tr key={b.id}>
                  <td className="px-5 py-4">{shortDate(b.checkIn, true)}</td>
                  <td className="px-5 py-4">
                    <Link to={`/hosting/reservations/${b.id}`} className="font-semibold hover:underline">
                      {b.code}
                    </Link>
                    <div className="max-w-[260px] truncate text-xs text-ink-muted">{b.listing.title}</div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-5 py-4">
                    <span className="flex items-center gap-1.5">
                      <ChainIcon chain={b.chain} /> {b.networkName}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right font-semibold">{fmt(b.hostPayoutUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
