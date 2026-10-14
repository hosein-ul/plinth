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

/// @dev Shared fixture: token, factories, router, two merchants and a relayer.
abstract contract Fixture is Test {
    MockFiatToken public usdc;
    VaultFactory public vaults;
    InvoiceDeposit public impl;
    InvoiceFactory public invoices;
    PaymentRouter public router;

    address public relayer = makeAddr("relayer");
    address public attacker = makeAddr("attacker");
    address internal merchantAOwner = makeAddr("merchantAOwner");
    address internal merchantBOwner = makeAddr("merchantBOwner");
    bytes32 internal constant MERCHANT_A = keccak256("merchant-a");
    bytes32 internal constant MERCHANT_B = keccak256("merchant-b");
    uint64 internal constant DELAY = 1 days;

    MerchantVault public vaultA;
    MerchantVault public vaultB;

    function setUp() public virtual {
        usdc = new MockFiatToken();
        vaults = new VaultFactory(IERC20(address(usdc)));
        impl = new InvoiceDeposit();
        invoices = new InvoiceFactory(address(impl), IERC20(address(usdc)), vaults, 1);
        router = new PaymentRouter(IFiatToken(address(usdc)), vaults);
        vaultA = MerchantVault(vaults.createVault(MERCHANT_A, merchantAOwner, DELAY));
        vaultB = MerchantVault(vaults.createVault(MERCHANT_B, merchantBOwner, DELAY));
    }

    function invoiceId(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
