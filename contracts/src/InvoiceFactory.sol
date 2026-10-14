// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {VaultFactory} from "./VaultFactory.sol";
import {InvoiceDeposit} from "./InvoiceDeposit.sol";
import {DestinationKind} from "./DestinationKind.sol";

/// @title InvoiceFactory
/// @notice Computes counterfactual invoice deposit addresses and, when funds arrive, deploys the
///         clone and sweeps it in a single transaction.
/// @dev Permissionless and admin-free. Everything that determines an invoice address is either an
///      immutable of the implementation/factory (token, chain id, version, treasury, fee cap,
///      implementation, vault registry) or a call argument that is hashed into the CREATE2 salt AND
///      baked into the clone's immutable args (merchantId, invoiceId, destination, kind, feeBps).
///      Changing any of them changes the address, so a caller can only ever sweep the exact
///      configuration a deposit address was derived from.
///      Token, chain id, version, treasury and fee cap are read from the implementation, so the
///      factory cannot be wired to a mismatching implementation.
contract InvoiceFactory {
    address public immutable IMPLEMENTATION;
    IERC20 public immutable TOKEN;
    VaultFactory public immutable VAULTS;
    uint16 public immutable VERSION;
    uint256 public immutable CHAIN_ID;
    address public immutable TREASURY;
    uint16 public immutable MAX_FEE_BPS;

    struct Item {
        bytes32 merchantId;
        bytes32 invoiceId;
        address destination;
        DestinationKind kind;
        uint16 feeBps;
    }

    event InvoiceDeployed(
        bytes32 indexed invoiceId,
        bytes32 indexed merchantId,
        address indexed destination,
        address invoice,
        DestinationKind kind,
        uint16 feeBps
    );

    error ZeroAddress();
    error NoImplementationCode();
    error UnknownVault(address vault);
    error InvalidDestination(address destination);
    error FeeTooHigh(uint16 feeBps, uint16 maxFeeBps);
    error WrongChain(uint256 expected, uint256 actual);
    error ImplementationMismatch();

    constructor(address implementation, VaultFactory vaults) {
        if (implementation == address(0) || address(vaults) == address(0)) revert ZeroAddress();
        // A clone of an address with no code would silently accept calls that do nothing.
        if (implementation.code.length == 0) revert NoImplementationCode();
        InvoiceDeposit impl = InvoiceDeposit(implementation);
        if (impl.CHAIN_ID() != block.chainid || address(vaults.TOKEN()) != address(impl.TOKEN())) {
            revert ImplementationMismatch();
        }
        IMPLEMENTATION = implementation;
        TOKEN = impl.TOKEN();
        VAULTS = vaults;
        VERSION = impl.VERSION();
        CHAIN_ID = block.chainid;
        TREASURY = impl.TREASURY();
        MAX_FEE_BPS = impl.MAX_FEE_BPS();
    }

    /// @notice The deposit address for an invoice, computable before the clone exists.
    function predict(bytes32 merchantId, bytes32 invoiceId, address destination, DestinationKind kind, uint16 feeBps)
        public
        view
        returns (address)
    {
        return Clones.predictDeterministicAddressWithImmutableArgs(
            IMPLEMENTATION,
            _args(merchantId, invoiceId, destination, kind, feeBps),
            _salt(merchantId, invoiceId, destination, kind, feeBps),
            address(this)
        );
    }

    /// @notice Deploy the invoice clone if needed, then sweep its token balance (fee to the treasury,
    ///         remainder to the destination).
    /// @dev Idempotent: later calls skip deployment and only sweep newly arrived funds.
    function deployAndSweep(bytes32 merchantId, bytes32 invoiceId, address destination, DestinationKind kind, uint16 feeBps)
        public
        returns (address invoice, uint256 amount)
    {
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh(feeBps, MAX_FEE_BPS);
        if (block.chainid != CHAIN_ID) revert WrongChain(CHAIN_ID, block.chainid);
        if (IMPLEMENTATION.code.length == 0) revert NoImplementationCode();

        invoice = predict(merchantId, invoiceId, destination, kind, feeBps);
        if (kind == DestinationKind.VAULT) {
            if (!VAULTS.isVault(destination)) revert UnknownVault(destination);
        } else if (
            destination == address(0) || destination == invoice || destination == TREASURY
                || destination == address(TOKEN) || destination == IMPLEMENTATION || destination == address(this)
        ) {
            revert InvalidDestination(destination);
        }

        if (invoice.code.length == 0) {
            address deployed = Clones.cloneDeterministicWithImmutableArgs(
                IMPLEMENTATION,
                _args(merchantId, invoiceId, destination, kind, feeBps),
                _salt(merchantId, invoiceId, destination, kind, feeBps)
            );
            assert(deployed == invoice);
            emit InvoiceDeployed(invoiceId, merchantId, destination, invoice, kind, feeBps);
        }
        amount = InvoiceDeposit(invoice).sweep();
    }

    /// @notice Settle several invoices in one transaction. A failing item does not block the rest.
    function deployAndSweepBatch(Item[] calldata items) external returns (bool[] memory ok) {
        ok = new bool[](items.length);
        for (uint256 i = 0; i < items.length; ++i) {
            try this.deployAndSweep(
                items[i].merchantId, items[i].invoiceId, items[i].destination, items[i].kind, items[i].feeBps
            ) {
                ok[i] = true;
            } catch {}
        }
    }

    function _args(bytes32 merchantId, bytes32 invoiceId, address destination, DestinationKind kind, uint16 feeBps)
        private
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(destination, feeBps, uint8(kind), merchantId, invoiceId);
    }

    function _salt(bytes32 merchantId, bytes32 invoiceId, address destination, DestinationKind kind, uint16 feeBps)
        private
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(merchantId, invoiceId, destination, uint8(kind), feeBps, TOKEN, TREASURY, CHAIN_ID, VERSION)
        );
    }
}
