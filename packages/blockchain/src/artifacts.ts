import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";

const here = dirname(fileURLToPath(import.meta.url));

export interface Artifact {
  contractName: string;
  sourceFile: string;
  bytecode: Hex;
  deployedBytecode: Hex;
  immutableReferences: Record<string, { start: number; length: number }[]>;
  deployedCodeHash: Hex;
}

/** Compiled artifact exported by scripts/export-abis.mjs (bytecode needed for dev deploys & verification). */
export function loadArtifact(name: string): Artifact {
  return JSON.parse(readFileSync(join(here, "..", "artifacts", `${name}.json`), "utf8")) as Artifact;
}

/** Zero the immutable regions so runtime code is comparable across deployments. */
export function maskImmutables(deployed: Hex, refs: Artifact["immutableReferences"]): Hex {
  const bytes = Buffer.from(deployed.replace(/^0x/, ""), "hex");
  for (const list of Object.values(refs)) for (const { start, length } of list) bytes.fill(0, start, start + length);
  return `0x${bytes.toString("hex")}`;
}
