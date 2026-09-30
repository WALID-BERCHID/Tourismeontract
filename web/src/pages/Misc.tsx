import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import { ApiError, api, setToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useMeta, useTitle } from "../lib/hooks";
import { Button, Container, Input, PageLoader } from "../components/ui";
import { ChainIcon } from "../components/icons";

export function VerifyEmail() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");
  useTitle("Confirm email");
  useEffect(() => {
    api
      .post("/auth/verify-email", { token: params.get("token") })
      .then(() => (setState("ok"), refresh()))
      .catch((e) => (setState("error"), setMsg(e.message)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (state === "loading") return <PageLoader />;
  return (
    <Container className="flex flex-col items-center py-24 text-center">
      {state === "ok" ? <CheckCircle2 className="h-14 w-14 text-emerald-600" /> : <XCircle className="h-14 w-14 text-red-600" />}
      <h1 className="mt-4 text-3xl font-semibold">{state === "ok" ? "Email confirmed" : "Link expired"}</h1>
      <p className="mt-2 text-ink-muted">{state === "ok" ? "You'll now receive booking confirmations and messages by email." : msg}</p>
      <Link to="/" className="mt-8">
        <Button>Start exploring</Button>
      </Link>
    </Container>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useTitle("Reset password");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api.post<{ token: string }>("/auth/reset-password", { token: params.get("token"), password });
      setToken(s.token);
      await refresh();
      toast.success("Password updated – you're logged in");
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.fields?.password || err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Container className="max-w-md py-24">
      <h1 className="mb-6 text-3xl font-semibold">Choose a new password</h1>
      <form onSubmit={submit} className="space-y-4">
        <Input label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={error || undefined} hint="At least 8 characters" autoFocus />
        <Button type="submit" full loading={busy} disabled={password.length < 8}>
          Update password
        </Button>
      </form>
    </Container>
  );
}

export function LoginPage() {
  const { user, openAuth } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user) navigate("/account", { replace: true });
    else openAuth("login");
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Container className="py-24 text-center">
      <h1 className="text-3xl font-semibold">Log in or sign up</h1>
      <Button className="mt-6" onClick={() => openAuth("login")}>
        Continue
      </Button>
    </Container>
  );
}

export function NotFound() {
  useTitle("Page not found");
  return (
    <Container className="py-24">
      <h1 className="text-[64px] font-bold leading-none">Oops!</h1>
      <p className="mt-4 text-2xl">We can't seem to find the page you're looking for.</p>
      <p className="mt-2 text-ink-muted">Error code: 404</p>
      <div className="mt-8 flex gap-6 font-semibold underline">
        <Link to="/">Home</Link>
        <Link to="/trips">Trips</Link>
        <Link to="/help">Help Center</Link>
      </div>
    </Container>
  );
}

const FAQ: { id: string; q: string; a: React.ReactNode }[] = [
  {
    id: "escrow",
    q: "How does the escrow protect my payment?",
    a: "When you book, your payment goes into an audited smart contract – not to the host and not to Tourisme. The contract releases the money to the host 24 hours after check-in. If something is wrong, report a problem before then and the payout is frozen until an independent arbiter settles the case on-chain.",
  },
  {
    id: "cancellation",
    q: "What are the cancellation options?",
    a: (
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Flexible:</b> full refund until 24 hours before check-in.</li>
        <li><b>Moderate:</b> full refund until 5 days before check-in, 50% after that.</li>
        <li><b>Strict:</b> full refund within 48 hours of booking if check-in is at least 14 days away; 50% until 7 days before; no refund after.</li>
        <li>If the host cancels, you always get 100% back automatically.</li>
      </ul>
    ),
  },
  {
    id: "disputes",
    q: "How do I report a problem with my stay?",
    a: "Open your trip and select “Report a problem” within 24 hours of check-in. Describe the issue and add photos in the conversation with your host. The arbiter can refund you partially or fully from the escrow.",
  },
  {
    id: "fees",
    q: "What fees does Tourisme charge?",
    a: "Guests pay an 8% service fee on top of the stay. Hosts pay a 3% fee deducted from their payout. Network gas fees are paid to the blockchain, not to us – they're typically cents on Polygon, Base and Solana.",
  },
  {
    id: "chains",
    q: "Which blockchains and currencies can I pay with?",
    a: "Ethereum, Polygon and Base (ETH, POL or USDC), Solana (SOL) and EOS. Hosts choose which networks they accept. Stablecoins like USDC keep the price exactly equal to the dollar amount you see.",
  },
  {
    id: "hosting",
    q: "How do I get paid as a host?",
    a: "Publish your listing, then enable payments on one or more networks from the listing editor (one wallet transaction per network). After each stay, your payout becomes withdrawable from the Earnings page – straight to your own wallet, no bank delays.",
  },
  {
    id: "about",
    q: "Is Tourisme custodial?",
    a: "No. We never hold your funds or keys. Listings, availability and reviews are mirrored off-chain for fast search, but payments, refunds and payouts are executed exclusively by the smart contracts.",
  },
  { id: "privacy", q: "What data do you keep?", a: "Your profile, listings, messages and booking records. Exact addresses are only shared with confirmed guests. You can delete your account at any time by contacting support." },
  { id: "terms", q: "Terms of service", a: "By using Tourisme you agree to follow local laws and regulations for short-term rentals, to respect the house rules of each listing, and to settle payments only through the escrow contract." },
];

export function Help() {
  const [open, setOpen] = useState<string | null>(() => window.location.hash.slice(1) || "escrow");
  const { data: meta } = useMeta();
  useTitle("Help Center");
  return (
    <Container className="max-w-3xl pb-24 pt-12">
      <h1 className="text-4xl font-bold">Hi, how can we help?</h1>
      <p className="mt-3 text-lg text-ink-muted">Everything about booking, paying with crypto escrow, cancellations and hosting.</p>
      <div className="mt-10 divide-y divide-ink-faint rounded-2xl border border-ink-faint">
        {FAQ.map((f) => (
          <div key={f.id} id={f.id}>
            <button type="button" onClick={() => setOpen(open === f.id ? null : f.id)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-semibold">
              {f.q}
              <ChevronDown className={`h-5 w-5 shrink-0 transition ${open === f.id ? "rotate-180" : ""}`} />
            </button>
            {open === f.id && <div className="px-6 pb-6 leading-relaxed text-ink-soft">{f.a}</div>}
          </div>
        ))}
      </div>
      {meta && meta.networks.length > 0 && (
        <div className="mt-10 rounded-2xl bg-ink-bg p-6">
          <h2 className="mb-4 font-semibold">Live escrow contracts</h2>
          <div className="space-y-2 text-sm">
            {meta.networks.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center gap-2">
                <ChainIcon chain={n.chain} /> <b>{n.name}</b>
                <span className="break-all font-mono text-ink-muted">{n.escrow || n.programId || n.contract}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Container>
  );
}
