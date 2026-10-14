import { randomBytes } from "node:crypto";
import { keccak256, toBytes, type Hex } from "viem";

export type IdPrefix =
  | "mer"
  | "usr"
  | "pi"
  | "pl"
  | "inv"
  | "att"
  | "stl"
  | "ref"
  | "whe"
  | "evt"
  | "dlv"
  | "rop"
  | "key"
  | "aud"
  | "tx"
  | "led"
  | "pev"
  | "wal"
  | "vlt";

/** Unguessable public id, e.g. `pi_3f9a...` (128 bits of entropy). */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

/** The bytes32 identifier committed on-chain for an off-chain id. */
export function toBytes32Id(id: string): Hex {
  return keccak256(toBytes(id));
}

export function randomToken(prefix: string, bytes = 24): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}
