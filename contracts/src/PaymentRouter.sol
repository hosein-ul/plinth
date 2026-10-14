// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IFiatToken} from "./interfaces/IFiatToken.sol";
import {VaultFactory} from "./VaultFactory.sol";

/// @title PaymentRouter
/// @notice Gasless connected-wallet checkout built on EIP-3009 `receiveWithAuthorization`.
///
/// Circle's `receiveWithAuthorization` only works when `msg.sender == to`. The customer therefore
/// authorises a transfer to THIS router; any relayer submits `pay()`; the router pulls the funds and
/// forwards them to the merchant vault in the same transaction and emits the invoice event.
///
/// The EIP-3009 nonce is not random: it is derived from every field of the payment (invoice,
/// merchant, vault, payer, amount, salt, chain, router). Because the customer's signature covers the
/// nonce, a third party cannot replay the signature with a different invoice id, vault or amount.
/// The router is stateless, holds no funds between transactions and has no admin.
contract PaymentRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant NONCE_TAG = keccak256("Plinth.PaymentRouter.v1");

    IFiatToken public immutable TOKEN;
    VaultFactory public immutable VAULTS;

    struct Payment {
        address from;
        address vault;
        bytes32 merchantId;
        bytes32 invoiceId;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 salt; // customer-side randomness so identical payments get distinct nonces
    }

    event InvoicePaid(
        bytes32 indexed invoiceId,
        bytes32 indexed merchantId,
        address indexed vault,
        address payer,
        uint256 amount,
        bytes32 nonce
    );

    error ZeroAddress();
    error UnknownVault(address vault);
    error ZeroValue();
    error UnexpectedBalanceDelta(uint256 expected, uint256 actual);

    constructor(IFiatToken token, VaultFactory vaults) {
        if (address(token) == address(0) || address(vaults) == address(0)) revert ZeroAddress();
        TOKEN = token;
        VAULTS = vaults;
    }

    /// @notice The EIP-3009 nonce the customer must sign for this payment.
    function paymentNonce(Payment calldata p) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                NONCE_TAG, block.chainid, address(this), p.invoiceId, p.merchantId, p.vault, p.from, p.value, p.salt
            )
        );
    }

    /// @notice Execute a customer-signed USDC payment. Callable by anyone (typically the relayer).
    function pay(Payment calldata p, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        if (p.value == 0) revert ZeroValue();
        if (!VAULTS.isVault(p.vault)) revert UnknownVault(p.vault);

        bytes32 nonce = paymentNonce(p);
        uint256 balanceBefore = TOKEN.balanceOf(address(this));
        TOKEN.receiveWithAuthorization(p.from, address(this), p.value, p.validAfter, p.validBefore, nonce, v, r, s);
        uint256 received = TOKEN.balanceOf(address(this)) - balanceBefore;
        if (received != p.value) revert UnexpectedBalanceDelta(p.value, received);

        IERC20(address(TOKEN)).safeTransfer(p.vault, received);
        emit InvoicePaid(p.invoiceId, p.merchantId, p.vault, p.from, received, nonce);
    }
}
