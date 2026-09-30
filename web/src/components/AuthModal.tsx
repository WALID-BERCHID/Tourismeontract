import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiError, api } from "../lib/api";
import { hasInjectedWallet, evmErrorMessage } from "../lib/chains/evm";
import { hasSolanaWallet } from "../lib/chains/solana";
import { ChainIcon } from "./icons";
import { Alert, Button, Input, Modal } from "./ui";

export default function AuthModal() {
  const { authModal, closeAuth, openAuth, login, signup, walletLogin } = useAuth();
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!authModal) return null;
  const mode = authModal;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const reset = () => (setErrors({}), setError(null), setSent(false));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    setBusy("form");
    try {
      if (mode === "login") {
        const u = await login(form.email, form.password);
        toast.success(`Welcome back${u.firstName ? `, ${u.firstName}` : ""}!`);
      } else if (mode === "signup") {
        await signup(form);
        toast.success("Account created – check your inbox to confirm your email");
      } else {
        await api.post("/auth/forgot-password", { email: form.email });
        setSent(true);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors(err.fields || {});
      } else setError("Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const wallet = async (chain: "evm" | "solana") => {
    reset();
    setBusy(chain);
    try {
      const { user, isNew } = await walletLogin(chain);
      toast.success(isNew ? "Wallet connected – welcome to Tourisme!" : `Welcome back${user.firstName ? `, ${user.firstName}` : ""}!`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : evmErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const title = mode === "login" ? "Log in" : mode === "signup" ? "Finish signing up" : "Reset password";

  return (
    <Modal open onClose={closeAuth} title={title} size="sm" onBack={mode === "forgot" ? () => (reset(), openAuth("login")) : undefined}>
      <div className="p-6">
        {mode !== "forgot" && <h3 className="mb-5 text-[22px] font-semibold">Welcome to Tourisme</h3>}
        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}
        {mode === "forgot" && sent ? (
          <Alert tone="success">If an account exists for {form.email}, we've emailed a link to reset your password. It expires in 1 hour.</Alert>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {mode === "forgot" && <p className="text-sm text-ink-muted">Enter the email address associated with your account and we'll email you a link to reset your password.</p>}
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="First name" name="firstName" autoComplete="given-name" value={form.firstName} onChange={set("firstName")} error={errors.firstName} required />
                <Input label="Last name" name="lastName" autoComplete="family-name" value={form.lastName} onChange={set("lastName")} error={errors.lastName} />
              </div>
            )}
            <Input label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={errors.email} required />
            {mode !== "forgot" && (
              <Input
                label="Password"
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={form.password}
                onChange={set("password")}
                error={errors.password}
                hint={mode === "signup" ? "At least 8 characters" : undefined}
                required
              />
            )}
            {mode === "signup" && <p className="text-xs leading-relaxed text-ink-muted">By selecting Agree and continue, I agree to Tourisme's Terms of Service, Payments Terms of Service and Privacy Policy.</p>}
            <Button type="submit" full size="lg" loading={busy === "form"}>
              {mode === "login" ? "Continue" : mode === "signup" ? "Agree and continue" : "Send reset link"}
            </Button>
          </form>
        )}

        {mode !== "forgot" && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-ink-muted">
              <span className="h-px flex-1 bg-ink-faint" /> or <span className="h-px flex-1 bg-ink-faint" />
            </div>
            <div className="space-y-3">
              <Button variant="outline" full onClick={() => wallet("evm")} loading={busy === "evm"} className="justify-start">
                <ChainIcon chain="evm" className="h-5 w-5" />
                <span className="flex-1 text-center">{hasInjectedWallet() ? "Continue with Ethereum wallet" : "Continue with MetaMask"}</span>
              </Button>
              <Button variant="outline" full onClick={() => wallet("solana")} loading={busy === "solana"} className="justify-start">
                <ChainIcon chain="solana" className="h-5 w-5" />
                <span className="flex-1 text-center">{hasSolanaWallet() ? "Continue with Solana wallet" : "Continue with Phantom"}</span>
              </Button>
              <Button variant="outline" full onClick={() => (reset(), openAuth(mode === "login" ? "signup" : "login"))} className="justify-start">
                <Mail className="h-5 w-5" />
                <span className="flex-1 text-center">{mode === "login" ? "Sign up with email" : "Log in with email"}</span>
              </Button>
            </div>
            <div className="mt-5 flex justify-between text-sm">
              {mode === "login" ? (
                <button type="button" className="font-semibold underline" onClick={() => (reset(), openAuth("forgot"))}>
                  Forgot password?
                </button>
              ) : (
                <span />
              )}
              <span className="text-ink-muted">Wallet sign-in costs no gas.</span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
