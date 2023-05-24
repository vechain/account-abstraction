// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.12;

import "../interfaces/IStakeManager.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/* solhint-disable avoid-low-level-calls */
/* solhint-disable not-rely-on-time */
/**
 * manage deposits and stakes.
 * deposit is just a balance used to pay for UserOperations (either by a paymaster or an account)
 * stake is value locked for at least "unstakeDelay" by a paymaster.
 */
abstract contract StakeManager is IStakeManager {

    address tokenAddress = 0x0000000000000000000000000000456E65726779;
    IERC20 tokenContract = IERC20(tokenAddress);
    string revertReason = "should only send VTHO to EntryPoint";

    /// maps paymaster to their deposits and stakes
    mapping(address => DepositInfo) public deposits;

    /// @inheritdoc IStakeManager
    function getDepositInfo(address account) public view returns (DepositInfo memory info) {
        return deposits[account];
    }

    // internal method to return just the stake info
    function _getStakeInfo(address addr) internal view returns (StakeInfo memory info) {
        DepositInfo storage depositInfo = deposits[addr];
        info.stake = depositInfo.stake;
        info.unstakeDelaySec = depositInfo.unstakeDelaySec;
    }

    /// return the deposit (for gas payment) of the account
    function balanceOf(address account) public view returns (uint256) {
        return deposits[account].deposit;
    }

    function _getMaxAllowedTokens() private view returns (uint256) {
        uint256 allowance = tokenContract.allowance(msg.sender, address(this));
        return allowance;
    }

    receive() external payable {
        require(false, "Should only send VTHO to the EntryPoint");
    }

    function receiveVTHO(uint256 receiveAmount) external returns(bool){
        uint256 allowance = _getMaxAllowedTokens();
        require(allowance >= receiveAmount, "Cannot receive more than allowance");

        bool success = tokenContract.transferFrom(msg.sender, address(this), allowance);
        require(success, "Token transfer failed");

        uint256 vthoEquivalent = allowance; //some VET <-> VTHO convertion needs to happen here
        depositVTHOTo(msg.sender, vthoEquivalent);

        return success;
    }

    function depositVTHOTo(address account, uint256 amount) public {
        _incrementDeposit(account, amount);
        DepositInfo storage info = deposits[account];
        emit Deposited(account, info.deposit);
    }

    function _incrementDeposit(address account, uint256 amount) internal {
        DepositInfo storage info = deposits[account];
        uint256 newAmount = info.deposit + amount;
        require(newAmount <= type(uint112).max, "deposit overflow");
        info.deposit = uint112(newAmount);
    }

    /**
     * add to the deposit of the given account
     */
    function depositTo(address account) public payable {
        require(false, revertReason);
    }

    /**
     * add to the account's stake - amount and delay
     * any pending unstake is first cancelled.
     * @param unstakeDelaySec the new lock duration before the deposit can be withdrawn.
     */
    function addStake(uint32 unstakeDelaySec) public payable{
        require(false, revertReason);
    }

        /**
     * add to the account's stake - amount and delay
     * any pending unstake is first cancelled.
     * @param unstakeDelaySec the new lock duration before the deposit can be withdrawn.
     */
    function addVTHOStake(uint32 unstakeDelaySec, uint256 amount) public {
        DepositInfo storage info = deposits[msg.sender];
        require(unstakeDelaySec > 0, "must specify unstake delay");
        require(unstakeDelaySec >= info.unstakeDelaySec, "cannot decrease unstake time");
        uint256 stake = info.stake + amount;
        require(stake > 0, "no stake specified");
        require(stake <= type(uint112).max, "stake overflow");

        bool success = tokenContract.transferFrom(msg.sender, address(this), amount);
        require(success, "did not approve the amount passed as argument");

        deposits[msg.sender] = DepositInfo(
            info.deposit,
            true,
            uint112(stake),
            unstakeDelaySec,
            0
        );
        emit StakeLocked(msg.sender, stake, unstakeDelaySec);
    }

    /**
     * attempt to unlock the stake.
     * the value can be withdrawn (using withdrawStake) after the unstake delay.
     */
    function unlockStake() external {
        DepositInfo storage info = deposits[msg.sender];
        require(info.unstakeDelaySec != 0, "not staked");
        require(info.staked, "already unstaking");
        uint48 withdrawTime = uint48(block.timestamp) + info.unstakeDelaySec;
        info.withdrawTime = withdrawTime;
        info.staked = false;
        emit StakeUnlocked(msg.sender, withdrawTime);
    }


    /**
     * withdraw from the (unlocked) stake.
     * must first call unlockStake and wait for the unstakeDelay to pass
     * @param withdrawAddress the address to send withdrawn value.
     */
    function withdrawStake(address payable withdrawAddress) external {
        DepositInfo storage info = deposits[msg.sender];
        uint256 stake = info.stake;
        require(stake > 0, "No stake to withdraw");
        require(info.withdrawTime > 0, "must call unlockStake() first");
        require(info.withdrawTime <= block.timestamp, "Stake withdrawal is not due");
        info.unstakeDelaySec = 0;
        info.withdrawTime = 0;
        info.stake = 0;
        emit StakeWithdrawn(msg.sender, withdrawAddress, stake);

        bool success = tokenContract.transfer(msg.sender, stake);
        require(success, "failed to withdraw stake");
    }

    /**
     * withdraw from the deposit.
     * @param withdrawAddress the address to send withdrawn value.
     * @param withdrawAmount the amount to withdraw.
     */
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external {
        DepositInfo storage info = deposits[msg.sender];
        require(withdrawAmount <= info.deposit, "Withdraw amount too large");
        info.deposit = uint112(info.deposit - withdrawAmount);
        emit Withdrawn(msg.sender, withdrawAddress, withdrawAmount);

        bool success = tokenContract.transfer(msg.sender, withdrawAmount);
        require(success, "failed to withdraw stake");
    }
}
