// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/* solhint-disable reason-string */
/* solhint-disable no-inline-assembly */

import "../core/BasePaymaster.sol";
// import "../interfaces/IPaymaster.sol";

contract MyPaymaster is IPaymaster {
    IEntryPoint immutable public entryPoint;
    address tokenAddress = 0x0000000000000000000000000000456E65726779;
    IERC20 tokenContract = IERC20(tokenAddress);

    constructor(IEntryPoint _entryPoint) payable {
        entryPoint = _entryPoint;
    }

    function validatePaymasterUserOp(UserOperation calldata /*userOp*/, bytes32 /*userOpHash*/, uint256 /*maxCost*/)
    external override returns (bytes memory context, uint256 validationData) {
        context = "0x";
        validationData = 0;
    }
    
    function postOp(PostOpMode /*mode*/, bytes calldata /*context*/, uint256 /*actualGasCost*/) external override {
    }

    // function deposit() public payable {
        // Reverts because this is what we implemented
    //     entryPoint.depositTo{value : msg.value}(address(this));
    // }

    function fundWithVTHO(uint256 amount) public {
        // Aprove first
        bool success = tokenContract.approve(address(entryPoint), amount);
        require(success, "Token transfer failed");

        // EntryPoint actually transfers the funds to itself
        entryPoint.receiveVTHO(amount);
    }
}