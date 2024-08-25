import { expect } from 'chai'
import { Wallet } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import { artifacts, ethers } from 'hardhat'
import {
  SimpleAccount,
  SimpleAccountFactory,
  SimpleAccountFactory__factory,
  SimpleAccount__factory,
  TestCounter,
  TestCounter__factory,
  TestUtil
} from '../../typechain'
import {
  HashZero,
  ONE_ETH,
  createAccountFromFactory,
  createAccountOwner,
  createAddress,
  getBalance,
  getVeChainChainId,
  isDeployed
} from '../utils/testutils'
import { fillUserOpDefaults, getUserOpHash, packUserOp, signUserOp } from '../utils/UserOp'
import { UserOperation } from '../utils/UserOperation'

const SimpleAccountT = artifacts.require('SimpleAccount')

describe('SimpleAccount', function () {
  let simpleAccountFactory: SimpleAccountFactory
  let accounts: string[]
  let testUtil: TestUtil
  let accountOwner: Wallet
  const ethersSigner = ethers.provider.getSigner()

  before(async function () {
    const entryPointFactory = await ethers.getContractFactory('EntryPoint')
    const entryPoint = await entryPointFactory.deploy()
    const accountFactoryFactory = await ethers.getContractFactory('SimpleAccountFactory')
    simpleAccountFactory = await accountFactoryFactory.deploy(entryPoint.address)
    await simpleAccountFactory.deployed()
    accounts = await ethers.provider.listAccounts()
    // ignore in geth.. this is just a sanity test. should be refactored to use a single-account mode..
    if (accounts.length < 2) this.skip()
    const testUtilFactory = await ethers.getContractFactory('TestUtil')
    testUtil = await testUtilFactory.deploy()
    accountOwner = createAccountOwner()
  })

  it('owner should be able to call transfer', async () => {
    const { account } = await createAccountFromFactory(simpleAccountFactory, ethers.provider.getSigner(), accounts[0])
    await ethersSigner.sendTransaction({ from: accounts[0], to: account.address, value: parseEther('2') })
    await account.execute(accounts[2], ONE_ETH, '0x')
  })
  it('other account should not be able to call transfer', async () => {
    const { account } = await createAccountFromFactory(simpleAccountFactory, ethers.provider.getSigner(), accounts[0])
    await expect(account.connect(ethers.provider.getSigner(1)).execute(accounts[2], ONE_ETH, '0x'))
      .to.be.revertedWith('account: not Owner or EntryPoint')
  })

  it('should pack in js the same as solidity', async () => {
    const op = fillUserOpDefaults({ sender: accounts[0] })
    const packed = packUserOp(op)
    const actual = await testUtil.packUserOp(op)
    expect(actual).to.equal(packed)
  })

  describe('#executeBatch', () => {
    let account: SimpleAccount
    let counter: TestCounter
    before(async () => {
      const accountFromFactory = await createAccountFromFactory(simpleAccountFactory, ethersSigner, await ethersSigner.getAddress())
      account = accountFromFactory.account
      counter = await new TestCounter__factory(ethersSigner).deploy()
    })

    it('should allow zero value array', async () => {
      const rcpt = await account.executeBatch(
        [counter.address, counter.address],
        [0, 0]
      ).then(async t => await t.wait())
      expect(rcpt)
    })

    it('should allow transfer value', async () => {
      const target = createAddress()

      // Fund SimpleAccount with 2 VET
      await ethersSigner.sendTransaction({ from: accounts[0], to: account.address, value: parseEther('2') })

      await account.execute(target, ONE_ETH, '0x00').then(async t => await t.wait())
      const actualBalance = await ethers.provider.getBalance(target)
      expect(actualBalance.toString()).to.not.eql('0')
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

    const actualGasPrice = 1e9
    // for testing directly validateUserOp, we initialize the account with EOA as entryPoint.
    let entryPointEoa: string

    before(async () => {
      entryPointEoa = accounts[2]
      const epAsSigner = await ethers.getSigner(entryPointEoa)

      const simpleAccountContract = await SimpleAccountT.new(entryPointEoa)
      account = SimpleAccount__factory.connect(simpleAccountContract.address, epAsSigner)

      await ethersSigner.sendTransaction({ from: accounts[0], to: account.address, value: parseEther('0.2') })
      const callGasLimit = 200000
      const verificationGasLimit = 100000
      const maxFeePerGas = 3e9
      const chainId = getVeChainChainId()

      userOp = signUserOp(fillUserOpDefaults({
        sender: account.address,
        callGasLimit,
        verificationGasLimit,
        maxFeePerGas
      }), accountOwner, entryPointEoa, chainId)

      userOpHash = getUserOpHash(userOp, entryPointEoa, chainId)

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

      const deadline = await account.callStatic.validateUserOp({ ...userOp, nonce: 1 }, userOpHash, 0)
      expect(deadline).to.eq(1)
    })
  })

  context('SimpleAccountFactory', () => {
    it('sanity: check deployer', async () => {
      const ownerAddr = createAddress()
      //   const deployer = await new SimpleAccountFactory__factory(ethersSigner).deploy(entryPoint)
      const deployer = SimpleAccountFactory__factory.connect(simpleAccountFactory.address, ethers.provider.getSigner())
      const target = await deployer.callStatic.createAccount(ownerAddr, 1234)
      //   expect(await isDeployed(target)).to.eq(false)
      await deployer.createAccount(ownerAddr, 1234)
      expect(await isDeployed(target)).to.eq(true)
    })
  })
})
