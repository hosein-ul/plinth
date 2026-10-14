import {
  encodeAbiParameters,
  keccak256,
  recoverTypedDataAddress,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import type { NetworkConfig } from "@plinth/shared";

/** keccak256("Plinth.PaymentRouter.v1") — PaymentRouter.NONCE_TAG. */
export const ROUTER_NONCE_TAG = keccak256(toBytes("Plinth.PaymentRouter.v1"));

export interface RouterPayment {
  from: Address;
  vault: Address;
  merchantId: Hex;
  invoiceId: Hex;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  salt: Hex;
}

/** Offline mirror of PaymentRouter.paymentNonce(). */
export function paymentNonce(chainId: number, router: Address, p: RouterPayment): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [ROUTER_NONCE_TAG, BigInt(chainId), router, p.invoiceId, p.merchantId, p.vault, p.from, p.value, p.salt],
    ),
  );
}

export const receiveWithAuthorizationTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** Exact EIP-712 payload the customer's wallet signs. `to` is always the PaymentRouter. */
export function buildReceiveAuthorization(net: NetworkConfig, router: Address, p: RouterPayment) {
  const nonce = paymentNonce(net.chainId, router, p);
  return {
    domain: {
      name: net.usdc.eip712.name,
      version: net.usdc.eip712.version,
      chainId: net.chainId,
      verifyingContract: net.usdc.address,
    },
    types: receiveWithAuthorizationTypes,
    primaryType: "ReceiveWithAuthorization" as const,
    message: {
      from: p.from,
      to: router,
      value: p.value,
      validAfter: p.validAfter,
      validBefore: p.validBefore,
      nonce,
    },
    nonce,
  };
}

export function splitSignature(sig: Hex): { v: number; r: Hex; s: Hex } {
  if (sig.length !== 132) throw new Error("Signature must be 65 bytes");
  const r = `0x${sig.slice(2, 66)}` as Hex;
  const s = `0x${sig.slice(66, 130)}` as Hex;
  let v = parseInt(sig.slice(130, 132), 16);
  if (v < 27) v += 27;
  if (v !== 27 && v !== 28) throw new Error("Invalid signature recovery id");
  return { v, r, s };
}

/** Recover the signer of an authorization; the backend rejects anything not signed by `from`. */
export async function recoverAuthorizationSigner(
  auth: ReturnType<typeof buildReceiveAuthorization>,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain: auth.domain,
    types: auth.types,
    primaryType: auth.primaryType,
    message: auth.message,
    signature,
  });
}
