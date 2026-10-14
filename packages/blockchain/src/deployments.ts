import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tryGetNetwork, type Deployment, type NetworkId } from "@plinth/shared";

const here = dirname(fileURLToPath(import.meta.url));

/** Repository `deployments/` directory (override with DEPLOYMENTS_DIR for containers). */
export function deploymentsDir(): string {
  return process.env.DEPLOYMENTS_DIR ? resolve(process.env.DEPLOYMENTS_DIR) : join(here, "..", "..", "..", "deployments");
}

export function loadDeployment(id: NetworkId | string): Deployment | undefined {
  const file = join(deploymentsDir(), `${id}.json`);
  if (!existsSync(file)) return undefined;
  const d = JSON.parse(readFileSync(file, "utf8")) as Deployment;
  const net = tryGetNetwork(id);
  if (!net || d.chainId !== net.chainId) throw new Error(`Deployment record ${id}.json does not match the registry chain id`);
  return d;
}
