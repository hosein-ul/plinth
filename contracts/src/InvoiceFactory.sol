// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {VaultFactory} from "./VaultFactory.sol";
import {InvoiceDeposit} from "./InvoiceDeposit.sol";

/// @title InvoiceFactory
/// @notice Computes counterfactual invoice deposit addresses and, when funds arrive, deploys the
///         clone and sweeps it in a single transaction.
/// @dev Permissionless and admin-free. Everything that determines an invoice address is either an
///      immutable of this factory (token, chain id, version, implementation, vault registry) or a
///      call argument that is hashed into the CREATE2 salt AND baked into the clone's immutable args
///      (merchantId, invoiceId, vault). Changing any of them changes the address.
contract InvoiceFactory {
    address public immutable IMPLEMENTATION;
    IERC20 public immutable TOKEN;
    VaultFactory public immutable VAULTS;
    uint16 public immutable VERSION;
    uint256 public immutable CHAIN_ID;

    struct Item {
        bytes32 merchantId;
        bytes32 invoiceId;
        address vault;
    }

    event InvoiceDeployed(bytes32 indexed invoiceId, bytes32 indexed merchantId, address indexed vault, address invoice);

    error ZeroAddress();
    error NoImplementationCode();
    error UnknownVault(address vault);
    error WrongChain(uint256 expected, uint256 actual);

    constructor(address implementation, IERC20 token, VaultFactory vaults, uint16 version) {
        if (implementation == address(0) || address(token) == address(0) || address(vaults) == address(0)) {
            revert ZeroAddress();
        }
        // A clone of an address with no code would silently accept calls that do nothing.
        if (implementation.code.length == 0) revert NoImplementationCode();
        IMPLEMENTATION = implementation;
        TOKEN = token;
        VAULTS = vaults;
        VERSION = version;
        CHAIN_ID = block.chainid;
    }

    /// @notice The deposit address for an invoice, computable before the clone exists.
    function predict(bytes32 merchantId, bytes32 invoiceId, address vault) public view returns (address) {
        return Clones.predictDeterministicAddressWithImmutableArgs(
            IMPLEMENTATION, _args(merchantId, invoiceId, vault), _salt(merchantId, invoiceId, vault), address(this)
        );
    }

    /// @notice Deploy the invoice clone if needed, then sweep its USDC balance to the vault.
    /// @dev Idempotent: later calls skip deployment and only sweep newly arrived funds.
    function deployAndSweep(bytes32 merchantId, bytes32 invoiceId, address vault)
        public
        returns (address invoice, uint256 amount)
    {
        if (!VAULTS.isVault(vault)) revert UnknownVault(vault);
        if (block.chainid != CHAIN_ID) revert WrongChain(CHAIN_ID, block.chainid);
        if (IMPLEMENTATION.code.length == 0) revert NoImplementationCode();

        invoice = predict(merchantId, invoiceId, vault);
        if (invoice.code.length == 0) {
            address deployed = Clones.cloneDeterministicWithImmutableArgs(
                IMPLEMENTATION, _args(merchantId, invoiceId, vault), _salt(merchantId, invoiceId, vault)
            );
            assert(deployed == invoice);
            emit InvoiceDeployed(invoiceId, merchantId, vault, invoice);
        }
        amount = InvoiceDeposit(invoice).sweep();
    }

    /// @notice Settle several invoices in one transaction. A failing item does not block the rest.
    function deployAndSweepBatch(Item[] calldata items) external returns (bool[] memory ok) {
        ok = new bool[](items.length);
        for (uint256 i = 0; i < items.length; ++i) {
            try this.deployAndSweep(items[i].merchantId, items[i].invoiceId, items[i].vault) {
                ok[i] = true;
            } catch {}
        }
    }

    function _args(bytes32 merchantId, bytes32 invoiceId, address vault) private view returns (bytes memory) {
        return abi.encode(TOKEN, vault, merchantId, invoiceId, CHAIN_ID, VERSION);
    }

    function _salt(bytes32 merchantId, bytes32 invoiceId, address vault) private view returns (bytes32) {
        return keccak256(abi.encode(merchantId, invoiceId, vault, TOKEN, CHAIN_ID, VERSION));
    }
}
