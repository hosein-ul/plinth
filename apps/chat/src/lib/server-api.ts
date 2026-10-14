import "server-only";
import { cookies } from "next/headers";

export const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const SESSION_COOKIE = "plinth_session";
export const ENV_COOKIE = "plinth_env";

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentEnv(): Promise<"test" | "live"> {
  return (await cookies()).get(ENV_COOKIE)?.value === "live" ? "live" : "test";
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Server-side call to the Plinth API on behalf of the signed-in user. */
export async function api<T = any>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.auth !== false) {
    const t = await sessionToken();
    if (t) headers.set("authorization", `Bearer ${t}`);
    headers.set("x-plinth-environment", await currentEnv());
  }
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? "ERROR", json?.error?.message ?? res.statusText);
  return json as T;
}
