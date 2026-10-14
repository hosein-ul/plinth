import {
  concat,
  encodeAbiParameters,
  encodePacked,
  getCreate2Address,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { destinationKindIndex, type DestinationKind } from "@plinth/shared";

/** Where the swept funds go and what the platform takes: everything the address commits to besides the ids. */
export interface InvoiceRoute {
  /** The merchant's vault (VAULT) or the merchant's own wallet (DIRECT). */
  destination: Address;
  kind: DestinationKind;
  /** Platform fee in basis points, committed in the address. */
  feeBps: number;
}

export interface InvoiceAddressInput extends InvoiceRoute {
  /** InvoiceFactory address on the target chain (the CREATE2 deployer). */
  factory: Address;
  /** InvoiceDeposit implementation the factory clones. */
  implementation: Address;
  token: Address;
  /** Fee recipient: an immutable of the implementation, committed in the salt. */
  treasury: Address;
  merchantId: Hex; // bytes32
  invoiceId: Hex; // bytes32
  chainId: number;
  version: number;
}

/** Length of the clone's immutable args: destination(20) | feeBps(2) | kind(1) | merchantId(32) | invoiceId(32). */
export const INVOICE_ARGS_LENGTH = 87;

/** abi.encodePacked(destination, feeBps, kind, merchantId, invoiceId) — the clone's immutable args. */
export function invoiceCloneArgs(i: InvoiceAddressInput): Hex {
  return encodePacked(
    ["address", "uint16", "uint8", "bytes32", "bytes32"],
    [i.destination, i.feeBps, destinationKindIndex(i.kind), i.merchantId, i.invoiceId],
  );
}

/** keccak256(abi.encode(merchantId, invoiceId, destination, kind, feeBps, token, treasury, chainId, version)) — InvoiceFactory._salt. */
export function invoiceSalt(i: InvoiceAddressInput): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint8" },
        { type: "uint16" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint16" },
      ],
      [i.merchantId, i.invoiceId, i.destination, destinationKindIndex(i.kind), i.feeBps, i.token, i.treasury, BigInt(i.chainId), i.version],
    ),
  );
}

/** OpenZeppelin Clones._cloneCodeWithImmutableArgs (v5.6.1): 45-byte ERC-1167 proxy prefix + args. */
export function cloneInitCode(implementation: Address, args: Hex): Hex {
  const argsLen = (args.length - 2) / 2;
  return concat([
    "0x61",
    toHex(argsLen + 0x2d, { size: 2 }),
    "0x3d81600a3d39f3363d3d373d3d3d363d73",
    implementation,
    "0x5af43d82803e903d91602b57fd5bf3",
    args,
  ]);
}

/**
 * Counterfactual deposit address, computed fully offline. Must equal InvoiceFactory.predict(); this
 * equality is asserted against a real chain in the integration test and by the deployment verifier.
 */
export function computeInvoiceAddress(i: InvoiceAddressInput): Address {
  const initCode = cloneInitCode(i.implementation, invoiceCloneArgs(i));
  return getCreate2Address({ from: i.factory, salt: invoiceSalt(i), bytecodeHash: keccak256(initCode) });
}
