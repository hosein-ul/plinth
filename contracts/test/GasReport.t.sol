// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Fixture} from "./Base.t.sol";
import {InvoiceDeposit} from "../src/InvoiceDeposit.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";
import {DestinationKind} from "../src/DestinationKind.sol";

/// @dev Single-call gas figures for the hot paths, measured with every touched account and slot cold
///      (`vm.cool`) and the destination and treasury already holding a balance (steady state). Not an
///      assertion suite: run with `forge test --match-contract GasReport -vv` and read the log lines.
///      The same three scenarios were measured on the v1 contracts (no fee) for the before/after table in docs.
contract GasReport is Fixture {
    uint256 internal customerKey = 0xC0FFEE;

    function _coolAll(address clone, address dest) internal {
        vm.cool(address(usdc));
        vm.cool(dest);
        vm.cool(treasury);
        vm.cool(address(invoices));
        vm.cool(address(impl));
        vm.cool(address(router));
        vm.cool(clone);
    }

    function _steady(address dest) internal {
        usdc.mint(dest, 1);
        usdc.mint(treasury, 1);
    }

    function test_gas_v2_deployAndSweep_vault() public {
        bytes32 inv = invoiceId("G1");
        address clone = predictV(MERCHANT_A, inv, address(vaultA));
        _steady(address(vaultA));
        usdc.mint(clone, 100e6);
        _coolAll(clone, address(vaultA));
        uint256 g = gasleft();
        settleV(MERCHANT_A, inv, address(vaultA));
        g -= gasleft();
        emit log_named_uint("v2 deployAndSweep VAULT  (deploy + sweep)", g);
    }

    function test_gas_v2_deployAndSweep_direct() public {
        bytes32 inv = invoiceId("G1d");
        address clone = invoices.predict(MERCHANT_A, inv, merchantAWallet, DestinationKind.DIRECT, FEE);
        _steady(merchantAWallet);
        usdc.mint(clone, 100e6);
        _coolAll(clone, merchantAWallet);
        uint256 g = gasleft();
        invoices.deployAndSweep(MERCHANT_A, inv, merchantAWallet, DestinationKind.DIRECT, FEE);
        g -= gasleft();
        emit log_named_uint("v2 deployAndSweep DIRECT (deploy + sweep)", g);
    }

    function test_gas_v2_deployAndSweep_firstEverFee() public {
        // the very first fee a treasury receives writes a zero slot: a one-off cost
        bytes32 inv = invoiceId("G1f");
        address clone = predictV(MERCHANT_A, inv, address(vaultA));
        usdc.mint(address(vaultA), 1);
        usdc.mint(clone, 100e6);
        _coolAll(clone, address(vaultA));
        uint256 g = gasleft();
        settleV(MERCHANT_A, inv, address(vaultA));
        g -= gasleft();
        emit log_named_uint("v2 deployAndSweep VAULT, treasury balance was zero", g);
    }

    function test_gas_v2_repeatSweep_vault() public {
        bytes32 inv = invoiceId("G2");
        address clone = predictV(MERCHANT_A, inv, address(vaultA));
        _steady(address(vaultA));
        settleV(MERCHANT_A, inv, address(vaultA));
        usdc.mint(clone, 100e6);
        _coolAll(clone, address(vaultA));
        uint256 g = gasleft();
        InvoiceDeposit(clone).sweep();
        g -= gasleft();
        emit log_named_uint("v2 sweep() on deployed clone VAULT", g);
    }

    function test_gas_v2_routerPay_vault() public {
        _routerPay(DestinationKind.VAULT, address(vaultA), "v2 router.pay VAULT");
    }

    function test_gas_v2_routerPay_direct() public {
        _routerPay(DestinationKind.DIRECT, merchantAWallet, "v2 router.pay DIRECT");
    }

    function _routerPay(DestinationKind kind, address dest, string memory label) internal {
        address customer = vm.addr(customerKey);
        usdc.mint(customer, 1_000e6);
        _steady(dest);
        vm.warp(1_700_000_000);
        PaymentRouter.Payment memory p = PaymentRouter.Payment({
            from: customer,
            destination: dest,
            kind: kind,
            feeBps: FEE,
            merchantId: MERCHANT_A,
            invoiceId: invoiceId("G3"),
            value: 100e6,
            validAfter: block.timestamp - 1,
            validBefore: block.timestamp + 1 hours,
            salt: keccak256("s")
        });
        bytes32 nonce = router.paymentNonce(p);
        bytes32 sh = keccak256(
            abi.encode(
                usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), p.from, address(router), p.value, p.validAfter, p.validBefore, nonce
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(customerKey, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), sh)));
        _coolAll(address(0), dest);
        uint256 g = gasleft();
        router.pay(p, v, r, s);
        g -= gasleft();
        emit log_named_uint(label, g);
    }
}
