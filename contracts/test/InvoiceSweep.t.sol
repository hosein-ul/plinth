// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Fixture} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InvoiceDeposit} from "../src/InvoiceDeposit.sol";
import {InvoiceFactory} from "../src/InvoiceFactory.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {DestinationKind} from "../src/DestinationKind.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";

/// @dev Vault-mode behaviour of the invoice clones, with the platform fee in place.
contract InvoiceSweepTest is Fixture {
    event Swept(
        bytes32 indexed invoiceId,
        bytes32 indexed merchantId,
        address indexed destination,
        DestinationKind kind,
        address token,
        uint256 amount,
        uint256 fee
    );
    event InvoiceDeployed(
        bytes32 indexed invoiceId,
        bytes32 indexed merchantId,
        address indexed destination,
        address invoice,
        DestinationKind kind,
        uint16 feeBps
    );

    // ------------------------------------------------------------------ THE critical test

    /// Send USDC to a predicted-but-undeployed address, then deploy + sweep through a relayer.
    /// The invoice address has no native balance, no code beforehand and no private key.
    function test_gaslessSweepFromUndeployedAddress() public {
        bytes32 inv = invoiceId("INV-1");
        address predicted = predictV(MERCHANT_A, inv, address(vaultA));

        assertEq(predicted.code.length, 0, "must be undeployed");
        assertEq(predicted.balance, 0, "no native gas");

        usdc.mint(address(this), 125_000_000);
        usdc.transfer(predicted, 125_000_000);
        assertEq(usdc.balanceOf(predicted), 125_000_000);
        assertEq(predicted.code.length, 0, "still undeployed after payment");

        uint256 fee = feeOf(125_000_000, FEE);
        assertEq(fee, 250_000);

        vm.expectEmit(true, true, true, true, predicted);
        emit Swept(inv, MERCHANT_A, address(vaultA), DestinationKind.VAULT, address(usdc), 125_000_000, fee);
        vm.prank(relayer);
        (address deployed, uint256 amount) = settleV(MERCHANT_A, inv, address(vaultA));

        assertEq(deployed, predicted, "deployed at predicted address");
        assertEq(amount, 125_000_000, "amount is the whole swept balance");
        assertGt(predicted.code.length, 0, "clone deployed");
        assertEq(usdc.balanceOf(predicted), 0, "invoice drained");
        assertEq(usdc.balanceOf(address(vaultA)), 125_000_000 - fee, "vault gets the net");
        assertEq(usdc.balanceOf(treasury), fee, "treasury gets the fee");
        assertEq(predicted.balance, 0, "invoice address never held native gas");
        assertEq(usdc.balanceOf(address(vaultB)), 0, "other merchant untouched");
        assertEq(usdc.balanceOf(relayer), 0, "relayer earns nothing from funds");
    }

    // ------------------------------------------------------------------ address derivation

    function test_predictedEqualsDeployed_fuzz(bytes32 merchant, bytes32 inv, uint96 amount, uint16 feeRaw) public {
        uint16 feeBps = uint16(bound(feeRaw, 0, MAX_FEE));
        address owner = makeAddr("fuzzOwner");
        address vault = vaults.createVault(merchant, owner, 0);
        address predicted = invoices.predict(merchant, inv, vault, DestinationKind.VAULT, feeBps);
        usdc.mint(predicted, amount);
        (address deployed, uint256 swept) = invoices.deployAndSweep(merchant, inv, vault, DestinationKind.VAULT, feeBps);
        assertEq(deployed, predicted);
        assertEq(swept, amount);
        uint256 fee = feeOf(amount, feeBps);
        assertEq(usdc.balanceOf(vault), amount - fee);
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(usdc.balanceOf(predicted), 0, "no residual balance");
    }

    function test_addressChangesWithEveryInput() public {
        bytes32 inv = invoiceId("INV-1");
        address base = predictV(MERCHANT_A, inv, address(vaultA));

        assertTrue(predictV(MERCHANT_A, invoiceId("INV-2"), address(vaultA)) != base, "invoice");
        assertTrue(predictV(MERCHANT_B, inv, address(vaultA)) != base, "merchant id");
        assertTrue(predictV(MERCHANT_A, inv, address(vaultB)) != base, "vault");
        assertTrue(invoices.predict(MERCHANT_A, inv, address(vaultA), DestinationKind.VAULT, FEE + 1) != base, "fee");
        assertTrue(invoices.predict(MERCHANT_A, inv, address(vaultA), DestinationKind.DIRECT, FEE) != base, "kind");
        assertEq(predictV(MERCHANT_A, inv, address(vaultA)), base, "stable");
    }

    function _otherFactory(IERC20 token, address treasury_, uint16 version_) internal returns (InvoiceFactory) {
        VaultFactory v = address(token) == address(usdc) ? vaults : new VaultFactory(token);
        return new InvoiceFactory(address(new InvoiceDeposit(token, treasury_, MAX_FEE, version_)), v);
    }

    function _baseAddress() internal view returns (address) {
        return predictV(MERCHANT_A, invoiceId("INV-1"), address(vaultA));
    }

    function test_addressChangesWithTheToken() public {
        InvoiceFactory f = _otherFactory(IERC20(address(new MockFiatToken())), treasury, VERSION);
        assertTrue(f.predict(MERCHANT_A, invoiceId("INV-1"), address(vaultA), DestinationKind.VAULT, FEE) != _baseAddress());
    }

    function test_addressChangesWithTheVersion() public {
        InvoiceFactory f = _otherFactory(IERC20(address(usdc)), treasury, VERSION + 1);
        assertTrue(f.predict(MERCHANT_A, invoiceId("INV-1"), address(vaultA), DestinationKind.VAULT, FEE) != _baseAddress());
    }

    function test_addressChangesWithTheTreasury() public {
        InvoiceFactory f = _otherFactory(IERC20(address(usdc)), attacker, VERSION);
        assertTrue(f.predict(MERCHANT_A, invoiceId("INV-1"), address(vaultA), DestinationKind.VAULT, FEE) != _baseAddress());
    }

    function test_addressChangesWithTheChain() public {
        address base = _baseAddress();
        vm.chainId(999);
        InvoiceFactory f = _otherFactory(IERC20(address(usdc)), treasury, VERSION);
        assertTrue(f.predict(MERCHANT_A, invoiceId("INV-1"), address(vaultA), DestinationKind.VAULT, FEE) != base);
    }

    function test_chainIdIsBoundIntoTheImplementation() public {
        bytes32 inv = invoiceId("INV-1");
        address predicted = predictV(MERCHANT_A, inv, address(vaultA));
        usdc.mint(predicted, 10e6);
        settleV(MERCHANT_A, inv, address(vaultA));
        usdc.mint(predicted, 5e6);
        // The same bytecode replayed on a fork/other chain must not sweep.
        vm.chainId(31337 + 1);
        vm.expectRevert(abi.encodeWithSelector(InvoiceDeposit.WrongChain.selector, 31337, 31338));
        InvoiceDeposit(predicted).sweep();
    }

    function test_cloneConfigIntegrity() public {
        bytes32 inv = invoiceId("INV-CFG");
        settleV(MERCHANT_A, inv, address(vaultA));
        address inst = predictV(MERCHANT_A, inv, address(vaultA));
        InvoiceDeposit.Config memory c = InvoiceDeposit(inst).config();
        assertEq(address(c.token), address(usdc));
        assertEq(c.destination, address(vaultA));
        assertEq(uint8(c.kind), uint8(DestinationKind.VAULT));
        assertEq(c.feeBps, FEE);
        assertEq(c.treasury, treasury);
        assertEq(c.maxFeeBps, MAX_FEE);
        assertEq(c.merchantId, MERCHANT_A);
        assertEq(c.invoiceId, inv);
        assertEq(c.chainId, block.chainid);
        assertEq(c.version, VERSION);
    }

    // ------------------------------------------------------------------ repeat / partial / over

    function test_repeatedDepositsAndSweeps() public {
        bytes32 inv = invoiceId("INV-REPEAT");
        address predicted = predictV(MERCHANT_A, inv, address(vaultA));

        usdc.mint(predicted, 30e6); // partial
        (, uint256 a1) = settleV(MERCHANT_A, inv, address(vaultA));
        assertEq(a1, 30e6);

        (, uint256 a2) = settleV(MERCHANT_A, inv, address(vaultA)); // nothing new
        assertEq(a2, 0, "zero balance sweep is harmless");

        usdc.mint(predicted, 80e6); // second part + overpay
        InvoiceDeposit(predicted).sweep(); // permissionless direct sweep

        assertEq(usdc.balanceOf(address(vaultA)) + usdc.balanceOf(treasury), 110e6);
        assertEq(usdc.balanceOf(treasury), feeOf(30e6, FEE) + feeOf(80e6, FEE));
        assertEq(usdc.balanceOf(predicted), 0);
    }

    function test_zeroBalanceSweepEmitsNothing() public {
        bytes32 inv = invoiceId("INV-ZERO");
        vm.recordLogs();
        settleV(MERCHANT_A, inv, address(vaultA));
        // only InvoiceDeployed, no Swept
        assertEq(vm.getRecordedLogs().length, 1);
    }

    function test_multipleInvoicesSameMerchantAndIsolation() public {
        bytes32 i1 = invoiceId("A-1");
        bytes32 i2 = invoiceId("A-2");
        bytes32 i3 = invoiceId("B-1");
        usdc.mint(predictV(MERCHANT_A, i1, address(vaultA)), 1e6);
        usdc.mint(predictV(MERCHANT_A, i2, address(vaultA)), 2e6);
        usdc.mint(predictV(MERCHANT_B, i3, address(vaultB)), 4e6);

        settleV(MERCHANT_A, i1, address(vaultA));
        settleV(MERCHANT_A, i2, address(vaultA));
        settleV(MERCHANT_B, i3, address(vaultB));

        assertEq(usdc.balanceOf(address(vaultA)), 3e6 - feeOf(1e6, FEE) - feeOf(2e6, FEE));
        assertEq(usdc.balanceOf(address(vaultB)), 4e6 - feeOf(4e6, FEE));
        assertEq(usdc.balanceOf(treasury), feeOf(1e6, FEE) + feeOf(2e6, FEE) + feeOf(4e6, FEE));
    }

    function test_batchSettlementSkipsFailingItem() public {
        bytes32 i1 = invoiceId("BATCH-1");
        bytes32 i2 = invoiceId("BATCH-2");
        usdc.mint(predictV(MERCHANT_A, i1, address(vaultA)), 1e6);
        usdc.mint(predictV(MERCHANT_A, i2, address(vaultA)), 2e6);

        InvoiceFactory.Item[] memory items = new InvoiceFactory.Item[](4);
        items[0] = InvoiceFactory.Item(MERCHANT_A, i1, address(vaultA), DestinationKind.VAULT, FEE);
        items[1] = InvoiceFactory.Item(MERCHANT_A, invoiceId("bad"), attacker, DestinationKind.VAULT, FEE); // not a registered vault
        items[2] = InvoiceFactory.Item(MERCHANT_A, i2, address(vaultA), DestinationKind.VAULT, FEE);
        items[3] = InvoiceFactory.Item(MERCHANT_A, invoiceId("fee"), address(vaultA), DestinationKind.VAULT, MAX_FEE + 1);
        bool[] memory ok = invoices.deployAndSweepBatch(items);
        assertTrue(ok[0]);
        assertFalse(ok[1]);
        assertTrue(ok[2]);
        assertFalse(ok[3], "fee above the cap is refused");
        assertEq(usdc.balanceOf(address(vaultA)) + usdc.balanceOf(treasury), 3e6);
    }

    // ------------------------------------------------------------------ attack surface

    function test_rejectsUnregisteredVault() public {
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.UnknownVault.selector, attacker));
        settleV(MERCHANT_A, invoiceId("X"), attacker);
    }

    function test_attackerCannotRedirectBySupplyingDifferentVault() public {
        // Attacker registers their own vault for the same merchant id and deploys an invoice
        // against it. That is a DIFFERENT address and cannot touch the victim's deposit address.
        bytes32 inv = invoiceId("INV-HIJACK");
        address victimAddr = predictV(MERCHANT_A, inv, address(vaultA));
        usdc.mint(victimAddr, 50e6);

        address evilVault = vaults.createVault(MERCHANT_A, attacker, 0);
        vm.prank(attacker);
        (address evilInvoice,) = settleV(MERCHANT_A, inv, evilVault);

        assertTrue(evilInvoice != victimAddr);
        assertEq(usdc.balanceOf(victimAddr), 50e6, "victim deposit untouched");
        assertEq(usdc.balanceOf(evilVault), 0);

        // The genuine sweep still reaches the genuine vault.
        settleV(MERCHANT_A, inv, address(vaultA));
        assertEq(usdc.balanceOf(address(vaultA)), 50e6 - feeOf(50e6, FEE));
    }

    function test_attackerCannotLowerTheFeeOfAnIssuedAddress() public {
        // Passing feeBps = 0 derives a different (empty) address; the funded address is untouched.
        bytes32 inv = invoiceId("INV-FEE-HIJACK");
        address funded = predictV(MERCHANT_A, inv, address(vaultA));
        usdc.mint(funded, 100e6);
        vm.prank(attacker);
        (address other, uint256 amount) = invoices.deployAndSweep(MERCHANT_A, inv, address(vaultA), DestinationKind.VAULT, 0);
        assertTrue(other != funded);
        assertEq(amount, 0);
        assertEq(usdc.balanceOf(funded), 100e6);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_implementationCannotBeSweptDirectly() public {
        usdc.mint(address(impl), 1e6);
        vm.expectRevert(InvoiceDeposit.NotAClone.selector);
        impl.sweep();
    }

    function test_cannotDeployTwiceAndNoReinitialisation() public {
        bytes32 inv = invoiceId("INV-TWICE");
        settleV(MERCHANT_A, inv, address(vaultA));
        // Second call must not revert (idempotent) and must not emit a second InvoiceDeployed.
        vm.recordLogs();
        settleV(MERCHANT_A, inv, address(vaultA));
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function test_noCallerSuppliedRecipientExists() public {
        // sweep() has no parameters: whoever calls it, funds can only reach the vault and the treasury.
        bytes32 inv = invoiceId("INV-RECIP");
        address predicted = predictV(MERCHANT_A, inv, address(vaultA));
        usdc.mint(predicted, 9e6);
        settleV(MERCHANT_A, inv, address(vaultA));
        usdc.mint(predicted, 3e6);
        vm.prank(attacker);
        InvoiceDeposit(predicted).sweep();
        assertEq(usdc.balanceOf(attacker), 0);
        assertEq(usdc.balanceOf(address(vaultA)) + usdc.balanceOf(treasury), 12e6);
    }

    function test_constructorRequiresImplementationCode() public {
        vm.expectRevert(InvoiceFactory.NoImplementationCode.selector);
        new InvoiceFactory(makeAddr("noCode"), vaults);
    }

    function test_constructorRejectsZeroAndMismatch() public {
        vm.expectRevert(InvoiceFactory.ZeroAddress.selector);
        new InvoiceFactory(address(0), vaults);

        // an implementation for a different token than the vault registry
        MockFiatToken otherToken = new MockFiatToken();
        InvoiceDeposit otherImpl = new InvoiceDeposit(IERC20(address(otherToken)), treasury, MAX_FEE, VERSION);
        vm.expectRevert(InvoiceFactory.ImplementationMismatch.selector);
        new InvoiceFactory(address(otherImpl), vaults);

        // an implementation built on another chain id
        vm.chainId(777);
        InvoiceDeposit otherChain = new InvoiceDeposit(IERC20(address(usdc)), treasury, MAX_FEE, VERSION);
        vm.chainId(31337);
        vm.expectRevert(InvoiceFactory.ImplementationMismatch.selector);
        new InvoiceFactory(address(otherChain), vaults);
    }

    function test_implementationConstructorRejectsBadConfig() public {
        vm.expectRevert(InvoiceDeposit.ZeroAddress.selector);
        new InvoiceDeposit(IERC20(address(usdc)), address(0), MAX_FEE, VERSION);
        vm.expectRevert(InvoiceDeposit.ZeroAddress.selector);
        new InvoiceDeposit(IERC20(address(0)), treasury, MAX_FEE, VERSION);
        vm.expectRevert(abi.encodeWithSelector(InvoiceDeposit.FeeTooHigh.selector, 10_001, 10_000));
        new InvoiceDeposit(IERC20(address(usdc)), treasury, 10_001, VERSION);
    }

    function test_wrongTokenFundsAreNotSwept() public {
        // A non-official token sent to an invoice address stays there; sweep() only touches the payment token.
        bytes32 inv = invoiceId("INV-WRONGTOKEN");
        address predicted = predictV(MERCHANT_A, inv, address(vaultA));
        MockFiatToken fake = new MockFiatToken();
        fake.mint(predicted, 100e6);
        settleV(MERCHANT_A, inv, address(vaultA));
        assertEq(fake.balanceOf(predicted), 100e6);
        assertEq(fake.balanceOf(address(vaultA)), 0);
        assertEq(fake.balanceOf(treasury), 0);

        // Only the vault owner can recover it; neither relayer nor attacker can.
        vm.prank(relayer);
        vm.expectRevert(InvoiceDeposit.NotRescueAuthority.selector);
        InvoiceDeposit(predicted).rescueToken(IERC20(address(fake)), relayer, 100e6);
        vm.prank(merchantAOwner);
        InvoiceDeposit(predicted).rescueToken(IERC20(address(fake)), merchantAOwner, 100e6);
        assertEq(fake.balanceOf(merchantAOwner), 100e6);
    }

    function test_rescueCannotTouchSettlementToken() public {
        bytes32 inv = invoiceId("INV-RESCUE-USDC");
        address predicted = predictV(MERCHANT_A, inv, address(vaultA));
        settleV(MERCHANT_A, inv, address(vaultA));
        usdc.mint(predicted, 5e6);
        vm.prank(merchantAOwner);
        vm.expectRevert(InvoiceDeposit.CannotRescueSettlementToken.selector);
        InvoiceDeposit(predicted).rescueToken(IERC20(address(usdc)), merchantAOwner, 5e6);
    }
}
