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
///   USDC_ADDRESS        official USDC for the target chain (taken from Circle's list, NOT from this repo's cache)
///   EXPECTED_CHAIN_ID   must equal the RPC's chain id — stops "right key, wrong network" mistakes
///   CONTRACT_VERSION    optional, default 1 (part of every invoice address)
///   ALLOW_MAINNET_DEPLOY=true   required on any production chain id; absent => the script reverts
///
/// Sign with a keystore/hardware wallet, never a private key on the command line:
///   forge script script/Deploy.s.sol --rpc-url $RPC --account deployer --sender $DEPLOYER --broadcast
///
/// Writes ../deployments/raw-<chainId>.json. `pnpm finalize:deployment` then verifies on-chain bytecode and
/// wiring before the network may be enabled. This script never marks a deployment production-approved.
contract Deploy is Script {
    function run() external {
        address usdc = vm.envAddress("USDC_ADDRESS");
        uint256 expectedChainId = vm.envUint("EXPECTED_CHAIN_ID");
        uint16 version = uint16(vm.envOr("CONTRACT_VERSION", uint256(1)));

        require(block.chainid == expectedChainId, "Deploy: RPC chain id != EXPECTED_CHAIN_ID");
        require(usdc.code.length > 0, "Deploy: USDC_ADDRESS has no code on this chain");
        require(IDecimals(usdc).decimals() == 6, "Deploy: token is not 6-decimals USDC");
        if (_isProduction(block.chainid)) {
            require(vm.envOr("ALLOW_MAINNET_DEPLOY", false), "Deploy: production chain requires ALLOW_MAINNET_DEPLOY=true");
        }

        uint256 startBlock = block.number;
        vm.startBroadcast();
        VaultFactory vaults = new VaultFactory(IERC20(usdc));
        InvoiceDeposit implementation = new InvoiceDeposit();
        InvoiceFactory invoices = new InvoiceFactory(address(implementation), IERC20(usdc), vaults, version);
        PaymentRouter router = new PaymentRouter(IFiatToken(usdc), vaults);
        vm.stopBroadcast();

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "version", version);
        vm.serializeAddress(k, "usdc", usdc);
        vm.serializeAddress(k, "vaultFactory", address(vaults));
        vm.serializeAddress(k, "invoiceImplementation", address(implementation));
        vm.serializeAddress(k, "invoiceFactory", address(invoices));
        vm.serializeAddress(k, "paymentRouter", address(router));
        vm.serializeUint(k, "deployBlock", startBlock);
        string memory out = vm.serializeAddress(k, "deployer", msg.sender);
        vm.writeJson(out, string.concat("../deployments/raw-", vm.toString(block.chainid), ".json"));

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
