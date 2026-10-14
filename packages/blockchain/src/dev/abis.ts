import {
  InvoiceDepositAbi,
  InvoiceFactoryAbi,
  MerchantVaultAbi,
  MockEurcAbi,
  MockFiatTokenAbi,
  PaymentRouterAbi,
  VaultFactoryAbi,
} from "../abi/generated";

const map = {
  InvoiceDeposit: InvoiceDepositAbi,
  InvoiceFactory: InvoiceFactoryAbi,
  MerchantVault: MerchantVaultAbi,
  MockEurc: MockEurcAbi,
  MockFiatToken: MockFiatTokenAbi,
  PaymentRouter: PaymentRouterAbi,
  VaultFactory: VaultFactoryAbi,
} as const;

export function abiOf(name: string) {
  const abi = (map as Record<string, readonly unknown[]>)[name];
  if (!abi) throw new Error(`unknown contract ${name}`);
  return abi as never;
}
