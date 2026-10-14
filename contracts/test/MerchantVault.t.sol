// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Fixture} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerchantVault} from "../src/MerchantVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MockFiatToken} from "./mocks/MockFiatToken.sol";

contract MerchantVaultTest is Fixture {
    address internal payout = makeAddr("payout");

    function _fund(uint256 amt) internal {
        usdc.mint(address(vaultA), amt);
    }

    function _sched(MerchantVault.Mode mode, address dest, uint128 th, uint64 iv) internal {
        vm.prank(merchantAOwner);
        vaultA.scheduleSettlement(MerchantVault.Settlement(mode, dest, th, iv));
    }

    // ------------------------------------------------------------------ authority

    function test_defaultIsBalanceInVault() public view {
        MerchantVault.Settlement memory s = vaultA.settlement();
        assertEq(uint8(s.mode), uint8(MerchantVault.Mode.BALANCE_IN_VAULT));
        assertEq(vaultA.owner(), merchantAOwner);
        assertEq(vaultA.CONFIG_DELAY(), DELAY);
    }

    function test_onlyOwnerCanWithdraw() public {
        _fund(100e6);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        vaultA.withdraw(relayer, 100e6);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        vaultA.withdraw(attacker, 1);

        vm.prank(merchantAOwner);
        vaultA.withdraw(payout, 40e6);
        assertEq(usdc.balanceOf(payout), 40e6);
        assertEq(usdc.balanceOf(address(vaultA)), 60e6);
    }

    function test_onlyOwnerCanSetPolicy() public {
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, relayer));
        vaultA.scheduleSettlement(MerchantVault.Settlement(MerchantVault.Mode.INSTANT_FORWARD, relayer, 0, 0));
    }

    function test_ownerCannotRenounce() public {
        vm.prank(merchantAOwner);
        vm.expectRevert(MerchantVault.RenounceDisabled.selector);
        vaultA.renounceOwnership();
    }

    function test_twoStepOwnershipTransfer() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(merchantAOwner);
        vaultA.transferOwnership(newOwner);
        assertEq(vaultA.owner(), merchantAOwner, "not yet transferred");
        vm.prank(attacker);
        vm.expectRevert();
        vaultA.acceptOwnership();
        vm.prank(newOwner);
        vaultA.acceptOwnership();
        assertEq(vaultA.owner(), newOwner);
    }

    function test_noOperatorRoleExists() public {
        // The vault exposes no function a non-owner can use to move funds anywhere.
        _fund(10e6);
        vm.startPrank(relayer);
        vm.expectRevert(MerchantVault.NotForwardable.selector);
        vaultA.forward();
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(vaultA)), 10e6);
    }

    // ------------------------------------------------------------------ settlement policies

    function test_instantForwardRespectsDelay() public {
        _sched(MerchantVault.Mode.INSTANT_FORWARD, payout, 0, 0);
        // Still BALANCE_IN_VAULT until the delay passes.
        _fund(10e6);
        vm.expectRevert(MerchantVault.NotForwardable.selector);
        vaultA.forward();

        vm.expectRevert(abi.encodeWithSelector(MerchantVault.NotYetEffective.selector, uint64(block.timestamp + DELAY)));
        vaultA.applyPendingSettlement();

        skip(DELAY);
        vaultA.applyPendingSettlement(); // anyone may apply
        vm.prank(relayer);
        uint256 sent = vaultA.forward();
        assertEq(sent, 10e6);
        assertEq(usdc.balanceOf(payout), 10e6);
        assertEq(usdc.balanceOf(relayer), 0, "relayer receives nothing");
    }

    function test_ownerCanCancelPendingRedirect() public {
        _sched(MerchantVault.Mode.INSTANT_FORWARD, attacker, 0, 0); // e.g. compromised key
        vm.prank(merchantAOwner);
        vaultA.cancelPendingSettlement();
        skip(DELAY);
        vm.expectRevert(MerchantVault.NothingPending.selector);
        vaultA.applyPendingSettlement();
    }

    function test_returningToBalanceModeIsImmediateAndClearsDestination() public {
        _sched(MerchantVault.Mode.INSTANT_FORWARD, payout, 0, 0);
        skip(DELAY);
        vaultA.applyPendingSettlement();

        _sched(MerchantVault.Mode.BALANCE_IN_VAULT, address(0), 0, 0);
        MerchantVault.Settlement memory s = vaultA.settlement();
        assertEq(uint8(s.mode), uint8(MerchantVault.Mode.BALANCE_IN_VAULT));
        assertEq(s.destination, address(0));
        _fund(1e6);
        vm.expectRevert(MerchantVault.NotForwardable.selector);
        vaultA.forward();
    }

    function test_thresholdPolicy() public {
        _sched(MerchantVault.Mode.THRESHOLD_OR_PERIODIC, payout, 100e6, 0);
        skip(DELAY);
        vaultA.applyPendingSettlement();

        _fund(60e6);
        vm.expectRevert(MerchantVault.NotForwardable.selector);
        vaultA.forward();
        _fund(40e6);
        assertEq(vaultA.forward(), 100e6);
        assertEq(usdc.balanceOf(payout), 100e6);
    }

    function test_periodicPolicy() public {
        _sched(MerchantVault.Mode.THRESHOLD_OR_PERIODIC, payout, 0, 7 days);
        skip(DELAY);
        vaultA.applyPendingSettlement();
        skip(7 days);

        _fund(5e6);
        assertEq(vaultA.forward(), 5e6);
        _fund(5e6);
        vm.expectRevert(MerchantVault.NotForwardable.selector); // interval not elapsed again
        vaultA.forward();
        skip(7 days);
        (bool ok,) = vaultA.canForward();
        assertTrue(ok);
        assertEq(vaultA.forward(), 5e6);
    }

    function test_invalidPolicies() public {
        vm.startPrank(merchantAOwner);
        vm.expectRevert(MerchantVault.InvalidDestination.selector);
        vaultA.scheduleSettlement(MerchantVault.Settlement(MerchantVault.Mode.INSTANT_FORWARD, address(0), 0, 0));
        vm.expectRevert(MerchantVault.InvalidDestination.selector);
        vaultA.scheduleSettlement(MerchantVault.Settlement(MerchantVault.Mode.INSTANT_FORWARD, address(vaultA), 0, 0));
        vm.expectRevert(MerchantVault.InvalidDestination.selector);
        vaultA.scheduleSettlement(MerchantVault.Settlement(MerchantVault.Mode.INSTANT_FORWARD, address(usdc), 0, 0));
        vm.expectRevert(MerchantVault.InvalidPolicy.selector);
        vaultA.scheduleSettlement(MerchantVault.Settlement(MerchantVault.Mode.THRESHOLD_OR_PERIODIC, payout, 0, 0));
        vm.stopPrank();
    }

    function test_forwardEmptyBalanceReverts() public {
        _sched(MerchantVault.Mode.INSTANT_FORWARD, payout, 0, 0);
        skip(DELAY);
        vaultA.applyPendingSettlement();
        vm.expectRevert(MerchantVault.NotForwardable.selector);
        vaultA.forward();
    }

    // ------------------------------------------------------------------ rescue

    function test_rescueOtherTokenOnlyOwnerAndNeverUsdc() public {
        MockFiatToken other = new MockFiatToken();
        other.mint(address(vaultA), 3e6);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        vaultA.rescueToken(IERC20(address(other)), attacker, 3e6);

        vm.startPrank(merchantAOwner);
        vm.expectRevert(MerchantVault.CannotRescueSettlementToken.selector);
        vaultA.rescueToken(IERC20(address(usdc)), merchantAOwner, 1);
        vaultA.rescueToken(IERC20(address(other)), merchantAOwner, 3e6);
        vm.stopPrank();
        assertEq(other.balanceOf(merchantAOwner), 3e6);
    }

    // ------------------------------------------------------------------ factory

    function test_vaultFactoryDeterministicAndIdempotent() public {
        address predicted = vaults.predictVault(MERCHANT_A, merchantAOwner, DELAY);
        assertEq(predicted, address(vaultA));
        assertTrue(vaults.isVault(predicted));
        assertEq(vaults.createVault(MERCHANT_A, merchantAOwner, DELAY), predicted, "idempotent");
    }

    function test_vaultAddressCommitsToOwnerSoItCannotBeSquatted() public {
        address squat = vaults.createVault(MERCHANT_A, attacker, DELAY);
        assertTrue(squat != address(vaultA));
        assertEq(MerchantVault(squat).owner(), attacker);
        assertEq(vaultA.owner(), merchantAOwner);
        assertTrue(vaults.predictVault(MERCHANT_A, merchantAOwner, 0) != address(vaultA), "delay is committed too");
    }

    function test_vaultFactoryRejectsZeroOwner() public {
        vm.expectRevert();
        vaults.createVault(MERCHANT_A, address(0), 0);
    }
}
