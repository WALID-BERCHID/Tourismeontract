import { createContext, useContext, useState, type ReactNode } from "react";
import { money } from "./format";

const KEY = "tourisme.currency";
const Ctx = createContext<{ currency: string; setCurrency: (c: string) => void; fmt: (usd: number, cents?: boolean) => string }>({
  currency: "USD",
  setCurrency: () => {},
  fmt: (usd) => money(usd),
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, set] = useState(() => {
    try {
      return localStorage.getItem(KEY) || "USD";
    } catch {
      return "USD";
    }
  });
  const setCurrency = (c: string) => {
    set(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {
      /* ignore */
    }
  };
  return <Ctx.Provider value={{ currency, setCurrency, fmt: (usd, cents) => money(usd, currency, { cents }) }}>{children}</Ctx.Provider>;
}

export const useCurrency = () => useContext(Ctx);
