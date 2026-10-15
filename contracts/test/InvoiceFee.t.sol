// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Fixture} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {InvoiceDeposit} from "../src/InvoiceDeposit.sol";
import {InvoiceFactory} from "../src/InvoiceFactory.sol";
import {DestinationKind} from "../src/DestinationKind.sol";

/// @dev Fee arithmetic, the fee cap, DIRECT mode and the fail-open fee leg.
contract InvoiceFeeTest is Fixture {
    event Swept(
        bytes32 indexed invoiceId,
        bytes32 indexed merchantId,
        address indexed destination,
        DestinationKind kind,
        address token,
        uint256 amount,
        uint256 fee
    );
    event FeeSkipped(bytes32 indexed invoiceId, uint16 feeBps, uint256 amount);

    function _direct(bytes32 inv, uint16 bps) internal view returns (address) {
        return invoices.predict(MERCHANT_A, inv, merchantAWallet, DestinationKind.DIRECT, bps);
    }

    function _settleDirect(bytes32 inv, uint16 bps) internal returns (address, uint256) {
        return invoices.deployAndSweep(MERCHANT_A, inv, merchantAWallet, DestinationKind.DIRECT, bps);
    }

    // ------------------------------------------------------------------ fee arithmetic

    function test_feeRoundsDownAndSkipsTransferWhenZero() public {
        // 20 bps of 499 = 0.998 -> 0: the treasury is not touched and the destination gets everything.
        bytes32 inv = invoiceId("DUST");
        usdc.mint(_direct(inv, FEE), 499);
        vm.expectEmit(true, true, true, true);
        emit Swept(inv, MERCHANT_A, merchantAWallet, DestinationKind.DIRECT, address(usdc), 499, 0);
        _settleDirect(inv, FEE);
        assertEq(usdc.balanceOf(merchantAWallet), 499);
        assertEq(usdc.balanceOf(treasury), 0);

        // 500 -> exactly 1
        bytes32 inv2 = invoiceId("DUST2");
        usdc.mint(_direct(inv2, FEE), 500);
        _settleDirect(inv2, FEE);
        assertEq(usdc.balanceOf(treasury), 1);
        assertEq(usdc.balanceOf(merchantAWallet), 499 + 499);
    }

    function test_zeroBpsTakesNoFee() public {
        bytes32 inv = invoiceId("FREE");
        usdc.mint(_direct(inv, 0), 1_000e6);
        _settleDirect(inv, 0);
        assertEq(usdc.balanceOf(merchantAWallet), 1_000e6);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_maxFeeIsAllowedAndAboveIsRefused() public {
        bytes32 inv = invoiceId("CAP");
        usdc.mint(_direct(inv, MAX_FEE), 1_000e6);
        _settleDirect(inv, MAX_FEE);
        assertEq(usdc.balanceOf(treasury), 10e6, "1% of 1000");

        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.FeeTooHigh.selector, MAX_FEE + 1, MAX_FEE));
        invoices.deployAndSweep(MERCHANT_A, invoiceId("CAP2"), merchantAWallet, DestinationKind.DIRECT, MAX_FEE + 1);
    }

    function test_cloneRefusesAFeeAboveTheCapEvenWithoutTheFactory() public {
        // Someone clones the implementation directly with a 5% fee. Its address is never one we issue,
        // but even that clone refuses to sweep.
        bytes memory args =
            abi.encodePacked(merchantAWallet, uint16(500), uint8(DestinationKind.DIRECT), MERCHANT_A, invoiceId("ROGUE"));
        address rogue = Clones.cloneWithImmutableArgs(address(impl), args);
        usdc.mint(rogue, 100e6);
        vm.expectRevert(abi.encodeWithSelector(InvoiceDeposit.FeeTooHigh.selector, 500, MAX_FEE));
        InvoiceDeposit(rogue).sweep();
    }

    function test_malformedCloneIsRejected() public {
        address bad = Clones.cloneWithImmutableArgs(address(impl), hex"01");
        vm.expectRevert(InvoiceDeposit.NotAClone.selector);
        InvoiceDeposit(bad).sweep();

        bytes memory args = abi.encodePacked(merchantAWallet, uint16(20), uint8(7), MERCHANT_A, invoiceId("KIND"));
        address badKind = Clones.cloneWithImmutableArgs(address(impl), args);
        vm.expectRevert(InvoiceDeposit.NotAClone.selector);
        InvoiceDeposit(badKind).sweep();
    }

    /// Outputs always add up to the swept amount, nothing is left behind, and the fee is the floor formula.
    function test_splitConservesValue_fuzz(uint96 amount, uint16 bpsRaw, bool direct) public {
        uint16 bps = uint16(bound(bpsRaw, 0, MAX_FEE));
        bytes32 inv = keccak256(abi.encode(amount, bps, direct));
        address dest = direct ? merchantAWallet : address(vaultA);
        DestinationKind kind = direct ? DestinationKind.DIRECT : DestinationKind.VAULT;
        address clone = invoices.predict(MERCHANT_A, inv, dest, kind, bps);
        usdc.mint(clone, amount);
        (, uint256 swept) = invoices.deployAndSweep(MERCHANT_A, inv, dest, kind, bps);

        uint256 fee = (uint256(amount) * bps) / 10_000;
        assertEq(swept, amount);
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(usdc.balanceOf(dest), uint256(amount) - fee);
        assertEq(usdc.balanceOf(treasury) + usdc.balanceOf(dest), amount, "sum of outputs == swept amount");
        assertEq(usdc.balanceOf(clone), 0, "no residual balance");
    }

    // ------------------------------------------------------------------ DIRECT mode

    function test_directPaysTheRegisteredWalletAndTheTreasuryInOneTransaction() public {
        bytes32 inv = invoiceId("DIRECT-1");
        address clone = _direct(inv, FEE);
        usdc.mint(clone, 200e6);
        vm.recordLogs();
        vm.prank(relayer);
        (address deployed, uint256 amount) = _settleDirect(inv, FEE);
        assertEq(deployed, clone);
        assertEq(amount, 200e6);
        assertEq(usdc.balanceOf(merchantAWallet), 200e6 - 400_000);
        assertEq(usdc.balanceOf(treasury), 400_000);
        assertEq(usdc.balanceOf(address(vaultA)), 0, "no vault involved");
        assertEq(usdc.balanceOf(clone), 0);
    }

    function test_directDestinationIsImmutableAndCannotBeRedirected() public {
        bytes32 inv = invoiceId("DIRECT-2");
        address clone = _direct(inv, FEE);
        usdc.mint(clone, 50e6);

        // An attacker names themselves as destination: that is a different, empty address.
        vm.prank(attacker);
        (address other, uint256 amount) = invoices.deployAndSweep(MERCHANT_A, inv, attacker, DestinationKind.DIRECT, FEE);
        assertTrue(other != clone);
        assertEq(amount, 0);
        assertEq(usdc.balanceOf(clone), 50e6);
        assertEq(usdc.balanceOf(attacker), 0);

        // The real sweep, by anyone, still pays the committed wallet.
        vm.prank(attacker);
        invoices.deployAndSweep(MERCHANT_A, inv, merchantAWallet, DestinationKind.DIRECT, FEE);
        assertEq(usdc.balanceOf(merchantAWallet), 50e6 - feeOf(50e6, FEE));
        assertEq(usdc.balanceOf(attacker), 0);
    }

    function test_directRejectsUnsafeDestinations() public {
        bytes32 inv = invoiceId("DIRECT-3");
        address[6] memory bad =
            [address(0), treasury, address(usdc), address(impl), address(invoices), address(vaults)];
        for (uint256 i = 0; i < bad.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.InvalidDestination.selector, bad[i]));
            invoices.deployAndSweep(MERCHANT_A, inv, bad[i], DestinationKind.DIRECT, FEE);
        }
    }

    function test_vaultKindStillRequiresARegisteredVault() public {
        vm.expectRevert(abi.encodeWithSelector(InvoiceFactory.UnknownVault.selector, merchantAWallet));
        invoices.deployAndSweep(MERCHANT_A, invoiceId("V"), merchantAWallet, DestinationKind.VAULT, FEE);
    }

    function test_theTwoModesNeverShareAnAddress() public view {
        bytes32 inv = invoiceId("MODES");
        // Same destination, same fee, same ids: only the kind differs.
        address asVault = invoices.predict(MERCHANT_A, inv, address(vaultA), DestinationKind.VAULT, FEE);
        address asDirect = invoices.predict(MERCHANT_A, inv, address(vaultA), DestinationKind.DIRECT, FEE);
        assertTrue(asVault != asDirect);
    }

    function test_addressDiffersPerDestinationAndFee() public {
        bytes32 inv = invoiceId("DIFF");
        address a = _direct(inv, FEE);
        assertTrue(a != invoices.predict(MERCHANT_A, inv, makeAddr("someoneElse"), DestinationKind.DIRECT, FEE));
        assertTrue(a != _direct(inv, FEE + 1));
        assertEq(a, _direct(inv, FEE));
    }

    // ------------------------------------------------------------------ rescue authority

    function test_rescueAuthorityInDirectModeIsTheRegisteredWalletItself() public {
        bytes32 inv = invoiceId("RESCUE-D");
        address clone = _direct(inv, FEE);
        MockFiatTokenLike other = MockFiatTokenLike(address(new OtherToken()));
        other.mint(clone, 10e6);
        _settleDirect(inv, FEE);

        // neither the relayer, an attacker nor the vault owner of the same merchant may rescue
        vm.prank(relayer);
        vm.expectRevert(InvoiceDeposit.NotRescueAuthority.selector);
        InvoiceDeposit(clone).rescueToken(IERC20(address(other)), relayer, 10e6);
        vm.prank(merchantAOwner);
        vm.expectRevert(InvoiceDeposit.NotRescueAuthority.selector);
        InvoiceDeposit(clone).rescueToken(IERC20(address(other)), merchantAOwner, 10e6);

        vm.prank(merchantAWallet);
        InvoiceDeposit(clone).rescueToken(IERC20(address(other)), merchantAWallet, 10e6);
        assertEq(other.balanceOf(merchantAWallet), 10e6);

        // and the payment token itself is never rescuable
        usdc.mint(clone, 1e6);
        vm.prank(merchantAWallet);
        vm.expectRevert(InvoiceDeposit.CannotRescueSettlementToken.selector);
        InvoiceDeposit(clone).rescueToken(IERC20(address(usdc)), merchantAWallet, 1e6);
    }

    // ------------------------------------------------------------------ fail-open fee leg

    /// @dev Gas-griefing: sweep() is permissionless, so a caller picks the gas. Whatever gas it picks, a sweep that SUCCEEDS must have
    /// paid the fee (never FeeSkipped while the treasury is healthy): too little gas must make the whole call revert instead.
    function test_callerCannotMakeTheFeeBeSkippedByChoosingGas_fuzz(uint256 gasLimit, uint96 amountRaw) public {
        gasLimit = bound(gasLimit, 20_000, 400_000);
        uint256 amount = bound(amountRaw, 1_000_000, 10_000_000_000_000);
        bytes32 inv = invoiceId("GRIEF");
        address clone = _direct(inv, FEE);
        _settleDirect(inv, FEE); // deploys the clone with nothing to sweep
        usdc.mint(clone, amount);
        uint256 expectedFee = (amount * FEE) / 10_000;
        vm.recordLogs();
        (bool ok,) = clone.call{gas: gasLimit}(abi.encodeCall(InvoiceDeposit.sweep, ()));
        if (ok) {
            assertEq(usdc.balanceOf(treasury), expectedFee, "a successful sweep always pays the fee");
            assertEq(usdc.balanceOf(merchantAWallet), amount - expectedFee);
        } else {
            // out of gas: nothing moved, and a retry with enough gas settles normally
            assertEq(usdc.balanceOf(clone), amount);
            InvoiceDeposit(clone).sweep();
            assertEq(usdc.balanceOf(treasury), expectedFee);
        }
    }

    function test_blacklistedTreasuryDoesNotTrapMerchantFunds() public {
        bytes32 inv = invoiceId("BL-TREASURY");
        address clone = _direct(inv, FEE);
        usdc.mint(clone, 100e6);
        usdc.blacklist(treasury);

        vm.expectEmit(true, false, false, true, clone);
        emit FeeSkipped(inv, FEE, 100e6);
        vm.expectEmit(true, true, true, true, clone);
        emit Swept(inv, MERCHANT_A, merchantAWallet, DestinationKind.DIRECT, address(usdc), 100e6, 0);
        _settleDirect(inv, FEE);

        assertEq(usdc.balanceOf(merchantAWallet), 100e6, "merchant gets the full amount");
        assertEq(usdc.balanceOf(treasury), 0);
        assertEq(usdc.balanceOf(clone), 0);

        // once the treasury is clean again, fees resume for later deposits
        usdc.unBlacklist(treasury);
        usdc.mint(clone, 100e6);
        InvoiceDeposit(clone).sweep();
        assertEq(usdc.balanceOf(treasury), feeOf(100e6, FEE));
    }

    function test_blacklistedDestinationStillReverts() public {
        bytes32 inv = invoiceId("BL-DEST");
        address clone = _direct(inv, FEE);
        usdc.mint(clone, 100e6);
        usdc.blacklist(merchantAWallet);
        vm.expectRevert("Blacklistable: account is blacklisted");
        _settleDirect(inv, FEE);
        assertEq(usdc.balanceOf(clone), 100e6, "funds stay at the address");
        assertEq(usdc.balanceOf(treasury), 0, "the fee is not paid either: the whole sweep rolled back");
    }

    function test_feeLegFailureWorksInVaultMode() public {
        bytes32 inv = invoiceId("BL-VAULT");
        address clone = predictV(MERCHANT_A, inv, address(vaultA));
        usdc.mint(clone, 10e6);
        usdc.blacklist(treasury);
        settleV(MERCHANT_A, inv, address(vaultA));
        assertEq(usdc.balanceOf(address(vaultA)), 10e6);
    }
}

interface MockFiatTokenLike {
    function mint(address to, uint256 amount) external;
    function balanceOf(address a) external view returns (uint256);
}

/// @dev A second, unrelated ERC-20 used as a "wrong token".
contract OtherToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
