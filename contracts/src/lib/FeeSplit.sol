// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Platform fee arithmetic and the fail-open fee transfer shared by InvoiceDeposit and PaymentRouter.
library FeeSplit {
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    /// @dev floor(amount * feeBps / 10_000), in the payment token's own units.
    function feeOf(uint256 amount, uint16 feeBps) internal pure returns (uint256) {
        return (amount * feeBps) / BPS_DENOMINATOR;
    }

    /// @notice Transfer `amount` of `token` to `to` WITHOUT reverting when the transfer fails
    ///         (for example because `to` is blacklisted by the token issuer).
    /// @dev Returns false on any failure. A failed call changes no state, so the caller can then send
    ///      the whole balance to the merchant. If a misbehaving token moved funds yet reported failure,
    ///      the caller's following transfer of the full amount reverts for lack of balance and the whole
    ///      transaction rolls back, so funds can never be paid twice. Only 32 bytes of return data are
    ///      read, so a hostile token cannot burn gas through a huge return payload.
    function tryTransfer(IERC20 token, address to, uint256 amount) internal returns (bool) {
        bytes memory data = abi.encodeCall(IERC20.transfer, (to, amount));
        bool ok;
        uint256 size;
        uint256 value;
        assembly ("memory-safe") {
            ok := call(gas(), token, 0, add(data, 32), mload(data), 0x00, 0x20)
            size := returndatasize()
            value := mload(0x00)
        }
        if (!ok) return false;
        if (size == 0) return address(token).code.length > 0; // tokens that return nothing
        return size == 32 && value == 1;
    }
}
