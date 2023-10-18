import { BigNumber, Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import {
  ERC1967Proxy__factory,
  EntryPoint__factory,
  SimpleAccount,
  EntryPoint,
  SimpleAccountFactory,
  SimpleAccountFactory__factory,
  SimpleAccount__factory,
  TestCounter,
  TestCounter__factory,
  TestUtil,
  TestUtil__factory,
  ERC20__factory,
} from '../typechain'
import {
  createAccount,
  createAddress,
  createAccountOwner,
  getBalance,
  isDeployed,
  ONE_ETH,
  HashZero,
  fund
} from './testutils'
import { fillUserOpDefaults, getUserOpHash, packUserOp, signUserOp } from './UserOp'
import { parseEther } from 'ethers/lib/utils'
import { UserOperation } from './UserOperation'
import config from './config'
// const EntryPoint = artifacts.require('EntryPoint');
// const SimpleAccountFactory = artifacts.require('SimpleAccountFactory');
const SimpleAccountT = artifacts.require('SimpleAccount');


const ONE_HUNDERD_VTHO = "100000000000000000000"

describe('SimpleAccount', function () {
  let entryPoint: string
  let accounts: string[]
  let testUtil: TestUtil
  let accountOwner: Wallet
  const ethersSigner = ethers.provider.getSigner()

  before(async function () {
    entryPoint = await EntryPoint__factory.connect(config.simpleAccountFactoryAddress, ethers.provider.getSigner()).address;
    accounts = await ethers.provider.listAccounts()
    // ignore in geth.. this is just a sanity test. should be refactored to use a single-account mode..
    if (accounts.length < 2) this.skip()
    testUtil = await TestUtil__factory.connect(config.testUtilAddress, ethersSigner);
    accountOwner = createAccountOwner()
  })

  it('owner should be able to call transfer', async () => {
    const { proxy: account } = await createAccount(ethers.provider.getSigner(), accounts[0])
    await ethersSigner.sendTransaction({ from: accounts[0], to: account.address, value: parseEther('2') })
    await account.execute(accounts[2], ONE_ETH, '0x')
  })
  it('other account should not be able to call transfer', async () => {
    const { proxy: account } = await createAccount(ethers.provider.getSigner(), accounts[0])
    await expect(account.connect(ethers.provider.getSigner(1)).execute(accounts[2], ONE_ETH, '0x'))
      .to.be.revertedWith('account: not Owner or EntryPoint')
  })

  it('should pack in js the same as solidity', async () => {
    const op = await fillUserOpDefaults({ sender: accounts[0] })
    const packed = packUserOp(op)
    const actual = await testUtil.packUserOp(op);
    expect(actual).to.equal(packed)
  })

  describe('#executeBatch', () => {
    let account: SimpleAccount
    let counter: TestCounter
    before(async () => {
      ({ proxy: account } = await createAccount(ethersSigner, await ethersSigner.getAddress()))
      counter = await new TestCounter__factory(ethersSigner).deploy()
    })

    it('should allow zero value array', async () => {
      const rcpt = await account.executeBatch(
        [counter.address, counter.address],
        [0, 0],
      ).then(async t => await t.wait())
        expect(rcpt)
    })

    it('should allow transfer value', async () => {
      const target = createAddress()
    
      // Fund SimpleAccount with 2 VET
      await ethersSigner.sendTransaction({ from: accounts[0], to: account.address, value: parseEther('2') })

      const rcpt = await account.execute(target,ONE_ETH,"0x00").then(async t => await t.wait())
      let actualBalance = await ethers.provider.getBalance(target);
      expect(actualBalance.toString()).to.not.eql("0")
    })

    it('should fail with wrong array length', async () => {
      const counterJustEmit = await counter.populateTransaction.justemit().then(tx => tx.data!)
      await expect(account.executeBatch([counter.address, counter.address], [0], [counterJustEmit, counterJustEmit]))
        .to.be.reverted
    })
  })

  describe('#validateUserOp', () => {
    let account: SimpleAccount
    let userOp: UserOperation
    let userOpHash: string
    let preBalance: number
    let expectedPay: number
    let simpleAccountFactory: SimpleAccountFactory

    const actualGasPrice = 1e9
    // for testing directly validateUserOp, we initialize the account with EOA as entryPoint.
    let entryPointEoa: string

    // before(async () => {
    // //   entryPointEoa = accounts[2];
    // //   const epAsSigner = await ethers.getSigner(entryPointEoa);

    //   // cant use "SimpleAccountFactory", since it attempts to increment nonce first
    // //   const implementation = await new SimpleAccount__factory(ethersSigner).deploy(entryPointEoa)
    // //   const accountAdress = "0x8488987B02135e6264d7741DfD46AF14e756152C";
    // //   const implementation = await SimpleAccount__factory.connect(accountAdress, epAsSigner);
    // //   const proxy = await new ERC1967Proxy__factory(ethersSigner).deploy(implementation.address, '0x')
    // //   account = SimpleAccount__factory.connect(proxy.address, epAsSigner)

    // const epAsSigner = await ethers.getSigner(config.entryPointAddress);
    // ({ proxy: account } = await createAccount(ethersSigner, await ethersSigner.getAddress()))  

    

    // const entrypoint = EntryPoint__factory.connect(config.entryPointAddress, ethers.provider.getSigner());
    // const accountAdress = account.address;
    // const vtho = ERC20__factory.connect(config.VTHOAddress, ethers.provider.getSigner());
    // await vtho.approve(config.entryPointAddress, BigNumber.from(ONE_HUNDERD_VTHO));
    // await entrypoint.depositAmountTo(accountAdress, BigNumber.from(ONE_HUNDERD_VTHO));

    // //   console.log("Signer: ", await ethersSigner.getAddress());
    //   console.log("Account's EntryPoint: ", await account.entryPoint());
    // //   console.log("AccountOwner: ", accountOwner.address);
    // //   console.log("entryPointEoa: ", entryPointEoa);

    //   await ethersSigner.sendTransaction({ from: accounts[0], to: account.address, value: parseEther('0.2') })

    //   const callGasLimit = 200000
    //   const verificationGasLimit = 100000
    //   const maxFeePerGas = 3e9
    //   const chainId = await ethers.provider.getNetwork().then(net => net.chainId)

    //   userOp = signUserOp(fillUserOpDefaults({
    //     sender: account.address,
    //     callGasLimit,
    //     verificationGasLimit,
    //     maxFeePerGas
    //   }), accountOwner, config.entryPointAddress, chainId)

    //   userOpHash = await getUserOpHash(userOp, config.entryPointAddress, chainId)

    //   expectedPay = actualGasPrice * (callGasLimit + verificationGasLimit)

    //   preBalance = await getBalance(account.address)
    //   const ret = await account.validateUserOp(userOp, userOpHash, expectedPay, { gasPrice: actualGasPrice})
    //   await ret.wait()
    // })

    before(async () => {
        entryPointEoa = accounts[2]
        const epAsSigner = await ethers.getSigner(entryPointEoa)

        const simpleAccountContract = await SimpleAccountT.new(entryPointEoa)
        account = SimpleAccount__factory.connect(simpleAccountContract.address, epAsSigner)
        

        await ethersSigner.sendTransaction({ from: accounts[0], to: account.address, value: parseEther('0.2') })
        const callGasLimit = 200000
        const verificationGasLimit = 100000
        const maxFeePerGas = 3e9
        const chainId = await ethers.provider.send('eth_chainId', []); //await ethers.provider.getNetwork().then(net => net.chainId)
  
        userOp = signUserOp(fillUserOpDefaults({
          sender: account.address,
          callGasLimit,
          verificationGasLimit,
          maxFeePerGas
        }), accountOwner, entryPointEoa, chainId)
  
        userOpHash = await getUserOpHash(userOp, entryPointEoa, chainId)
  
        expectedPay = actualGasPrice * (callGasLimit + verificationGasLimit)
  
        preBalance = await getBalance(account.address)
        const ret = await account.validateUserOp(userOp, userOpHash, expectedPay, { gasPrice: actualGasPrice })
        await ret.wait()
      })

    it('should not use VET as gas', async () => {
      const postBalance = await getBalance(account.address)
      expect(preBalance - postBalance).to.eql(0)
    })

    it('should return NO_SIG_VALIDATION on wrong signature', async () => {
      const userOpHash = HashZero

      const deadline = await account.callStatic.validateUserOp({ ...userOp, nonce: 1 }, userOpHash, 0);
      expect(deadline).to.eq(1)
    })
  })

  context('SimpleAccountFactory', () => {
    it('sanity: check deployer', async () => {
      const ownerAddr = createAddress()
    //   const deployer = await new SimpleAccountFactory__factory(ethersSigner).deploy(entryPoint)
      const deployer = await SimpleAccountFactory__factory.connect(config.simpleAccountFactoryAddress, ethers.provider.getSigner());
      const target = await deployer.callStatic.createAccount(ownerAddr, 1234)
    //   expect(await isDeployed(target)).to.eq(false)
      await deployer.createAccount(ownerAddr, 1234)
      expect(await isDeployed(target)).to.eq(true)
    })
  })
})