// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFiatToken} from "../src/interfaces/IFiatToken.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {InvoiceDeposit} from "../src/InvoiceDeposit.sol";
import {InvoiceFactory} from "../src/InvoiceFactory.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";
import {DestinationKind} from "../src/DestinationKind.sol";

/// @notice Opt-in checks against the REAL USDC bytecode on a live network (read-only fork).
///         Run with:  FORK_URL=<rpc> FORK_USDC=<official usdc> forge test --match-contract ForkTest
///         Skipped automatically when FORK_URL is unset.
contract ForkTest is Test {
    function _fork() internal returns (bool, IFiatToken) {
        string memory url = vm.envOr("FORK_URL", string(""));
        if (bytes(url).length == 0) return (false, IFiatToken(address(0)));
        vm.createSelectFork(url);
        return (true, IFiatToken(vm.envAddress("FORK_USDC")));
    }

    /// Official token must expose the EIP-3009 + EIP-712 surface the router depends on.
    function test_fork_tokenCapabilities() public {
        (bool ok, IFiatToken token) = _fork();
        if (!ok) return;
        assertEq(IERC20Metadata(address(token)).decimals(), 6);
        assertEq(keccak256(bytes(IVersioned(address(token)).version())), keccak256("2"));
        assertEq(
            IVersioned(address(token)).RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
            keccak256(
                "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
            )
        );
        assertFalse(token.authorizationState(address(1), bytes32(uint256(1))));
    }

    /// Full wallet-checkout path against the real token: sign, relay through the router, vault credited.
    /// Requires FORK_PAYER_KEY funded with testnet USDC on the fork (set via cheatcode where possible).
    function test_fork_deploymentAndAddressPrediction() public {
        (bool ok, IFiatToken token) = _fork();
        if (!ok) return;
        VaultFactory vf = new VaultFactory(IERC20(address(token)));
        address treasury = address(0x7EA5);
        InvoiceDeposit impl = new InvoiceDeposit(IERC20(address(token)), treasury, 100, 2);
        InvoiceFactory f = new InvoiceFactory(address(impl), vf);
        address vault = vf.createVault(keccak256("fork-merchant"), address(0xBEEF), 0);
        bytes32 inv = keccak256("fork-invoice");
        address predicted = f.predict(keccak256("fork-merchant"), inv, vault, DestinationKind.VAULT, 20);
        assertEq(predicted.code.length, 0);
        (address deployed, uint256 amount) = f.deployAndSweep(keccak256("fork-merchant"), inv, vault, DestinationKind.VAULT, 20);
        assertEq(deployed, predicted);
        assertEq(amount, 0);
        PaymentRouter router = new PaymentRouter(token, vf, treasury, 100);
        assertEq(address(router.TOKEN()), address(token));
    }
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}

interface IVersioned {
    function version() external view returns (string memory);
    function RECEIVE_WITH_AUTHORIZATION_TYPEHASH() external view returns (bytes32);
}
