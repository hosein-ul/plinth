// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Where an invoice's funds are finally sent.
///         VAULT  - the merchant's MerchantVault (registered in VaultFactory).
///         DIRECT - a wallet the merchant registered; no vault is involved.
/// @dev The kind is part of every invoice address (salt and clone args), so the two modes can never
///      collide on one address.
enum DestinationKind {
    VAULT,
    DIRECT
}
