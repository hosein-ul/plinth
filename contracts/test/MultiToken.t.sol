// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Fixture} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InvoiceDeposit} from "../src/InvoiceDeposit.sol";
import {InvoiceFactory} from "../src/InvoiceFactory.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MerchantVault} from "../src/MerchantVault.sol";
import {DestinationKind} from "../src/DestinationKind.sol";
import {MockEurc} from "./mocks/MockFiatToken.sol";

/// @dev A second payment token on the same chain: its own implementation, factory and vault registry.
///      The token is an immutable of the implementation, so an invoice address commits to it.
contract MultiTokenTest is Fixture {
    MockEurc internal eurc;
    VaultFactory internal vaultsE;
    InvoiceDeposit internal implE;
    InvoiceFactory internal invoicesE;
    MerchantVault internal vaultAE;

    function setUp() public override {
        super.setUp();
        eurc = new MockEurc();
        vaultsE = new VaultFactory(IERC20(address(eurc)));
        implE = new InvoiceDeposit(IERC20(address(eurc)), treasury, MAX_FEE, VERSION);
        invoicesE = new InvoiceFactory(address(implE), vaultsE);
        vaultAE = MerchantVault(vaultsE.createVault(MERCHANT_A, merchantAOwner, DELAY));
    }

    function test_theSameInvoiceHasADifferentAddressPerToken() public view {
        bytes32 inv = invoiceId("SAME");
        address viaUsdc = invoices.predict(MERCHANT_A, inv, merchantAWallet, DestinationKind.DIRECT, FEE);
        address viaEurc = invoicesE.predict(MERCHANT_A, inv, merchantAWallet, DestinationKind.DIRECT, FEE);
        assertTrue(viaUsdc != viaEurc);
        // vault mode too (each token has its own vault registry and vault)
        assertTrue(address(vaultA) != address(vaultAE));
    }

    function test_eurcIsSplitInEurcUnitsAndUsdcIsUntouched() public {
        bytes32 inv = invoiceId("E1");
        address clone = invoicesE.predict(MERCHANT_A, inv, address(vaultAE), DestinationKind.VAULT, FEE);
        eurc.mint(clone, 500e6);
        invoicesE.deployAndSweep(MERCHANT_A, inv, address(vaultAE), DestinationKind.VAULT, FEE);
        uint256 fee = feeOf(500e6, FEE);
        assertEq(eurc.balanceOf(address(vaultAE)), 500e6 - fee);
        assertEq(eurc.balanceOf(treasury), fee);
        assertEq(eurc.balanceOf(clone), 0);
        assertEq(usdc.balanceOf(treasury), 0, "no USDC moved");
    }

    function test_aVaultOfOneTokenIsNotAVaultOfTheOther() public {
        // The EURC factory refuses the USDC vault, and the USDC factory refuses the EURC vault.
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.UnknownVault.selector, address(vaultA)));
        invoicesE.deployAndSweep(MERCHANT_A, invoiceId("X1"), address(vaultA), DestinationKind.VAULT, FEE);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.UnknownVault.selector, address(vaultAE)));
        invoices.deployAndSweep(MERCHANT_A, invoiceId("X2"), address(vaultAE), DestinationKind.VAULT, FEE);
    }

    function test_theOtherTokenSentToAnAddressIsNeverSweptAndOnlyTheOwnerCanRecoverIt() public {
        bytes32 inv = invoiceId("WRONG");
        address clone = invoicesE.predict(MERCHANT_A, inv, address(vaultAE), DestinationKind.VAULT, FEE);
        usdc.mint(clone, 40e6); // the customer paid USDC to a EURC invoice address
        (, uint256 swept) = invoicesE.deployAndSweep(MERCHANT_A, inv, address(vaultAE), DestinationKind.VAULT, FEE);
        assertEq(swept, 0, "a EURC clone only sweeps EURC");
        assertEq(usdc.balanceOf(clone), 40e6);
        assertEq(usdc.balanceOf(treasury), 0);

        vm.prank(relayer);
        vm.expectRevert(InvoiceDeposit.NotRescueAuthority.selector);
        InvoiceDeposit(clone).rescueToken(IERC20(address(usdc)), relayer, 40e6);
        vm.prank(merchantAOwner);
        InvoiceDeposit(clone).rescueToken(IERC20(address(usdc)), merchantAOwner, 40e6);
        assertEq(usdc.balanceOf(merchantAOwner), 40e6);
    }

    function test_theFeeCapAndTreasuryAreTheSameAcrossTokens() public view {
        assertEq(implE.TREASURY(), impl.TREASURY());
        assertEq(implE.MAX_FEE_BPS(), impl.MAX_FEE_BPS());
        assertEq(address(implE.TOKEN()), address(eurc));
        assertEq(address(invoicesE.TOKEN()), address(eurc));
    }
}
