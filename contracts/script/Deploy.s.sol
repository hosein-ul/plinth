// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {InvoiceDeposit} from "../src/InvoiceDeposit.sol";
import {InvoiceFactory} from "../src/InvoiceFactory.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";
import {IFiatToken} from "../src/interfaces/IFiatToken.sol";

interface IDecimals {
    function decimals() external view returns (uint8);
}

/// @notice Deploys the Plinth contract set to ONE network.
///
///   TOKEN_SYMBOL        USDC (default) or another payment token the registry lists for this chain (EURC on Arc). One run
///                       deploys the whole contract set for ONE token; run it once per token.
///   TOKEN_ADDRESS       the token's official address on the target chain (from the issuer's or the chain's own docs, NOT
///                       from this repo's cache). USDC_ADDRESS is accepted for USDC.
///   EXPECTED_CHAIN_ID   must equal the RPC's chain id — stops "right key, wrong network" mistakes
///   TREASURY            platform fee recipient for this chain (immutable in the implementation). Rotating it later
///                       means deploying a new implementation version, which only affects NEW invoices.
///   MAX_FEE_BPS         optional, default 100 (1%): the immutable cap on any invoice's fee
///   CONTRACT_VERSION    optional, default 2 (part of every invoice address)
///   ALLOW_MAINNET_DEPLOY=true   required on any production chain id; absent => the script reverts
///
/// Sign with a keystore/hardware wallet, never a private key on the command line:
///   forge script script/Deploy.s.sol --rpc-url $RPC --account deployer --sender $DEPLOYER --broadcast
///
/// Writes ../deployments/raw-<chainId>.json. `pnpm finalize:deployment` then verifies on-chain bytecode and
/// wiring before the network may be enabled. This script never marks a deployment production-approved.
contract Deploy is Script {
    function run() external {
        string memory symbol = vm.envOr("TOKEN_SYMBOL", string("USDC"));
        address usdc = vm.envOr("TOKEN_ADDRESS", vm.envOr("USDC_ADDRESS", address(0)));
        require(usdc != address(0), "Deploy: set TOKEN_ADDRESS (or USDC_ADDRESS for USDC)");
        uint256 expectedChainId = vm.envUint("EXPECTED_CHAIN_ID");
        address treasury = vm.envAddress("TREASURY");
        uint16 maxFeeBps = uint16(vm.envOr("MAX_FEE_BPS", uint256(100)));
        uint16 version = uint16(vm.envOr("CONTRACT_VERSION", uint256(2)));

        require(block.chainid == expectedChainId, "Deploy: RPC chain id != EXPECTED_CHAIN_ID");
        require(usdc.code.length > 0, "Deploy: the token address has no code on this chain");
        require(IDecimals(usdc).decimals() == 6, "Deploy: token is not a 6-decimals token");
        require(treasury != address(0), "Deploy: TREASURY is the zero address");
        require(maxFeeBps <= 1000, "Deploy: MAX_FEE_BPS above 10% is not allowed by this script");
        if (treasury.code.length > 0) {
            // The treasury is assumed to be a plain EOA. A contract is allowed (it may be a multisig) but must be a deliberate choice.
            console2.log("WARNING: TREASURY has code on this chain. It is assumed to be an EOA; confirm it can receive USDC.");
        }
        if (_isProduction(block.chainid)) {
            require(vm.envOr("ALLOW_MAINNET_DEPLOY", false), "Deploy: production chain requires ALLOW_MAINNET_DEPLOY=true");
        }

        uint256 startBlock = block.number;
        vm.startBroadcast();
        VaultFactory vaults = new VaultFactory(IERC20(usdc));
        InvoiceDeposit implementation = new InvoiceDeposit(IERC20(usdc), treasury, maxFeeBps, version);
        InvoiceFactory invoices = new InvoiceFactory(address(implementation), vaults);
        PaymentRouter router = new PaymentRouter(IFiatToken(usdc), vaults, treasury, maxFeeBps);
        vm.stopBroadcast();

        _record(symbol, usdc, treasury, maxFeeBps, version, startBlock, vaults, implementation, invoices, router);
    }

    /// Writes the raw deployment record and prints the addresses. Kept out of `run` to stay within the stack limit.
    function _record(
        string memory symbol,
        address token,
        address treasury,
        uint16 maxFeeBps,
        uint16 version,
        uint256 startBlock,
        VaultFactory vaults,
        InvoiceDeposit implementation,
        InvoiceFactory invoices,
        PaymentRouter router
    ) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "version", version);
        vm.serializeString(k, "tokenSymbol", symbol);
        vm.serializeAddress(k, "usdc", token);
        vm.serializeAddress(k, "token", token);
        vm.serializeAddress(k, "treasury", treasury);
        vm.serializeUint(k, "maxFeeBps", maxFeeBps);
        vm.serializeBool(k, "treasuryHasCode", treasury.code.length > 0);
        vm.serializeAddress(k, "vaultFactory", address(vaults));
        vm.serializeAddress(k, "invoiceImplementation", address(implementation));
        vm.serializeAddress(k, "invoiceFactory", address(invoices));
        vm.serializeAddress(k, "paymentRouter", address(router));
        vm.serializeUint(k, "deployBlock", startBlock);
        string memory out = vm.serializeAddress(k, "deployer", msg.sender);
        // USDC keeps the original file name; every other token gets its own raw file.
        bool isUsdc = keccak256(bytes(symbol)) == keccak256(bytes("USDC"));
        string memory file = isUsdc
            ? string.concat("../deployments/raw-", vm.toString(block.chainid), ".json")
            : string.concat("../deployments/raw-", vm.toString(block.chainid), "-", symbol, ".json");
        vm.writeJson(out, file);

        console2.log("Token                ", symbol);
        console2.log("VaultFactory         ", address(vaults));
        console2.log("InvoiceDeposit (impl)", address(implementation));
        console2.log("InvoiceFactory       ", address(invoices));
        console2.log("PaymentRouter        ", address(router));
    }

    /// Chain ids that hold real value. Extend when adding a mainnet to the registry.
    function _isProduction(uint256 id) internal pure returns (bool) {
        return id == 1 || id == 10 || id == 137 || id == 5042 || id == 8453 || id == 42161;
    }
}
