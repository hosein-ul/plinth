import { LegalShell } from "@/components/marketing/pages/legal-shell";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta({
  title: "Risk disclosure (draft)",
  description: "Draft risk disclosure for Plinth: testnet-only status, unaudited smart contracts, blockchain finality, stablecoin issuer risk and wallet security.",
  path: "/legal/risk-disclosure",
});

export default function RiskPage() {
  return (
    <LegalShell
      title="Risk disclosure"
      current="/legal/risk-disclosure"
      intro="What can go wrong when payments are settled on a blockchain, and what is unproven about Plinth. This is a draft."
      openItems={[
        "Replace [Operator name] with the real legal entity where it appears.",
        "Counsel must review the wording and add any disclosures required in the operator's jurisdictions.",
        "Update the testnet and audit sections when either status changes. They are true as of the last-updated date.",
      ]}
    >
      <p>Using blockchain payments carries risks that do not exist with a bank or card processor. Read this before relying on Plinth for anything. Nothing on this site is investment, legal, tax or financial advice.</p>

      <h2>1. Plinth is testnet-only</h2>
      <p>Plinth currently runs on test networks. Test tokens have no value and nothing should be treated as production money. Mainnet support is configured but disabled, and nothing has been deployed to any mainnet from the project&apos;s tooling. No live acceptance run on a public testnet had been recorded when this was written.</p>

      <h2>2. The smart contracts are not audited</h2>
      <p>The contracts have been tested with unit, fuzz and invariant tests, and against real USDC bytecode on forks. That is not an independent security audit. Undiscovered bugs could lose funds. The contracts are deliberately not upgradeable, so a bug cannot be patched in place; funds would have to be moved to new contracts, and some losses may be permanent. Do not hold meaningful value until an independent audit is finished.</p>

      <h2>3. Blockchain finality and reorganisations</h2>
      <p>A transaction included in a block is not always final. Some networks can reorganise recent blocks, which can reverse a payment you thought had arrived. Plinth waits for a per-network finality rule (for example a number of confirmations or the chain&apos;s finalized block) before treating funds as final, and it reverses its records if a block is reorganised before finality. These rules are judgement calls and may be wrong for a given network. A webhook of payment.confirmed means the rule was met, not that reversal is impossible.</p>

      <h2>4. Stablecoin issuer risk</h2>
      <ul>
        <li><strong>Blocklisting and pausing.</strong> The issuer of USDC can block specific addresses and pause transfers. A blocked vault or invoice address cannot receive or sweep funds, and Plinth cannot change that.</li>
        <li><strong>Value and redemption.</strong> USDC is a claim on a third party. It can lose its peg, and redemption depends on the issuer and on the law where you are.</li>
        <li><strong>Wrong token.</strong> Only the official USDC contract on each network counts as a payment. Other tokens sent to a deposit address are not swept and may be recoverable only by the vault owner using a rescue function.</li>
      </ul>

      <h2>5. Wallet and key security</h2>
      <ul>
        <li>The vault owner key is the only key that can move your funds. If it is lost, nobody can recover your funds. If it is stolen, the thief can withdraw them.</li>
        <li>A multisig owner reduces both risks. Forwarding rules take effect only after a delay, which gives you time to cancel an unauthorised change.</li>
        <li>Customers can lose funds by sending to the wrong network, the wrong address or a lookalike site. Funds sent to an address on a chain where it does not exist can be unrecoverable.</li>
        <li>Signing a message you do not understand can authorise a payment. Read what your wallet displays before you sign.</li>
        <li>Smart-contract wallets are not supported on the gasless path.</li>
      </ul>

      <h2>6. Operational and infrastructure risk</h2>
      <ul>
        <li>The gateway relies on RPC providers whose answers it trusts. A faulty provider could delay or mislead detection.</li>
        <li>A single relayer signer per network limits throughput, and its gas budget and safeguards can pause settlement. Paused settlement leaves funds at the invoice address, where they remain sweepable later.</li>
        <li>Native-currency transfers sent directly to a deposit address on Arc are not detected from events and show up only through reconciliation.</li>
        <li>There is no service-level agreement, and the status page does not yet publish an incident history.</li>
      </ul>

      <h2>7. Legal and regulatory risk</h2>
      <p>The rules for accepting digital assets differ by country and change. Plinth holds no licence, registration or certification, and it does not verify customers&apos; identities or screen for sanctions. You are responsible for whether your use of the service is lawful, and for your taxes and records. [Operator to add jurisdiction-specific disclosures.]</p>

      <h2>8. No guarantees</h2>
      <p>Everything here describes risks known at the date above. Other risks exist. If you do not understand these risks, do not use the service for real value.</p>
    </LegalShell>
  );
}
