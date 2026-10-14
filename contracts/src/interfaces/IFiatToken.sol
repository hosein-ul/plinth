// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice The slice of Circle's FiatTokenV2 (EIP-3009) surface used by the gateway.
/// @dev `receiveWithAuthorization` requires `msg.sender == to`, which is why wallet
///      checkout goes through PaymentRouter instead of letting a relayer call the token.
interface IFiatToken is IERC20 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}
