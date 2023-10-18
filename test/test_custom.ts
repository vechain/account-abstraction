import './aa.init'
import { expect } from 'chai'
import {
  ERC20__factory,
  EntryPoint__factory,
  SimpleAccount,
  SimpleAccountFactory,
  SimpleAccount__factory,
} from '../typechain'
import {
  fund,
  createAccount,
  createAccountOwner,
  AddressZero,
  createAddress,
} from './testutils'
import { BigNumber, Wallet } from 'ethers/lib/ethers'
import { ethers } from 'hardhat'
import {
  fillAndSign,
  getUserOpHash
} from './UserOp'
import config from './config'


describe('EntryPoint', function () {
  it("should transfer full approved amount into EntryPoint", async () => {
    const entrypoint = EntryPoint__factory.connect(config.entryPointAddress, ethers.provider.getSigner());
    const accountAdress = "0xd272ec7265f813048F61a3D97613936E6e9dcce7";
    const vtho = ERC20__factory.connect(config.VTHOAddress, ethers.provider.getSigner());
    await vtho.approve(config.entryPointAddress, 7195485000000000);
    await entrypoint.depositAmountTo(accountAdress, 7195485000000000);
    const deposit = await entrypoint.getDepositInfo(accountAdress)
    console.log(deposit)
  })
})
