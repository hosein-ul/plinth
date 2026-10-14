// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MerchantVault
/// @notice Non-upgradeable settlement vault for ONE merchant on ONE chain.
///
/// Trust model
/// -----------
/// - `owner` (the merchant) is the only account that can withdraw, change the settlement
///   policy or rotate ownership. There is NO gateway/admin/operator role in this contract.
/// - Anyone (including the gateway relayer) may call `forward()` and `applyPendingSettlement()`;
///   neither lets the caller choose a recipient. `forward()` can only pay the destination the
///   owner configured, and only after that configuration became effective.
/// - Policy changes that can send funds out automatically (any mode other than BALANCE_IN_VAULT)
///   become effective only after `CONFIG_DELAY`, giving the merchant time to react to a
///   compromised owner key. Moving back to BALANCE_IN_VAULT is always immediate.
/// - No proxy, no delegatecall, no selfdestruct, no upgrade path.
contract MerchantVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Mode {
        BALANCE_IN_VAULT,
        INSTANT_FORWARD,
        THRESHOLD_OR_PERIODIC
    }

    struct Settlement {
        Mode mode;
        address destination; // payout address previously authorised by the owner
        uint128 threshold; // forward when balance >= threshold (0 disables)
        uint64 interval; // forward when interval elapsed since lastForwardAt (0 disables)
    }

    struct Pending {
        Settlement settlement;
        uint64 effectiveAt; // 0 = nothing pending
    }

    IERC20 public immutable TOKEN;
    bytes32 public immutable MERCHANT_ID;
    uint64 public immutable CONFIG_DELAY;

    Settlement private _settlement;
    Pending private _pending;
    uint64 public lastForwardAt;

    event SettlementScheduled(Mode mode, address destination, uint128 threshold, uint64 interval, uint64 effectiveAt);
    event SettlementApplied(Mode mode, address destination, uint128 threshold, uint64 interval);
    event SettlementCancelled();
    event Forwarded(address indexed destination, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event TokenRescued(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error InvalidDestination();
    error InvalidPolicy();
    error NothingPending();
    error NotYetEffective(uint64 effectiveAt);
    error NotForwardable();
    error CannotRescueSettlementToken();
    error RenounceDisabled();

    constructor(IERC20 token, bytes32 merchantId, address owner_, uint64 configDelay) Ownable(owner_) {
        if (address(token) == address(0)) revert ZeroAddress();
        TOKEN = token;
        MERCHANT_ID = merchantId;
        CONFIG_DELAY = configDelay;
    }

    // ------------------------------------------------------------------ owner actions

    /// @notice Withdraw settled USDC to any address chosen by the owner.
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        TOKEN.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    /// @notice Recover tokens other than the settlement token that were sent here by mistake.
    function rescueToken(IERC20 token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == TOKEN) revert CannotRescueSettlementToken();
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
        emit TokenRescued(address(token), to, amount);
    }

    /// @notice Propose a new settlement policy. Safe policies apply instantly; any policy that
    ///         can send funds out automatically waits `CONFIG_DELAY`.
    function scheduleSettlement(Settlement calldata s) external onlyOwner {
        _validate(s);
        if (s.mode == Mode.BALANCE_IN_VAULT || CONFIG_DELAY == 0) {
            delete _pending;
            _apply(s);
            return;
        }
        uint64 effectiveAt = uint64(block.timestamp) + CONFIG_DELAY;
        _pending = Pending({settlement: s, effectiveAt: effectiveAt});
        emit SettlementScheduled(s.mode, s.destination, s.threshold, s.interval, effectiveAt);
    }

    function cancelPendingSettlement() external onlyOwner {
        if (_pending.effectiveAt == 0) revert NothingPending();
        delete _pending;
        emit SettlementCancelled();
    }

    /// @dev Renouncing would orphan the vault's funds, so it is disabled.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    // ------------------------------------------------------------------ permissionless

    /// @notice Activate a pending policy once its delay elapsed. Callable by anyone.
    function applyPendingSettlement() external {
        Pending memory p = _pending;
        if (p.effectiveAt == 0) revert NothingPending();
        if (block.timestamp < p.effectiveAt) revert NotYetEffective(p.effectiveAt);
        delete _pending;
        _apply(p.settlement);
    }

    /// @notice Pay the vault balance to the owner-authorised destination when the policy allows.
    ///         Callable by anyone; the caller cannot influence recipient or amount.
    function forward() external nonReentrant returns (uint256 amount) {
        (bool ok, uint256 bal) = _canForward();
        if (!ok) revert NotForwardable();
        address destination = _settlement.destination;
        lastForwardAt = uint64(block.timestamp);
        amount = bal;
        TOKEN.safeTransfer(destination, amount);
        emit Forwarded(destination, amount);
    }

    // ------------------------------------------------------------------ views

    function settlement() external view returns (Settlement memory) {
        return _settlement;
    }

    function pendingSettlement() external view returns (Pending memory) {
        return _pending;
    }

    function balance() external view returns (uint256) {
        return TOKEN.balanceOf(address(this));
    }

    function canForward() external view returns (bool ok, uint256 amount) {
        return _canForward();
    }

    // ------------------------------------------------------------------ internals

    function _canForward() internal view returns (bool, uint256) {
        Settlement memory s = _settlement;
        if (s.mode == Mode.BALANCE_IN_VAULT) return (false, 0);
        uint256 bal = TOKEN.balanceOf(address(this));
        if (bal == 0) return (false, 0);
        if (s.mode == Mode.INSTANT_FORWARD) return (true, bal);
        bool byThreshold = s.threshold != 0 && bal >= s.threshold;
        bool byInterval = s.interval != 0 && block.timestamp >= uint256(lastForwardAt) + s.interval;
        return (byThreshold || byInterval, bal);
    }

    function _validate(Settlement calldata s) internal view {
        if (s.mode == Mode.BALANCE_IN_VAULT) return;
        if (s.destination == address(0) || s.destination == address(this) || s.destination == address(TOKEN)) {
            revert InvalidDestination();
        }
        if (s.mode == Mode.THRESHOLD_OR_PERIODIC && s.threshold == 0 && s.interval == 0) revert InvalidPolicy();
    }

    function _apply(Settlement memory s) internal {
        if (s.mode == Mode.BALANCE_IN_VAULT) {
            // Clear the destination so a stale payout address cannot linger in storage.
            s.destination = address(0);
            s.threshold = 0;
            s.interval = 0;
        }
        _settlement = s;
        emit SettlementApplied(s.mode, s.destination, s.threshold, s.interval);
    }
}
