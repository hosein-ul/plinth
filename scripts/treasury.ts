/**
 * Print the configured platform treasury for a network, so deploy commands never type an address by hand:
 *
 *   TREASURY=$(pnpm --silent treasury arc-testnet) forge script script/Deploy.s.sol ...
 *
 * The map lives in packages/shared/src/fees.ts (TREASURY_BY_NETWORK). Rotating a treasury means deploying a new
 * implementation version, which only affects NEW invoices.
 */
import { treasuryFor } from "@plinth/shared";

const id = process.argv[2];
if (!id) {
  console.error("usage: pnpm treasury <network-id>");
  process.exit(1);
}
console.log(treasuryFor(id));
