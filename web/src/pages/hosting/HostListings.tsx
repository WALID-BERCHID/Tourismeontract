import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "../../lib/api";
import { useCurrency } from "../../lib/currency";
import { useTitle } from "../../lib/hooks";
import type { Listing } from "../../lib/types";
import { ChainIcon } from "../../components/icons";
import { Button, Container, EmptyState, Img, PageLoader, Stars } from "../../components/ui";

export default function HostListings() {
  useTitle("Your listings");
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const { data, isLoading } = useQuery({ queryKey: ["my-listings"], queryFn: () => api.get<{ listings: Listing[] }>("/hosting/listings") });
  if (isLoading) return <PageLoader />;
  const listings = data?.listings || [];
  return (
    <Container wide className="pb-24 pt-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-[32px] font-semibold">Your listings</h1>
        <Button variant="outline" onClick={() => navigate("/hosting/listings/new")}>
          <Plus className="h-4 w-4" /> Create listing
        </Button>
      </div>
      {listings.length === 0 ? (
        <EmptyState title="No listings yet" body="Create your first listing – it takes about 10 minutes." action={<Button onClick={() => navigate("/hosting/listings/new")}>Get started</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listings.map((l) => (
            <Link key={l.id} to={`/hosting/listings/${l.id}/edit`} className="group">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                <Img src={l.photos[0]} alt={l.title} seed={l.id} className="h-full w-full transition group-hover:scale-[1.02]" />
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold shadow">
                  <span className={`h-2 w-2 rounded-full ${l.status === "published" ? "bg-emerald-500" : l.status === "draft" ? "bg-amber-500" : "bg-ink-muted"}`} />
                  {l.status === "published" ? "Listed" : l.status === "draft" ? "In progress" : "Unlisted"}
                </span>
                {l.status === "published" && l.chains.length === 0 && <span className="absolute bottom-3 left-3 right-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Enable on-chain payments to accept bookings</span>}
              </div>
              <div className="mt-3 flex justify-between gap-2">
                <span className="truncate font-semibold">{l.title}</span>
                <Stars rating={l.rating} />
              </div>
              <div className="flex items-center justify-between text-sm text-ink-muted">
                <span>
                  {l.city}, {l.country} · {fmt(l.priceUsd, false)}/night
                </span>
                <span className="flex gap-1">
                  {[...new Set(l.chains.map((c) => c.chain))].map((c) => (
                    <ChainIcon key={c} chain={c} />
                  ))}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
