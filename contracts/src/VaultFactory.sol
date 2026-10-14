// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {MerchantVault} from "./MerchantVault.sol";

/// @title VaultFactory
/// @notice Deterministically deploys MerchantVaults and keeps the registry of genuine vaults.
/// @dev Permissionless and admin-free. The vault address commits to (merchantId, owner, configDelay),
///      so nobody can squat a merchant's vault address with a different owner.
contract VaultFactory {
    IERC20 public immutable TOKEN;

    mapping(address vault => bool) public isVault;

    event VaultCreated(bytes32 indexed merchantId, address indexed owner, address indexed vault, uint64 configDelay);

    error ZeroAddress();

    constructor(IERC20 token) {
        if (address(token) == address(0)) revert ZeroAddress();
        TOKEN = token;
    }

    /// @notice Deploy the merchant's vault, or return it if it already exists (idempotent).
    function createVault(bytes32 merchantId, address owner, uint64 configDelay) external returns (address vault) {
        vault = predictVault(merchantId, owner, configDelay);
        if (vault.code.length == 0) {
            MerchantVault deployed =
                new MerchantVault{salt: _salt(merchantId, owner, configDelay)}(TOKEN, merchantId, owner, configDelay);
            assert(address(deployed) == vault);
            isVault[vault] = true;
            emit VaultCreated(merchantId, owner, vault, configDelay);
        }
    }

    function predictVault(bytes32 merchantId, address owner, uint64 configDelay) public view returns (address) {
        bytes memory initCode =
            abi.encodePacked(type(MerchantVault).creationCode, abi.encode(TOKEN, merchantId, owner, configDelay));
        return Create2.computeAddress(_salt(merchantId, owner, configDelay), keccak256(initCode), address(this));
    }

    function _salt(bytes32 merchantId, address owner, uint64 configDelay) private pure returns (bytes32) {
        return keccak256(abi.encode(merchantId, owner, configDelay));
    }
}
