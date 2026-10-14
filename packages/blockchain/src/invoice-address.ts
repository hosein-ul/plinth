import {
  concat,
  encodeAbiParameters,
  getCreate2Address,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";

export interface InvoiceAddressInput {
  /** InvoiceFactory address on the target chain (the CREATE2 deployer). */
  factory: Address;
  /** InvoiceDeposit implementation the factory clones. */
  implementation: Address;
  token: Address;
  vault: Address;
  merchantId: Hex; // bytes32
  invoiceId: Hex; // bytes32
  chainId: number;
  version: number;
}

/** abi.encode(token, vault, merchantId, invoiceId, chainId, version) — the clone's immutable args. */
export function invoiceCloneArgs(i: InvoiceAddressInput): Hex {
  return encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "uint16" },
    ],
    [i.token, i.vault, i.merchantId, i.invoiceId, BigInt(i.chainId), i.version],
  );
}

/** keccak256(abi.encode(merchantId, invoiceId, vault, token, chainId, version)) — InvoiceFactory._salt. */
export function invoiceSalt(i: InvoiceAddressInput): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint16" },
      ],
      [i.merchantId, i.invoiceId, i.vault, i.token, BigInt(i.chainId), i.version],
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
