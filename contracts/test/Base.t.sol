// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MerchantVault} from "../src/MerchantVault.sol";
import {InvoiceDeposit} from "../src/InvoiceDeposit.sol";
import {InvoiceFactory} from "../src/InvoiceFactory.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";
import {IFiatToken} from "../src/interfaces/IFiatToken.sol";
import {DestinationKind} from "../src/DestinationKind.sol";

/// @dev Shared fixture: token, factories, router, two merchants, a treasury and a relayer.
abstract contract Fixture is Test {
    MockFiatToken public usdc;
    VaultFactory public vaults;
    InvoiceDeposit public impl;
    InvoiceFactory public invoices;
    PaymentRouter public router;

    address public relayer = makeAddr("relayer");
    address public attacker = makeAddr("attacker");
    address public treasury = makeAddr("treasury");
    address internal merchantAOwner = makeAddr("merchantAOwner");
    address internal merchantBOwner = makeAddr("merchantBOwner");
    address internal merchantAWallet = makeAddr("merchantAWallet");
    bytes32 internal constant MERCHANT_A = keccak256("merchant-a");
    bytes32 internal constant MERCHANT_B = keccak256("merchant-b");
    uint64 internal constant DELAY = 1 days;

    uint16 internal constant FEE = 20; // 0.20%, the platform default
    uint16 internal constant MAX_FEE = 100; // 1%, the immutable cap
    uint16 internal constant VERSION = 2;

    MerchantVault public vaultA;
    MerchantVault public vaultB;

    function setUp() public virtual {
        usdc = new MockFiatToken();
        vaults = new VaultFactory(IERC20(address(usdc)));
        impl = new InvoiceDeposit(IERC20(address(usdc)), treasury, MAX_FEE, VERSION);
        invoices = new InvoiceFactory(address(impl), vaults);
        router = new PaymentRouter(IFiatToken(address(usdc)), vaults, treasury, MAX_FEE);
        vaultA = MerchantVault(vaults.createVault(MERCHANT_A, merchantAOwner, DELAY));
        vaultB = MerchantVault(vaults.createVault(MERCHANT_B, merchantBOwner, DELAY));
    }

    function invoiceId(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }

    /// @dev Address of a vault-mode invoice at the platform default fee.
    function predictV(bytes32 merchant, bytes32 inv, address vault) internal view returns (address) {
        return invoices.predict(merchant, inv, vault, DestinationKind.VAULT, FEE);
    }

    /// @dev Deploy and sweep a vault-mode invoice at the platform default fee.
    function settleV(bytes32 merchant, bytes32 inv, address vault) internal returns (address, uint256) {
        return invoices.deployAndSweep(merchant, inv, vault, DestinationKind.VAULT, FEE);
    }

    function feeOf(uint256 amount, uint16 bps) internal pure returns (uint256) {
        return (amount * bps) / 10_000;
    }
}
