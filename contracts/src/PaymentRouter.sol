// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IFiatToken} from "./interfaces/IFiatToken.sol";
import {VaultFactory} from "./VaultFactory.sol";
import {DestinationKind} from "./DestinationKind.sol";
import {FeeSplit} from "./lib/FeeSplit.sol";

/// @title PaymentRouter
/// @notice Gasless connected-wallet checkout built on EIP-3009 `receiveWithAuthorization`.
///
/// Circle's `receiveWithAuthorization` only works when `msg.sender == to`. The customer therefore
/// authorises a transfer to THIS router; any relayer submits `pay()`; the router pulls the funds,
/// splits them exactly like `InvoiceDeposit.sweep()` (platform fee to the fixed treasury, the rest to
/// the merchant vault or merchant wallet) in the same transaction and emits the invoice event.
///
/// The EIP-3009 nonce is not random: it is derived from every field of the payment (invoice,
/// merchant, destination, kind, treasury, fee, payer, amount, salt, chain, router). Because the
/// customer's signature covers the nonce, a third party cannot replay the signature with a different
/// invoice id, destination, fee or amount. The router is stateless, holds no funds between
/// transactions and has no admin. The treasury is an immutable, never a caller-supplied value.
contract PaymentRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant NONCE_TAG = keccak256("Plinth.PaymentRouter.v2");

    IFiatToken public immutable TOKEN;
    VaultFactory public immutable VAULTS;
    address public immutable TREASURY;
    uint16 public immutable MAX_FEE_BPS;

    struct Payment {
        address from;
        address destination;
        DestinationKind kind;
        uint16 feeBps;
        bytes32 merchantId;
        bytes32 invoiceId;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 salt; // customer-side randomness so identical payments get distinct nonces
    }

    /// @param amount The whole amount the customer paid. `fee` is what the treasury actually received.
    event InvoicePaid(
        bytes32 indexed invoiceId,
        bytes32 indexed merchantId,
        address indexed destination,
        DestinationKind kind,
        address payer,
        uint256 amount,
        uint256 fee,
        bytes32 nonce
    );

    event FeeSkipped(bytes32 indexed invoiceId, uint16 feeBps, uint256 amount);

    error ZeroAddress();
    error UnknownVault(address vault);
    error InvalidDestination(address destination);
    error FeeTooHigh(uint16 feeBps, uint16 maxFeeBps);
    error ZeroValue();
    error TokenMismatch();
    error UnexpectedBalanceDelta(uint256 expected, uint256 actual);

    constructor(IFiatToken token, VaultFactory vaults, address treasury, uint16 maxFeeBps) {
        if (address(token) == address(0) || address(vaults) == address(0) || treasury == address(0)) {
            revert ZeroAddress();
        }
        if (address(vaults.TOKEN()) != address(token)) revert TokenMismatch();
        if (maxFeeBps > FeeSplit.BPS_DENOMINATOR) revert FeeTooHigh(maxFeeBps, uint16(FeeSplit.BPS_DENOMINATOR));
        TOKEN = token;
        VAULTS = vaults;
        TREASURY = treasury;
        MAX_FEE_BPS = maxFeeBps;
    }

    /// @notice The EIP-3009 nonce the customer must sign for this payment.
    function paymentNonce(Payment calldata p) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                NONCE_TAG,
                block.chainid,
                address(this),
                p.invoiceId,
                p.merchantId,
                p.destination,
                uint8(p.kind),
                TREASURY,
                p.feeBps,
                p.from,
                p.value,
                p.salt
            )
        );
    }

    /// @notice Execute a customer-signed payment. Callable by anyone (typically the relayer).
    function pay(Payment calldata p, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        if (p.value == 0) revert ZeroValue();
        if (p.feeBps > MAX_FEE_BPS) revert FeeTooHigh(p.feeBps, MAX_FEE_BPS);
        if (p.kind == DestinationKind.VAULT) {
            if (!VAULTS.isVault(p.destination)) revert UnknownVault(p.destination);
        } else if (
            p.destination == address(0) || p.destination == address(this) || p.destination == TREASURY
                || p.destination == address(TOKEN) || p.destination == address(VAULTS)
        ) {
            revert InvalidDestination(p.destination);
        }

        bytes32 nonce = paymentNonce(p);
        uint256 balanceBefore = TOKEN.balanceOf(address(this));
        TOKEN.receiveWithAuthorization(p.from, address(this), p.value, p.validAfter, p.validBefore, nonce, v, r, s);
        uint256 received = TOKEN.balanceOf(address(this)) - balanceBefore;
        if (received != p.value) revert UnexpectedBalanceDelta(p.value, received);

        IERC20 token = IERC20(address(TOKEN));
        uint256 fee = FeeSplit.feeOf(received, p.feeBps);
        if (fee != 0 && !FeeSplit.tryTransfer(token, TREASURY, fee)) {
            emit FeeSkipped(p.invoiceId, p.feeBps, received);
            fee = 0;
        }
        token.safeTransfer(p.destination, received - fee);
        emit InvoicePaid(p.invoiceId, p.merchantId, p.destination, p.kind, p.from, received, fee, nonce);
    }
}
