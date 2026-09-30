// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test stablecoin (6 decimals) with an open faucet. Only deployed on local/test networks.
contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 10_000 * 1e6;

    constructor() ERC20("USD Coin (Test)", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
