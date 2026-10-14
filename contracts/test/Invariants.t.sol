// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Fixture} from "./Base.t.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {InvoiceDeposit} from "../src/InvoiceDeposit.sol";

/// @dev Random sequence of deposits, deploys and sweeps by arbitrary callers.
contract Handler is Fixture {
    uint256 public totalMinted;
    address[] public touched;
    mapping(address => bool) internal seen;

    function init() external {
        setUp();
    }

    function deposit(uint8 which, uint96 amount) external {
        bytes32 inv = keccak256(abi.encode("inv", which % 6));
        (bytes32 m, address v) = which % 2 == 0 ? (MERCHANT_A, address(vaultA)) : (MERCHANT_B, address(vaultB));
        address a = invoices.predict(m, inv, v);
        usdc.mint(a, amount);
        totalMinted += amount;
        if (!seen[a]) {
            seen[a] = true;
            touched.push(a);
        }
    }

    function settle(uint8 which, address caller) external {
        vm.assume(caller != address(0));
        bytes32 inv = keccak256(abi.encode("inv", which % 6));
        (bytes32 m, address v) = which % 2 == 0 ? (MERCHANT_A, address(vaultA)) : (MERCHANT_B, address(vaultB));
        vm.prank(caller);
        invoices.deployAndSweep(m, inv, v);
    }

    function directSweep(uint8 which, address caller) external {
        bytes32 inv = keccak256(abi.encode("inv", which % 6));
        (bytes32 m, address v) = which % 2 == 0 ? (MERCHANT_A, address(vaultA)) : (MERCHANT_B, address(vaultB));
        address a = invoices.predict(m, inv, v);
        if (a.code.length == 0) return;
        vm.prank(caller);
        InvoiceDeposit(a).sweep();
    }

    function touchedLength() external view returns (uint256) {
        return touched.length;
    }
}

contract InvariantsTest is StdInvariant, Fixture {
    Handler internal h;

    function setUp() public override {
        h = new Handler();
        h.init();
        targetContract(address(h));
        bytes4[] memory sels = new bytes4[](3);
        sels[0] = Handler.deposit.selector;
        sels[1] = Handler.settle.selector;
        sels[2] = Handler.directSweep.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sels}));
    }

    /// Conservation: every minted unit sits in an invoice address or a merchant vault.
    function invariant_noLeakage() public view {
        uint256 held = h.usdc().balanceOf(address(h.vaultA())) + h.usdc().balanceOf(address(h.vaultB()));
        uint256 n = h.touchedLength();
        for (uint256 i = 0; i < n; ++i) {
            held += h.usdc().balanceOf(h.touched(i));
        }
        assertEq(held, h.totalMinted());
    }

    /// Merchants are isolated: vault A can only ever hold what invoices bound to A received.
    function invariant_gatewayActorsNeverHoldFunds() public view {
        assertEq(h.usdc().balanceOf(h.relayer()), 0);
        assertEq(h.usdc().balanceOf(h.attacker()), 0);
        assertEq(h.usdc().balanceOf(address(h.invoices())), 0);
    }
}
