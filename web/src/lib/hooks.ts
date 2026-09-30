import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Meta } from "./types";

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/meta"), staleTime: 5 * 60_000 });
}

export function useRates() {
  return useQuery({
    queryKey: ["rates"],
    queryFn: () => api.get<{ usd: Record<string, number>; live: boolean }>("/rates"),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useClickOutside<T extends HTMLElement>(onOutside: () => void, active = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside, active]);
  return ref;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setMatches(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useLockBody(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

export function useTitle(title?: string) {
  useEffect(() => {
    if (title) document.title = `${title} · Tourisme`;
  }, [title]);
}
