import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Bell, Camera, Globe, Lock, Medal, ShieldCheck, Star, Trash2, User as UserIcon, Wallet } from "lucide-react";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCurrency } from "../lib/currency";
import { useTitle } from "../lib/hooks";
import { monthYear, shortAddress, yearsSince } from "../lib/format";
import { errorMessage } from "../lib/payments";
import type { Listing, Review, User } from "../lib/types";
import ListingCard from "../components/ListingCard";
import { ChainIcon } from "../components/icons";
import { Alert, Avatar, Button, Container, Divider, Input, PageLoader, Select, Textarea, Toggle } from "../components/ui";
import { RequireAuth } from "./Trips";

function Section({ icon, title, children, sub }: { icon: React.ReactNode; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-faint p-6 sm:p-8">
      <div className="mb-6 flex items-start gap-3">
        <span className="mt-0.5">{icon}</span>
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {sub && <p className="text-sm text-ink-muted">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function AccountInner() {
  const { user, setUser, linkWallet, refresh } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const u = user!;
  const [form, setForm] = useState({
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email || "",
    phone: u.phone || "",
    bio: u.bio,
    location: u.location,
    work: u.work,
    languages: u.languages.join(", "),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [eos, setEos] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const r = await api.patch<{ user: User }>("/users/me", {
        ...form,
        email: form.email || undefined,
        phone: form.phone || null,
        languages: form.languages.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setUser(r.user);
      toast.success(r.user.email !== u.email ? "Saved – check your inbox to confirm your new email" : "Profile saved");
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields || {});
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    const fd = new FormData();
    fd.append("photos", file);
    try {
      const { urls } = await api.post<{ urls: string[] }>("/uploads", fd);
      const r = await api.patch<{ user: User }>("/users/me", { avatarUrl: urls[0] });
      setUser(r.user);
      toast.success("Photo updated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const changePassword = async () => {
    try {
      await api.post("/users/me/password", pw);
      setPw({ currentPassword: "", newPassword: "" });
      toast.success("Password updated");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const link = async (chain: "evm" | "solana") => {
    try {
      await linkWallet(chain);
      toast.success("Wallet linked to your account");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : errorMessage(e));
    }
  };

  const linkEos = async () => {
    try {
      const r = await api.post<{ user: User }>("/users/me/wallets", { chain: "eos", address: eos.trim() });
      setUser(r.user);
      setEos("");
      toast.success("EOS account linked");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const unlink = async (chain: string, address: string) => {
    try {
      const r = await api.del<{ user: User }>(`/users/me/wallets/${chain}/${address}`);
      setUser(r.user);
      toast.success("Wallet removed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const updatePref = async (patch: Record<string, unknown>) => {
    const r = await api.patch<{ user: User }>("/users/me", patch);
    setUser(r.user);
    toast.success("Preferences saved");
  };

  return (
    <Container className="pb-24 pt-10">
      <div className="mb-10 flex items-center gap-5">
        <button type="button" onClick={() => fileRef.current?.click()} className="group relative" aria-label="Change photo">
          <Avatar src={u.avatarUrl} name={u.firstName || u.name} size={84} />
          <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border border-ink-line bg-white shadow group-hover:bg-ink-bg">
            <Camera className="h-4 w-4" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
        <div>
          <h1 className="text-[32px] font-semibold leading-tight">Account</h1>
          <p className="text-ink-muted">
            {u.name}
            {u.email ? `, ${u.email}` : ""} ·{" "}
            <Link to={`/users/${u.id}`} className="font-semibold text-ink underline">
              Go to profile
            </Link>
          </p>
        </div>
      </div>

      {u.email && !u.emailVerified && (
        <Alert tone="warn" className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <span>Please confirm your email address to receive booking confirmations.</span>
          <Button size="sm" variant="outline" onClick={() => api.post("/auth/resend-verification").then(() => toast.success("Verification email sent"))}>
            Resend email
          </Button>
        </Alert>
      )}
      {!u.email && (
        <Alert tone="info" className="mb-6">
          Add an email address so we can send you booking confirmations, messages from hosts and payout notifications.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={<UserIcon className="h-6 w-6" />} title="Personal info" sub="Shown on your public profile (except email and phone).">
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First name" value={form.firstName} onChange={set("firstName")} error={errors.firstName} />
              <Input label="Last name" value={form.lastName} onChange={set("lastName")} error={errors.lastName} />
            </div>
            <Input label={`Email ${u.emailVerified ? "· verified" : ""}`} type="email" value={form.email} onChange={set("email")} error={errors.email} />
            <Input label="Phone number" type="tel" value={form.phone} onChange={set("phone")} error={errors.phone} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Where you live" value={form.location} onChange={set("location")} />
              <Input label="My work" value={form.work} onChange={set("work")} />
            </div>
            <Input label="Languages (comma separated)" value={form.languages} onChange={set("languages")} />
            <Textarea label="About you" rows={4} value={form.bio} onChange={set("bio")} placeholder="Tell hosts and guests a little about yourself" />
            <Button type="submit" variant="dark" loading={saving}>
              Save
            </Button>
          </form>
        </Section>

        <div className="space-y-6">
          <Section icon={<Wallet className="h-6 w-6" />} title="Wallets" sub="Verified wallets can sign in and pay into escrow. Verification is a free signature.">
            <div className="space-y-3">
              {u.wallets.length === 0 && <p className="text-sm text-ink-muted">No wallets linked yet.</p>}
              {u.wallets.map((w) => (
                <div key={`${w.chain}:${w.address}`} className="flex items-center gap-3 rounded-xl bg-ink-bg px-4 py-3">
                  <ChainIcon chain={w.chain} className="h-5 w-5" />
                  <span className="flex-1 font-mono text-sm">{shortAddress(w.address)}</span>
                  <span className="text-xs uppercase text-ink-muted">{w.chain}</span>
                  <button type="button" onClick={() => unlink(w.chain, w.address)} aria-label="Remove wallet" className="rounded-full p-1.5 hover:bg-white">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => link("evm")}>
                <ChainIcon chain="evm" /> Link Ethereum wallet
              </Button>
              <Button variant="outline" size="sm" onClick={() => link("solana")}>
                <ChainIcon chain="solana" /> Link Solana wallet
              </Button>
            </div>
            <div className="mt-4 flex gap-2">
              <Input className="flex-1" placeholder="EOS account name" value={eos} onChange={(e) => setEos(e.target.value.toLowerCase())} />
              <Button variant="outline" onClick={linkEos} disabled={!eos.trim()}>
                Link EOS
              </Button>
            </div>
          </Section>

          <Section icon={<Lock className="h-6 w-6" />} title="Login & security">
            <div className="space-y-3">
              {u.hasPassword && <Input label="Current password" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}
              <Input label={u.hasPassword ? "New password" : "Set a password"} type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} hint="At least 8 characters" />
              <Button variant="dark" onClick={changePassword} disabled={pw.newPassword.length < 8}>
                {u.hasPassword ? "Update password" : "Set password"}
              </Button>
            </div>
          </Section>

          <Section icon={<Bell className="h-6 w-6" />} title="Notifications & preferences">
            <div className="flex items-center justify-between gap-6 py-2">
              <div>
                <div className="font-medium">Email notifications</div>
                <div className="text-sm text-ink-muted">Messages, review reminders and tips. Booking and payment emails are always sent.</div>
              </div>
              <Toggle checked={!!u.emailNotifications} onChange={(v) => updatePref({ emailNotifications: v })} />
            </div>
            <Divider className="my-4" />
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2 font-medium">
                <Globe className="h-4 w-4" /> Display currency
              </div>
              <Select
                value={currency}
                onChange={(v) => (setCurrency(v), updatePref({ preferredCurrency: v }))}
                className="w-40"
                options={["USD", "EUR", "MAD", "GBP"].map((c) => ({ value: c, label: c }))}
              />
            </div>
          </Section>
        </div>
      </div>
    </Container>
  );
}

export default function Account() {
  useTitle("Account");
  return (
    <RequireAuth>
      <AccountInner />
    </RequireAuth>
  );
}

export function Profile() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({ queryKey: ["user", id], queryFn: () => api.get<{ user: User; listings: Listing[]; reviews: Review[] }>(`/users/${id}`) });
  useTitle(data?.user.firstName);
  if (isLoading) return <PageLoader />;
  if (!data) return <Container className="py-24 text-center">Profile not found.</Container>;
  const { user: u, listings, reviews } = data;
  const years = yearsSince(u.joinedAt);
  return (
    <Container className="pb-24 pt-10">
      <div className="grid gap-12 lg:grid-cols-[340px_1fr] lg:gap-20">
        <aside className="space-y-6">
          <div className="grid grid-cols-[1fr_110px] items-center rounded-3xl p-8 shadow-card">
            <div className="flex flex-col items-center text-center">
              <span className="relative">
                <Avatar src={u.avatarUrl} name={u.firstName} size={104} />
                {u.isSuperhost && <Medal className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-brand p-1.5 text-white" />}
              </span>
              <div className="mt-3 text-[28px] font-bold leading-tight">{u.firstName || "Traveler"}</div>
              <div className="text-sm font-semibold">{u.isSuperhost ? "Superhost" : u.listingCount ? "Host" : "Guest"}</div>
            </div>
            <div className="divide-y divide-ink-line">
              <div className="pb-3">
                <div className="text-[22px] font-bold">{u.hostReviewCount + u.guestReviewCount}</div>
                <div className="text-xs font-semibold">Reviews</div>
              </div>
              {u.hostRating && (
                <div className="py-3">
                  <div className="flex items-center gap-1 text-[22px] font-bold">
                    {u.hostRating.toFixed(2)} <Star className="h-3.5 w-3.5 fill-current" />
                  </div>
                  <div className="text-xs font-semibold">Rating</div>
                </div>
              )}
              <div className="pt-3">
                <div className="text-[22px] font-bold">{years || "<1"}</div>
                <div className="text-xs font-semibold">Years on Tourisme</div>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-ink-line p-8">
            <h3 className="mb-4 text-xl font-semibold">{u.firstName}'s confirmed information</h3>
            <ul className="space-y-3">
              {u.emailVerified && (
                <li className="flex items-center gap-3">
                  <BadgeCheck className="h-5 w-5" /> Email address
                </li>
              )}
              {u.wallets.map((w) => (
                <li key={w.address} className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5" /> {w.chain.toUpperCase()} wallet <span className="font-mono text-sm text-ink-muted">{shortAddress(w.address)}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
        <div>
          <h1 className="text-[32px] font-bold">About {u.firstName}</h1>
          <div className="mt-6 space-y-2">
            {u.work && <p>💼 My work: {u.work}</p>}
            {u.location && <p>📍 Lives in {u.location}</p>}
            {u.languages.length > 0 && <p>🗣 Speaks {u.languages.join(", ")}</p>}
            <p>🗓 Joined in {monthYear(u.joinedAt)}</p>
          </div>
          {u.bio && <p className="mt-6 max-w-2xl leading-relaxed text-ink-soft">{u.bio}</p>}
          {reviews.length > 0 && (
            <>
              <Divider className="my-10" />
              <h2 className="mb-6 text-[22px] font-semibold">What people are saying about {u.firstName}</h2>
              <div className="scrollbar-hide -mx-2 flex gap-4 overflow-x-auto px-2 pb-2">
                {reviews.map((r) => (
                  <div key={r.id} className="w-[320px] shrink-0 rounded-2xl border border-ink-line p-6">
                    <p className="line-clamp-5 leading-relaxed">“{r.comment}”</p>
                    <div className="mt-5 flex items-center gap-3">
                      <Avatar src={r.author.avatarUrl} name={r.author.name} size={40} />
                      <div>
                        <div className="font-semibold">{r.author.name}</div>
                        <div className="text-sm text-ink-muted">{monthYear(r.createdAt)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {listings.length > 0 && (
            <>
              <Divider className="my-10" />
              <h2 className="mb-6 text-[22px] font-semibold">{u.firstName}'s listings</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {listings.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
