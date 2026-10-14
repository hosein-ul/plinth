import type { FastifyRequest } from "fastify";
import type { ZodType } from "zod";
import type { AuthContext } from "@plinth/engine";

export type AuthKind = "none" | "merchant" | "session" | "admin";

export interface RouteDef {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Fastify-style path, e.g. /v1/payment-intents/:id */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  /** none: public; merchant: API key OR dashboard session; session: dashboard session only; admin: operator token. */
  auth: AuthKind;
  body?: ZodType;
  query?: ZodType;
  /** Honour the Idempotency-Key header (POST only). */
  idempotent?: boolean;
  /** Per-minute request budget for this route (default depends on auth kind). */
  rateLimit?: number;
  /** Short description of the success response (documentation). */
  response?: string;
  successStatus?: number;
  handler: (args: { req: FastifyRequest; body: any; query: any; params: Record<string, string>; auth: AuthContext | null }) => Promise<unknown>;
}

export const route = (d: RouteDef): RouteDef => d;
