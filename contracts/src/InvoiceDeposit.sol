// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DestinationKind} from "./DestinationKind.sol";
import {FeeSplit} from "./lib/FeeSplit.sol";

/// @title InvoiceDeposit
/// @notice Implementation behind every per-invoice deposit address (ERC-1167 clone with immutable args).
///
/// A customer sends the payment token to the (possibly not yet deployed) clone address. Later the
/// relayer deploys the clone and calls `sweep()`, which splits the whole balance:
///   - a platform fee of `feeBps` to the fixed `TREASURY`, and
///   - the remainder to the committed destination (a merchant vault, or a merchant wallet).
///
/// What is fixed, and where:
///   - implementation immutables (the same for every invoice on this chain and token):
///     TOKEN, CHAIN_ID, VERSION, TREASURY, MAX_FEE_BPS;
///   - clone immutable args (87 bytes, committed in the CREATE2 address):
///     destination (20) | feeBps (2) | kind (1) | merchantId (32) | invoiceId (32).
///
/// Consequences: there is no initializer to front-run, `sweep()` takes no parameters so a caller
/// cannot pick a recipient or a fee, the clone has no owner and no privileged function, and no private
/// key exists for the address. The fee can never exceed MAX_FEE_BPS and cannot change after the address
/// has been shown to a customer.
///
/// The fee leg fails open: if the transfer to the treasury fails, the whole amount goes to the
/// destination and `FeeSkipped` is emitted. If the transfer to the destination fails, the sweep reverts.
contract InvoiceDeposit is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev abi.encodePacked(destination, feeBps, kind, merchantId, invoiceId) = 20 + 2 + 1 + 32 + 32.
    uint256 internal constant ARGS_LENGTH = 87;

    IERC20 public immutable TOKEN;
    uint256 public immutable CHAIN_ID;
    uint16 public immutable VERSION;
    address public immutable TREASURY;
    uint16 public immutable MAX_FEE_BPS;

    struct Config {
        IERC20 token;
        address destination;
        DestinationKind kind;
        uint16 feeBps;
        address treasury;
        uint16 maxFeeBps;
        bytes32 merchantId;
        bytes32 invoiceId;
        uint256 chainId;
        uint16 version;
    }

    /// @param amount The whole swept balance (before the fee). `fee` is what the treasury actually received.
    event Swept(
        bytes32 indexed invoiceId,
        bytes32 indexed merchantId,
        address indexed destination,
        DestinationKind kind,
        address token,
        uint256 amount,
        uint256 fee
    );

    /// @param amount The swept balance whose fee could not be paid.
    event FeeSkipped(bytes32 indexed invoiceId, uint16 feeBps, uint256 amount);

    event TokenRescued(address indexed token, address indexed to, uint256 amount);

    error NotAClone();
    error WrongChain(uint256 expected, uint256 actual);
    error FeeTooHigh(uint16 feeBps, uint16 maxFeeBps);
    error CannotRescueSettlementToken();
    error NotRescueAuthority();
    error ZeroAddress();

    constructor(IERC20 token, address treasury, uint16 maxFeeBps, uint16 version) {
        if (address(token) == address(0) || treasury == address(0)) revert ZeroAddress();
        if (maxFeeBps > FeeSplit.BPS_DENOMINATOR) revert FeeTooHigh(maxFeeBps, uint16(FeeSplit.BPS_DENOMINATOR));
        TOKEN = token;
        CHAIN_ID = block.chainid;
        VERSION = version;
        TREASURY = treasury;
        MAX_FEE_BPS = maxFeeBps;
    }

    /// @notice Split the entire token balance between the treasury fee and the destination.
    ///         Safe to call repeatedly by anyone; takes no parameters.
    /// @return amount The balance that was swept (0 if it was empty).
    function sweep() external nonReentrant returns (uint256 amount) {
        Config memory c = config();
        if (block.chainid != c.chainId) revert WrongChain(c.chainId, block.chainid);
        if (c.feeBps > c.maxFeeBps) revert FeeTooHigh(c.feeBps, c.maxFeeBps);

        amount = TOKEN.balanceOf(address(this));
        if (amount == 0) return 0;

        uint256 fee = FeeSplit.feeOf(amount, c.feeBps);
        if (fee != 0 && !FeeSplit.tryTransfer(TOKEN, TREASURY, fee)) {
            emit FeeSkipped(c.invoiceId, c.feeBps, amount);
            fee = 0;
        }
        TOKEN.safeTransfer(c.destination, amount - fee);
        emit Swept(c.invoiceId, c.merchantId, c.destination, c.kind, address(TOKEN), amount, fee);
    }

    /// @notice Recover a NON-settlement token sent to this address by mistake. It can never touch
    ///         the settlement token, and the gateway has no role here.
    ///         VAULT kind: only the vault's current owner. DIRECT kind: only the registered wallet itself.
    function rescueToken(IERC20 other, address to, uint256 amount) external nonReentrant {
        Config memory c = config();
        if (other == TOKEN) revert CannotRescueSettlementToken();
        address authority = c.kind == DestinationKind.VAULT ? Ownable(c.destination).owner() : c.destination;
        if (msg.sender != authority) revert NotRescueAuthority();
        if (to == address(0)) revert ZeroAddress();
        other.safeTransfer(to, amount);
        emit TokenRescued(address(other), to, amount);
    }

    /// @notice The immutable configuration this address was derived from.
    function config() public view returns (Config memory c) {
        bytes memory args = Clones.fetchCloneArgs(address(this));
        if (args.length != ARGS_LENGTH) revert NotAClone();
        address destination;
        uint256 feeBps;
        uint256 kind;
        bytes32 merchantId;
        bytes32 invoiceId;
        assembly ("memory-safe") {
            let p := add(args, 32)
            destination := shr(96, mload(p))
            feeBps := shr(240, mload(add(p, 20)))
            kind := shr(248, mload(add(p, 22)))
            merchantId := mload(add(p, 23))
            invoiceId := mload(add(p, 55))
        }
        if (kind > uint256(type(DestinationKind).max)) revert NotAClone();
        c = Config({
            token: TOKEN,
            destination: destination,
            kind: DestinationKind(kind),
            feeBps: uint16(feeBps),
            treasury: TREASURY,
            maxFeeBps: MAX_FEE_BPS,
            merchantId: merchantId,
            invoiceId: invoiceId,
            chainId: CHAIN_ID,
            version: VERSION
        });
    }
}
