// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Fixture} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InvoiceDeposit} from "../src/InvoiceDeposit.sol";
import {InvoiceFactory} from "../src/InvoiceFactory.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MerchantVault} from "../src/MerchantVault.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";

contract InvoiceSweepTest is Fixture {
    event Swept(bytes32 indexed invoiceId, bytes32 indexed merchantId, address indexed vault, address token, uint256 amount);
    event InvoiceDeployed(bytes32 indexed invoiceId, bytes32 indexed merchantId, address indexed vault, address invoice);

    // ------------------------------------------------------------------ THE critical test

    /// Send USDC to a predicted-but-undeployed address, then deploy + sweep through a relayer.
    /// The invoice address has no native balance, no code beforehand and no private key.
    function test_gaslessSweepFromUndeployedAddress() public {
        bytes32 inv = invoiceId("INV-1");
        address predicted = invoices.predict(MERCHANT_A, inv, address(vaultA));

        assertEq(predicted.code.length, 0, "must be undeployed");
        assertEq(predicted.balance, 0, "no native gas");

        // Customer pays the counterfactual address.
        usdc.mint(address(this), 125_000_000);
        usdc.transfer(predicted, 125_000_000);
        assertEq(usdc.balanceOf(predicted), 125_000_000);
        assertEq(predicted.code.length, 0, "still undeployed after payment");

        // Relayer (the only party paying gas) deploys + sweeps in ONE transaction.
        vm.expectEmit(true, true, true, true, predicted);
        emit Swept(inv, MERCHANT_A, address(vaultA), address(usdc), 125_000_000);
        vm.prank(relayer);
        (address deployed, uint256 amount) = invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA));

        assertEq(deployed, predicted, "deployed at predicted address");
        assertEq(amount, 125_000_000);
        assertGt(predicted.code.length, 0, "clone deployed");
        assertEq(usdc.balanceOf(predicted), 0, "invoice drained");
        assertEq(usdc.balanceOf(address(vaultA)), 125_000_000, "vault credited");
        assertEq(predicted.balance, 0, "invoice address never held native gas");
        assertEq(usdc.balanceOf(address(vaultB)), 0, "other merchant untouched");
    }

    // ------------------------------------------------------------------ address derivation

    function test_predictedEqualsDeployed_fuzz(bytes32 merchant, bytes32 inv, uint96 amount) public {
        address owner = makeAddr("fuzzOwner");
        address vault = vaults.createVault(merchant, owner, 0);
        address predicted = invoices.predict(merchant, inv, vault);
        usdc.mint(predicted, amount);
        (address deployed, uint256 swept) = invoices.deployAndSweep(merchant, inv, vault);
        assertEq(deployed, predicted);
        assertEq(swept, amount);
        assertEq(usdc.balanceOf(vault), amount);
    }

    function test_addressChangesWithEveryInput() public {
        bytes32 inv = invoiceId("INV-1");
        address base = invoices.predict(MERCHANT_A, inv, address(vaultA));

        // different invoice
        assertTrue(invoices.predict(MERCHANT_A, invoiceId("INV-2"), address(vaultA)) != base);
        // different merchant id
        assertTrue(invoices.predict(MERCHANT_B, inv, address(vaultA)) != base);
        // different vault
        assertTrue(invoices.predict(MERCHANT_A, inv, address(vaultB)) != base);
        // same inputs are stable
        assertEq(invoices.predict(MERCHANT_A, inv, address(vaultA)), base);

        // different token => different factory deployment => different address
        MockFiatToken otherToken = new MockFiatToken();
        VaultFactory otherVaults = new VaultFactory(IERC20(address(otherToken)));
        InvoiceFactory otherFactory = new InvoiceFactory(address(impl), IERC20(address(otherToken)), otherVaults, 1);
        assertTrue(otherFactory.predict(MERCHANT_A, inv, address(vaultA)) != base);

        // different version
        InvoiceFactory v2 = new InvoiceFactory(address(impl), IERC20(address(usdc)), vaults, 2);
        assertTrue(v2.predict(MERCHANT_A, inv, address(vaultA)) != base);

        // different network (chain id) with identical factory bytecode/inputs
        vm.chainId(999);
        InvoiceFactory otherChain = new InvoiceFactory(address(impl), IERC20(address(usdc)), vaults, 1);
        assertTrue(otherChain.predict(MERCHANT_A, inv, address(vaultA)) != base);
    }

    function test_chainIdIsBoundIntoCloneArgs() public {
        bytes32 inv = invoiceId("INV-1");
        address predicted = invoices.predict(MERCHANT_A, inv, address(vaultA));
        usdc.mint(predicted, 10e6);
        invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA));
        usdc.mint(predicted, 5e6);
        // The same bytecode replayed on a fork/other chain must not sweep.
        vm.chainId(31337 + 1);
        vm.expectRevert(abi.encodeWithSelector(InvoiceDeposit.WrongChain.selector, 31337, 31338));
        InvoiceDeposit(predicted).sweep();
    }

    function test_cloneConfigIntegrity() public {
        bytes32 inv = invoiceId("INV-CFG");
        invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA));
        address inst = invoices.predict(MERCHANT_A, inv, address(vaultA));
        (IERC20 token, address vault, bytes32 m, bytes32 i, uint256 chainId, uint16 version) =
            InvoiceDeposit(inst).config();
        assertEq(address(token), address(usdc));
        assertEq(vault, address(vaultA));
        assertEq(m, MERCHANT_A);
        assertEq(i, inv);
        assertEq(chainId, block.chainid);
        assertEq(version, 1);
    }

    // ------------------------------------------------------------------ repeat / partial / over

    function test_repeatedDepositsAndSweeps() public {
        bytes32 inv = invoiceId("INV-REPEAT");
        address predicted = invoices.predict(MERCHANT_A, inv, address(vaultA));

        usdc.mint(predicted, 30e6); // partial
        (, uint256 a1) = invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA));
        assertEq(a1, 30e6);

        (, uint256 a2) = invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA)); // nothing new
        assertEq(a2, 0, "zero balance sweep is harmless");

        usdc.mint(predicted, 80e6); // second part + overpay
        InvoiceDeposit(predicted).sweep(); // permissionless direct sweep

        assertEq(usdc.balanceOf(address(vaultA)), 110e6);
        assertEq(usdc.balanceOf(predicted), 0);
    }

    function test_zeroBalanceSweepEmitsNothing() public {
        bytes32 inv = invoiceId("INV-ZERO");
        vm.recordLogs();
        invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA));
        // only InvoiceDeployed, no Swept
        assertEq(vm.getRecordedLogs().length, 1);
    }

    function test_multipleInvoicesSameMerchantAndIsolation() public {
        bytes32 i1 = invoiceId("A-1");
        bytes32 i2 = invoiceId("A-2");
        bytes32 i3 = invoiceId("B-1");
        usdc.mint(invoices.predict(MERCHANT_A, i1, address(vaultA)), 1e6);
        usdc.mint(invoices.predict(MERCHANT_A, i2, address(vaultA)), 2e6);
        usdc.mint(invoices.predict(MERCHANT_B, i3, address(vaultB)), 4e6);

        invoices.deployAndSweep(MERCHANT_A, i1, address(vaultA));
        invoices.deployAndSweep(MERCHANT_A, i2, address(vaultA));
        invoices.deployAndSweep(MERCHANT_B, i3, address(vaultB));

        assertEq(usdc.balanceOf(address(vaultA)), 3e6);
        assertEq(usdc.balanceOf(address(vaultB)), 4e6);
    }

    function test_batchSettlementSkipsFailingItem() public {
        bytes32 i1 = invoiceId("BATCH-1");
        bytes32 i2 = invoiceId("BATCH-2");
        usdc.mint(invoices.predict(MERCHANT_A, i1, address(vaultA)), 1e6);
        usdc.mint(invoices.predict(MERCHANT_A, i2, address(vaultA)), 2e6);

        InvoiceFactory.Item[] memory items = new InvoiceFactory.Item[](3);
        items[0] = InvoiceFactory.Item(MERCHANT_A, i1, address(vaultA));
        items[1] = InvoiceFactory.Item(MERCHANT_A, invoiceId("bad"), attacker); // not a registered vault
        items[2] = InvoiceFactory.Item(MERCHANT_A, i2, address(vaultA));
        bool[] memory ok = invoices.deployAndSweepBatch(items);
        assertTrue(ok[0]);
        assertFalse(ok[1]);
        assertTrue(ok[2]);
        assertEq(usdc.balanceOf(address(vaultA)), 3e6);
    }

    // ------------------------------------------------------------------ attack surface

    function test_rejectsUnregisteredVault() public {
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.UnknownVault.selector, attacker));
        invoices.deployAndSweep(MERCHANT_A, invoiceId("X"), attacker);
    }

    function test_attackerCannotRedirectBySupplyingDifferentVault() public {
        // Attacker registers their own vault for the same merchant id and deploys an invoice
        // against it. That is a DIFFERENT address and cannot touch the victim's deposit address.
        bytes32 inv = invoiceId("INV-HIJACK");
        address victimAddr = invoices.predict(MERCHANT_A, inv, address(vaultA));
        usdc.mint(victimAddr, 50e6);

        address evilVault = vaults.createVault(MERCHANT_A, attacker, 0);
        vm.prank(attacker);
        (address evilInvoice,) = invoices.deployAndSweep(MERCHANT_A, inv, evilVault);

        assertTrue(evilInvoice != victimAddr);
        assertEq(usdc.balanceOf(victimAddr), 50e6, "victim deposit untouched");
        assertEq(usdc.balanceOf(evilVault), 0);

        // The genuine sweep still reaches the genuine vault.
        invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA));
        assertEq(usdc.balanceOf(address(vaultA)), 50e6);
    }

    function test_implementationCannotBeSweptDirectly() public {
        usdc.mint(address(impl), 1e6);
        vm.expectRevert(InvoiceDeposit.NotAClone.selector);
        impl.sweep();
    }

    function test_cannotDeployTwiceAndNoReinitialisation() public {
        bytes32 inv = invoiceId("INV-TWICE");
        invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA));
        // Second call must not revert (idempotent) and must not emit a second InvoiceDeployed.
        vm.recordLogs();
        invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA));
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function test_noCallerSuppliedRecipientExists() public {
        // sweep() has no parameters: whoever calls it, funds can only reach the vault.
        bytes32 inv = invoiceId("INV-RECIP");
        address predicted = invoices.predict(MERCHANT_A, inv, address(vaultA));
        usdc.mint(predicted, 9e6);
        invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA));
        usdc.mint(predicted, 3e6);
        vm.prank(attacker);
        InvoiceDeposit(predicted).sweep();
        assertEq(usdc.balanceOf(attacker), 0);
        assertEq(usdc.balanceOf(address(vaultA)), 12e6);
    }

    function test_constructorRequiresImplementationCode() public {
        vm.expectRevert(InvoiceFactory.NoImplementationCode.selector);
        new InvoiceFactory(makeAddr("noCode"), IERC20(address(usdc)), vaults, 1);
    }

    function test_constructorRejectsZero() public {
        vm.expectRevert(InvoiceFactory.ZeroAddress.selector);
        new InvoiceFactory(address(0), IERC20(address(usdc)), vaults, 1);
    }

    function test_wrongTokenFundsAreNotSwept() public {
        // A non-official token sent to an invoice address stays there; sweep() only touches USDC.
        bytes32 inv = invoiceId("INV-WRONGTOKEN");
        address predicted = invoices.predict(MERCHANT_A, inv, address(vaultA));
        MockFiatToken fake = new MockFiatToken();
        fake.mint(predicted, 100e6);
        invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA));
        assertEq(fake.balanceOf(predicted), 100e6);
        assertEq(fake.balanceOf(address(vaultA)), 0);

        // Only the vault owner can recover it; neither relayer nor attacker can.
        vm.prank(relayer);
        vm.expectRevert(InvoiceDeposit.NotVaultOwner.selector);
        InvoiceDeposit(predicted).rescueToken(IERC20(address(fake)), relayer, 100e6);
        vm.prank(merchantAOwner);
        InvoiceDeposit(predicted).rescueToken(IERC20(address(fake)), merchantAOwner, 100e6);
        assertEq(fake.balanceOf(merchantAOwner), 100e6);
    }

    function test_rescueCannotTouchSettlementToken() public {
        bytes32 inv = invoiceId("INV-RESCUE-USDC");
        address predicted = invoices.predict(MERCHANT_A, inv, address(vaultA));
        invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA));
        usdc.mint(predicted, 5e6);
        vm.prank(merchantAOwner);
        vm.expectRevert(InvoiceDeposit.CannotRescueSettlementToken.selector);
        InvoiceDeposit(predicted).rescueToken(IERC20(address(usdc)), merchantAOwner, 5e6);
    }
}
