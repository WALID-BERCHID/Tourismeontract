import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { api } from "../lib/api";
import { useTitle } from "../lib/hooks";
import type { Listing } from "../lib/types";
import ListingCard from "../components/ListingCard";
import { Button, Container, EmptyState, PageLoader } from "../components/ui";
import { RequireAuth } from "./Trips";

function List() {
  const { data, isLoading } = useQuery({ queryKey: ["wishlists"], queryFn: () => api.get<{ listings: Listing[] }>("/wishlists") });
  if (isLoading) return <PageLoader />;
  const listings = data?.listings || [];
  return (
    <Container wide className="pb-24 pt-10">
      <h1 className="mb-8 text-[32px] font-semibold">Wishlists</h1>
      {listings.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-10 w-10" strokeWidth={1.4} />}
          title="Create your first wishlist"
          body="As you search, tap the heart icon to save your favorite places and experiences to a wishlist."
          action={
            <Link to="/">
              <Button variant="outline">Start exploring</Button>
            </Link>
          }
        />
      ) : (
        <>
          <p className="mb-6 text-ink-muted">
            {listings.length} saved place{listings.length > 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={{ ...l, wishlisted: true }} />
            ))}
          </div>
        </>
      )}
    </Container>
  );
}

export default function Wishlists() {
  useTitle("Wishlists");
  return (
    <RequireAuth>
      <List />
    </RequireAuth>
  );
}
