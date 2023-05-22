// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MyToken is ERC20 {
    constructor(address owner) ERC20("My Token", "MTKN") {
        _mint(owner, 1000000 * (10**uint256(decimals())));
    }
}
