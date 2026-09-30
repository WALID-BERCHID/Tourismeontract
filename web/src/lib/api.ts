const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";
const TOKEN_KEY = "tourisme.token";

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.fields);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Body) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: Body) => request<T>("PATCH", path, body ?? {}),
  put: <T>(path: string, body?: Body) => request<T>("PUT", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}
