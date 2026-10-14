// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Fixture} from "./Base.t.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PaymentRouterTest is Fixture {
    uint256 internal customerKey = 0xC0FFEE;
    address internal customer;

    event InvoicePaid(
        bytes32 indexed invoiceId, bytes32 indexed merchantId, address indexed vault, address payer, uint256 amount, bytes32 nonce
    );

    function setUp() public override {
        super.setUp();
        customer = vm.addr(customerKey);
        usdc.mint(customer, 1_000e6);
        vm.warp(1_700_000_000);
    }

    function _payment(string memory inv, uint256 value) internal view returns (PaymentRouter.Payment memory p) {
        p = PaymentRouter.Payment({
            from: customer,
            vault: address(vaultA),
            merchantId: MERCHANT_A,
            invoiceId: invoiceId(inv),
            value: value,
            validAfter: block.timestamp - 1,
            validBefore: block.timestamp + 1 hours,
            salt: keccak256("salt-1")
        });
    }

    /// Sign exactly what a wallet would sign over the token's EIP-712 domain.
    function _sign(PaymentRouter.Payment memory p, uint256 key, address to)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 nonce = router.paymentNonce(p);
        bytes32 structHash = keccak256(
            abi.encode(
                usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), p.from, to, p.value, p.validAfter, p.validBefore, nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(key, digest);
    }

    function test_gaslessWalletPaymentReachesVault() public {
        PaymentRouter.Payment memory p = _payment("INV-W1", 250e6);
        (uint8 v, bytes32 r, bytes32 s) = _sign(p, customerKey, address(router));

        vm.expectEmit(true, true, true, true, address(router));
        emit InvoicePaid(p.invoiceId, MERCHANT_A, address(vaultA), customer, 250e6, router.paymentNonce(p));
        vm.prank(relayer); // relayer pays gas, the customer holds no native token operations
        router.pay(p, v, r, s);

        assertEq(usdc.balanceOf(address(vaultA)), 250e6);
        assertEq(usdc.balanceOf(customer), 750e6);
        assertEq(usdc.balanceOf(address(router)), 0, "router never retains funds");
        assertTrue(usdc.authorizationState(customer, router.paymentNonce(p)));
    }

    function test_replayFails() public {
        PaymentRouter.Payment memory p = _payment("INV-W2", 10e6);
        (uint8 v, bytes32 r, bytes32 s) = _sign(p, customerKey, address(router));
        router.pay(p, v, r, s);
        vm.expectRevert("FiatTokenV2: authorization is used or canceled");
        router.pay(p, v, r, s);
    }

    function test_expiredAndNotYetValid() public {
        PaymentRouter.Payment memory p = _payment("INV-W3", 10e6);
        (uint8 v, bytes32 r, bytes32 s) = _sign(p, customerKey, address(router));
        skip(2 hours);
        vm.expectRevert("FiatTokenV2: authorization is expired");
        router.pay(p, v, r, s);

        vm.warp(1_700_000_000);
        PaymentRouter.Payment memory q = _payment("INV-W3b", 10e6);
        q.validAfter = block.timestamp + 10 minutes;
        (v, r, s) = _sign(q, customerKey, address(router));
        vm.expectRevert("FiatTokenV2: authorization is not yet valid");
        router.pay(q, v, r, s);
    }

    function test_wrongSignerRejected() public {
        PaymentRouter.Payment memory p = _payment("INV-W4", 10e6);
        (uint8 v, bytes32 r, bytes32 s) = _sign(p, 0xBAD, address(router));
        vm.expectRevert("FiatTokenV2: invalid signature");
        router.pay(p, v, r, s);
    }

    function test_tamperedFieldsInvalidateSignature() public {
        PaymentRouter.Payment memory p = _payment("INV-W5", 100e6);
        (uint8 v, bytes32 r, bytes32 s) = _sign(p, customerKey, address(router));

        PaymentRouter.Payment memory t = _payment("INV-W5", 100e6);
        t.invoiceId = invoiceId("OTHER-INVOICE"); // misattribute to another invoice
        vm.expectRevert("FiatTokenV2: invalid signature");
        router.pay(t, v, r, s);

        t = _payment("INV-W5", 100e6);
        t.value = 200e6;
        vm.expectRevert("FiatTokenV2: invalid signature");
        router.pay(t, v, r, s);

        t = _payment("INV-W5", 100e6);
        t.vault = address(vaultB); // redirect to a different (registered) vault
        vm.expectRevert("FiatTokenV2: invalid signature");
        router.pay(t, v, r, s);

        t = _payment("INV-W5", 100e6);
        t.merchantId = MERCHANT_B;
        vm.expectRevert("FiatTokenV2: invalid signature");
        router.pay(t, v, r, s);
    }

    function test_frontRunnerCannotChangeOutcome() public {
        PaymentRouter.Payment memory p = _payment("INV-W6", 75e6);
        (uint8 v, bytes32 r, bytes32 s) = _sign(p, customerKey, address(router));
        vm.prank(attacker); // attacker submits the exact same parameters first
        router.pay(p, v, r, s);
        assertEq(usdc.balanceOf(address(vaultA)), 75e6);
        assertEq(usdc.balanceOf(attacker), 0);
    }

    function test_relayerCannotCallTokenDirectly() public {
        // This is why the router exists: the token demands caller == payee, so a relayer can never
        // submit a signature that names the router as payee, nor redirect it to itself.
        PaymentRouter.Payment memory p = _payment("INV-W7", 10e6);
        bytes32 nonce = router.paymentNonce(p);
        (uint8 v, bytes32 r, bytes32 s) = _sign(p, customerKey, address(router));

        vm.prank(relayer);
        vm.expectRevert("FiatTokenV2: caller must be the payee");
        usdc.receiveWithAuthorization(customer, address(router), 10e6, p.validAfter, p.validBefore, nonce, v, r, s);

        vm.prank(relayer);
        vm.expectRevert("FiatTokenV2: invalid signature");
        usdc.receiveWithAuthorization(customer, relayer, 10e6, p.validAfter, p.validBefore, nonce, v, r, s);
    }

    function test_unregisteredVaultAndZeroValueRejected() public {
        PaymentRouter.Payment memory p = _payment("INV-W8", 10e6);
        p.vault = attacker;
        (uint8 v, bytes32 r, bytes32 s) = _sign(p, customerKey, address(router));
        vm.expectRevert(abi.encodeWithSelector(PaymentRouter.UnknownVault.selector, attacker));
        router.pay(p, v, r, s);

        p = _payment("INV-W8", 0);
        vm.expectRevert(PaymentRouter.ZeroValue.selector);
        router.pay(p, 27, bytes32(0), bytes32(0));
    }

    function test_samePayerCanPayTwiceWithDistinctSalts() public {
        PaymentRouter.Payment memory p = _payment("INV-W9", 10e6);
        (uint8 v, bytes32 r, bytes32 s) = _sign(p, customerKey, address(router));
        router.pay(p, v, r, s);

        PaymentRouter.Payment memory p2 = _payment("INV-W9", 10e6);
        p2.salt = keccak256("salt-2");
        (v, r, s) = _sign(p2, customerKey, address(router));
        router.pay(p2, v, r, s);
        assertEq(usdc.balanceOf(address(vaultA)), 20e6);
    }

    function test_nonceBindsChainAndRouter() public {
        PaymentRouter.Payment memory p = _payment("INV-W10", 10e6);
        bytes32 n1 = router.paymentNonce(p);
        PaymentRouter other = new PaymentRouter(router.TOKEN(), vaults);
        assertTrue(other.paymentNonce(p) != n1, "router address bound");
        vm.chainId(4242);
        assertTrue(router.paymentNonce(p) != n1, "chain id bound");
    }
}
