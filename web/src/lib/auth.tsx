import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, getToken, setToken } from "./api";
import type { Chain, User } from "./types";
import { connectEvm, signEvmMessage } from "./chains/evm";
import { connectSolana, signSolanaMessage } from "./chains/solana";

type AuthMode = "login" | "signup" | "forgot";

interface AuthState {
  user: User | null;
  loading: boolean;
  unreadNotifications: number;
  unreadMessages: number;
  authModal: AuthMode | null;
  openAuth: (mode?: AuthMode, after?: () => void) => void;
  closeAuth: () => void;
  login: (email: string, password: string) => Promise<User>;
  signup: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<User>;
  walletLogin: (chain: Exclude<Chain, "eos">) => Promise<{ user: User; isNew: boolean }>;
  linkWallet: (chain: Exclude<Chain, "eos">) => Promise<string>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
  requireAuth: (after?: () => void) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

type Session = { token: string; user: User; isNew?: boolean };

async function signWithWallet(chain: Exclude<Chain, "eos">) {
  const address = chain === "evm" ? await connectEvm() : await connectSolana();
  const { nonce, message, address: normalized } = await api.get<{ nonce: string; message: string; address: string }>(`/auth/nonce?chain=${chain}&address=${address}`);
  const signature = chain === "evm" ? await signEvmMessage(message) : await signSolanaMessage(message);
  return { chain, address: normalized, nonce, signature };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  const [unread, setUnread] = useState({ notifications: 0, messages: 0 });
  const [authModal, setAuthModal] = useState<AuthMode | null>(null);
  const [afterAuth, setAfterAuth] = useState<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<{ user: User; unreadNotifications: number; unreadMessages: number }>("/auth/me");
      setUser(me.user);
      setUnread({ notifications: me.unreadNotifications, messages: me.unreadMessages });
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll unread counters so the header badges stay fresh.
  useEffect(() => {
    if (!user) return;
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [user, refresh]);

  const accept = useCallback(
    (s: Session) => {
      setToken(s.token);
      setUser(s.user);
      setAuthModal(null);
      qc.invalidateQueries();
      refresh();
      if (afterAuth) {
        const fn = afterAuth;
        setAfterAuth(null);
        setTimeout(fn, 0);
      }
      return s.user;
    },
    [afterAuth, qc, refresh]
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      unreadNotifications: unread.notifications,
      unreadMessages: unread.messages,
      authModal,
      openAuth: (mode = "login", after) => {
        setAfterAuth(() => after || null);
        setAuthModal(mode);
      },
      closeAuth: () => setAuthModal(null),
      login: async (email, password) => accept(await api.post<Session>("/auth/login", { email, password })),
      signup: async (data) => accept(await api.post<Session>("/auth/signup", data)),
      walletLogin: async (chain) => {
        const s = await api.post<Session>("/auth/wallet", await signWithWallet(chain));
        return { user: accept(s), isNew: !!s.isNew };
      },
      linkWallet: async (chain) => {
        const payload = await signWithWallet(chain);
        const s = await api.post<Session>("/auth/wallet", payload);
        setUser(s.user);
        return payload.address;
      },
      logout: () => {
        setToken(null);
        setUser(null);
        qc.clear();
      },
      refresh,
      setUser,
      requireAuth: (after) => {
        if (user) return true;
        setAfterAuth(() => after || null);
        setAuthModal("login");
        return false;
      },
    }),
    [user, loading, unread, authModal, accept, qc, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
