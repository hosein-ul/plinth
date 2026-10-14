"use client";

export class ClientApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** Calls go through the same-origin BFF so the session token never touches JavaScript. */
export async function apiFetch<T = any>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const isPublic = path.startsWith("/public/");
  // /public/x → BFF /api/public/x ; /v1/x → BFF /api/proxy/v1/x
  const res = await fetch(isPublic ? `/api${path}` : `/api/proxy${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", "x-plinth-csrf": "1", ...init.headers },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && !isPublic && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) window.location.href = "/login";
    throw new ClientApiError(res.status, json?.error?.code ?? "ERROR", json?.error?.message ?? res.statusText, json?.error?.details);
  }
  return json as T;
}
