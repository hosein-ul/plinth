/** FAQ content as plain strings so the same text feeds the accordion and the FAQPage JSON-LD. Every answer is checked against the repository docs. */
export interface Faq { q: string; a: string }
export interface FaqGroup { id: string; title: string; items: Faq[] }

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        q: "What is Plinth?",
        a: "Plinth is a non-custodial USDC payment gateway. Each payment gets a unique address, or the customer signs a gasless authorization from a wallet. A watcher verifies the transfer on-chain, and a restricted relayer sweeps the funds into a vault that you own. The gateway holds no key that can move merchant funds.",
      },
      {
        q: "Can I accept real money today?",
        a: "No. Plinth runs on testnets only. Mainnet support is configured and disabled by default, nothing has been deployed to a mainnet, and the contracts have not been independently audited. Do not hold meaningful value until an audit is complete.",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    items: [
      {
        q: "What can customers pay with?",
        a: "USDC only, on the networks in the registry. Customers can pay from a connected browser wallet with one gasless signature, or send USDC to the unique address on the checkout page. Any other token sent to a deposit address is recorded as the wrong asset and is never swept.",
      },
      {
        q: "What happens if a customer pays too little, too much or too late?",
        a: "Several transfers add up. If the payment expires with only part of the amount it becomes underpaid. More than the amount is overpaid, with the excess recorded and refundable. Funds that become final after expiry are a late payment. Each case emits its own webhook event, so nothing is silently absorbed.",
      },
      {
        q: "What if a customer sends funds on the wrong network?",
        a: "Funds sent to an address on a chain where the invoice contract does not exist cannot be matched automatically, and nobody holds a key for that address, so they may be unrecoverable. The checkout warns about this prominently. Keep the transaction hash and contact support.",
      },
      {
        q: "How do refunds work?",
        a: "A refund is a new transfer that you send from your own vault, because Plinth cannot move vault funds. You record a refund request, send the transfer, and submit its transaction hash. The refund completes only after the transfer is verified on-chain.",
      },
    ],
  },
  {
    id: "security",
    title: "Security and custody",
    items: [
      {
        q: "Who holds the money?",
        a: "You do. Funds go from the customer to a per-invoice address and are swept into a MerchantVault whose only authority is its owner, an address you choose. The gateway and its relayer have no role in the vault, so they cannot withdraw, change the owner or choose a recipient.",
      },
      {
        q: "What if the Plinth backend or relayer key is compromised?",
        a: "That is the case the design targets. The relayer can call sweep(), which takes no arguments and can only send to the vault baked into the invoice contract. It cannot withdraw from a vault or change its rules. A compromise could still disrupt service, delay payments or spend the relayer's gas budget, which is capped.",
      },
      {
        q: "Have the contracts been audited?",
        a: "No. They are covered by unit, fuzz and invariant tests and by fork tests against the real USDC bytecode, but none of that is an independent audit. An audit is a precondition for any mainnet launch.",
      },
      {
        q: "Can my funds be frozen?",
        a: "Possibly, by the token issuer. USDC can be paused or blocklisted by its issuer, and a blocked vault or invoice address cannot receive or sweep funds. Plinth has no control over this. The risk disclosure covers it in more detail.",
      },
    ],
  },
  {
    id: "settlement",
    title: "Settlement and fees",
    items: [
      {
        q: "How long until funds reach my vault?",
        a: "It depends on the network's finality rule: one confirmation on Arc Testnet, 12 on Base Sepolia, and the finalized block on Ethereum (about 13 minutes). After that the relayer sweeps the funds in one transaction. No settlement-time guarantee or SLA is offered.",
      },
      {
        q: "What does Plinth cost?",
        a: "Nothing is charged today and no price list has been published. The relayer's gas cost is recorded per sweep, and a processing fee is a planned component that is not implemented yet. Pricing will be published with mainnet availability.",
      },
    ],
  },
  {
    id: "developers",
    title: "Developers",
    items: [
      {
        q: "How do I know a payment succeeded?",
        a: "Listen for signed webhooks, not redirects. Fulfil on payment.confirmed for speed, or on payment.completed once the funds are confirmed inside your vault. Verify the Plinth-Signature header (HMAC-SHA256 over the timestamp and raw body), reject timestamps older than five minutes and deduplicate on event.id.",
      },
      {
        q: "Is there a sandbox, an OpenAPI document or an SDK?",
        a: "There is a sandbox: test keys (sk_test_) operate on testnets and nothing is charged. The API publishes an OpenAPI 3.1 document at /v1/openapi.json. There is no official SDK or store plugin yet, so you call the REST API directly.",
      },
    ],
  },
  {
    id: "compliance",
    title: "Compliance",
    items: [
      {
        q: "Does Plinth do KYC, KYB or sanctions screening?",
        a: "No. The sandbox asks for a business name, an email address and a password, and the engine contains no identity verification or sanctions screening. The compliance posture for a production launch has not been decided; the launch checklist assigns it to legal counsel. If you need these controls, they are your responsibility today.",
      },
      {
        q: "Is Plinth licensed, registered or certified?",
        a: "No. There is no licence, registration, SOC 2, ISO or similar certification, and the legal pages are drafts that counsel has not reviewed. Whether your use of a payment gateway needs a licence depends on your jurisdiction, so seek your own advice.",
      },
    ],
  },
];

export const ALL_FAQ: Faq[] = FAQ_GROUPS.flatMap((g) => g.items);
