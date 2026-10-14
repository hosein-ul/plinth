// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title InvoiceDeposit
/// @notice Implementation behind every per-invoice deposit address (ERC-1167 clone with immutable args).
///
/// A customer sends USDC to the (possibly not yet deployed) clone address. Later the relayer
/// deploys the clone and calls `sweep()`, which moves the whole USDC balance to the merchant's
/// vault. The destination and token are read from the clone's immutable args, so:
///   - there is no initializer to front-run,
///   - the caller supplies no parameters, so it cannot choose a recipient,
///   - the clone has no owner and no privileged function,
///   - no private key exists for the address and it never needs native gas.
contract InvoiceDeposit is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev abi.encode(token, vault, merchantId, invoiceId, chainId, version) = 6 words.
    uint256 internal constant ARGS_LENGTH = 192;

    event Swept(
        bytes32 indexed invoiceId, bytes32 indexed merchantId, address indexed vault, address token, uint256 amount
    );

    event TokenRescued(address indexed token, address indexed to, uint256 amount);

    error NotAClone();
    error WrongChain(uint256 expected, uint256 actual);
    error CannotRescueSettlementToken();
    error NotVaultOwner();
    error ZeroAddress();

    /// @notice Move the entire USDC balance to the merchant vault. Safe to call repeatedly by anyone.
    /// @return amount The amount swept (0 if the balance was empty).
    function sweep() external nonReentrant returns (uint256 amount) {
        (IERC20 token, address vault, bytes32 merchantId, bytes32 invoiceId, uint256 chainId,) = config();
        if (block.chainid != chainId) revert WrongChain(chainId, block.chainid);
        amount = token.balanceOf(address(this));
        if (amount == 0) return 0;
        token.safeTransfer(vault, amount);
        emit Swept(invoiceId, merchantId, vault, address(token), amount);
    }

    /// @notice Recover a NON-settlement token sent to this address by mistake. Only the merchant
    ///         vault's current owner may call it, and it can never touch the settlement token.
    ///         The gateway has no role here.
    function rescueToken(IERC20 other, address to, uint256 amount) external nonReentrant {
        (IERC20 token, address vault,,,,) = config();
        if (other == token) revert CannotRescueSettlementToken();
        if (msg.sender != Ownable(vault).owner()) revert NotVaultOwner();
        if (to == address(0)) revert ZeroAddress();
        other.safeTransfer(to, amount);
        emit TokenRescued(address(other), to, amount);
    }

    /// @notice The immutable configuration this address was derived from.
    function config()
        public
        view
        returns (IERC20 token, address vault, bytes32 merchantId, bytes32 invoiceId, uint256 chainId, uint16 version)
    {
        bytes memory args = Clones.fetchCloneArgs(address(this));
        if (args.length != ARGS_LENGTH) revert NotAClone();
        (token, vault, merchantId, invoiceId, chainId, version) =
            abi.decode(args, (IERC20, address, bytes32, bytes32, uint256, uint16));
    }
}
