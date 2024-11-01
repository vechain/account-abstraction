import { expect } from 'chai'
import crypto from 'crypto'
import { BigNumber, Wallet } from 'ethers/lib/ethers'
import { hexConcat } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import {
  ERC20__factory,
  EntryPoint,
  EntryPoint__factory,
  SimpleAccount,
  SimpleAccountFactory,
  SimpleAccountFactory__factory,
  TestCounter__factory
} from '../../typechain'
import {
  fillAndSign,
  getUserOpHash
} from '../utils/UserOp'
import '../utils/aa.init'
import config from '../utils/config'
import {
  AddressZero,
  checkForBannedOps,
  createAccountFromFactory,
  createAccountOwner,
  createAddress,
  createRandomAccountFromFactory,
  createRandomAccountOwner,
  createRandomAddress,
  fund,
  fundVtho,
  getAccountAddress,
  getAccountInitCode,
  getBalance,
  getVeChainChainId,
  simulationResultCatch
} from '../utils/testutils'

const ONE_HUNDRED_VTHO = '100000000000000000000'
const ONE_THOUSAND_VTHO = '1000000000000000000000'

function getRandomInt (min: number, max: number): number {
  min = Math.ceil(min)
  max = Math.floor(max)
  const range = max - min
  if (range <= 0) {
    throw new Error('Max must be greater than min')
  }
  const randomBytes = crypto.randomBytes(4)
  const randomValue = randomBytes.readUInt32BE(0)
  return min + (randomValue % range)
}

describe('EntryPoint', function () {
  let simpleAccountFactory: SimpleAccountFactory
  let entryPointAddress: string

  let accountOwner: Wallet
  const ethersSigner = ethers.provider.getSigner()
  let account: SimpleAccount

  before(async function () {
    let entryPoint
    if (process.env.NETWORK !== null && process.env.NETWORK !== undefined && process.env.NETWORK !== '') {
      entryPoint = EntryPoint__factory.connect(config.entryPointAddress, ethers.provider.getSigner())
      entryPointAddress = entryPoint.address
      simpleAccountFactory = SimpleAccountFactory__factory.connect(config.simpleAccountFactoryAddress, ethersSigner)
    } else {
      const entryPointFactory = await ethers.getContractFactory('EntryPoint')
      entryPoint = await entryPointFactory.deploy()
      entryPointAddress = entryPoint.address

      const accountFactoryFactory = await ethers.getContractFactory('SimpleAccountFactory')
      simpleAccountFactory = await accountFactoryFactory.deploy(entryPoint.address)
      await simpleAccountFactory.deployed()
    }

    accountOwner = createAccountOwner()

    const createdAccount = await createAccountFromFactory(simpleAccountFactory, ethersSigner, await accountOwner.getAddress())
    account = createdAccount.account
    await fund(account)

    // sanity: validate helper functions
    const sampleOp = await fillAndSign({
      sender: account.address
    }, accountOwner, entryPoint)

    const chainId = await getVeChainChainId()
    expect(getUserOpHash(sampleOp, entryPoint.address, chainId)).to.eql(await entryPoint.getUserOpHash(sampleOp))
  })

  describe('Stake Management', () => {
    describe('with deposit', () => {
      let address2: string
      let entryPoint: EntryPoint
      const signer2 = ethers.provider.getSigner(2)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer2)
      const DEPOSIT = 1000

      before(() => {
        entryPoint = EntryPoint__factory.connect(entryPointAddress, signer2)
      })

      beforeEach(async function () {
        // Approve transfer from signer to Entrypoint and deposit
        await vtho.approve(entryPointAddress, DEPOSIT)
        address2 = await signer2.getAddress()
      })

      afterEach(async function () {
        // Reset state by withdrawing deposit
        const balance = await entryPoint.balanceOf(address2)
        await entryPoint.withdrawTo(address2, balance)
      })

      it('should transfer full approved amount into EntryPoint', async () => {
        // Transfer approved amount to entrpoint
        await entryPoint.depositTo(address2)

        // Check amount has been deposited
        expect(await entryPoint.balanceOf(address2)).to.eql(DEPOSIT)
        expect(await entryPoint.getDepositInfo(await signer2.getAddress())).to.eql({
          deposit: DEPOSIT,
          staked: false,
          stake: 0,
          unstakeDelaySec: 0,
          withdrawTime: 0
        })

        // Check updated allowance
        expect(await vtho.allowance(address2, entryPointAddress)).to.eql(0)
      })

      it('should transfer partial approved amount into EntryPoint', async () => {
        // Transfer partial amount to entrpoint
        const ONE = 1
        await entryPoint.depositAmountTo(address2, DEPOSIT - ONE)

        // Check amount has been deposited
        expect(await entryPoint.balanceOf(address2)).to.eql(DEPOSIT - ONE)
        expect(await entryPoint.getDepositInfo(await signer2.getAddress())).to.eql({
          deposit: DEPOSIT - ONE,
          staked: false,
          stake: 0,
          unstakeDelaySec: 0,
          withdrawTime: 0
        })

        // Check updated allowance
        expect(await vtho.allowance(address2, entryPointAddress)).to.eql(ONE)
      })

      it('should fail to transfer more than approved amount into EntryPoint', async () => {
        // Check transferring more than the amount fails
        await expect(entryPoint.depositAmountTo(address2, DEPOSIT + 1)).to.revertedWith('amount to deposit > allowance')
      })

      it('should fail to withdraw larger amount than available', async () => {
        const addrTo = createAddress()
        await expect(entryPoint.withdrawTo(addrTo, DEPOSIT)).to.revertedWith('Withdraw amount too large')
      })

      it('should withdraw amount', async () => {
        const addrTo = createRandomAddress()
        await entryPoint.depositTo(address2)
        const depositBefore = await entryPoint.balanceOf(address2)
        await entryPoint.withdrawTo(addrTo, 1)
        expect(await entryPoint.balanceOf(address2)).to.equal(depositBefore.sub(1))
        expect(await vtho.balanceOf(addrTo)).to.equal(1)
      })
    })

    describe('without stake', () => {
      let entryPoint: EntryPoint
      const signer3 = ethers.provider.getSigner(3)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer3)
      before(() => {
        entryPoint = EntryPoint__factory.connect(entryPointAddress, signer3)
      })
      it('should fail to stake without approved amount', async () => {
        await vtho.approve(entryPointAddress, 0)
        await expect(entryPoint.addStake(0)).to.revertedWith('amount to stake == 0')
      })
      it('should fail to stake more than approved amount', async () => {
        await vtho.approve(entryPointAddress, 100)
        await expect(entryPoint.addStakeAmount(0, 101)).to.revertedWith('amount to stake > allowance')
      })
      it('should fail to stake without delay', async () => {
        await vtho.approve(entryPointAddress, 100)
        await expect(entryPoint.addStake(0)).to.revertedWith('must specify unstake delay')
        await expect(entryPoint.addStakeAmount(0, 100)).to.revertedWith('must specify unstake delay')
      })
      it('should fail to unlock', async () => {
        await expect(entryPoint.unlockStake()).to.revertedWith('not staked')
      })
    })

    describe('with stake', () => {
      let entryPoint: EntryPoint
      let address4: string

      const UNSTAKE_DELAY_SEC = 60
      const signer4 = ethers.provider.getSigner(4)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer4)

      before(async () => {
        entryPoint = EntryPoint__factory.connect(entryPointAddress, signer4)
        address4 = await signer4.getAddress()
        await vtho.approve(entryPointAddress, 2000)
        await entryPoint.addStake(UNSTAKE_DELAY_SEC)
      })
      it('should report "staked" state', async () => {
        const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(address4)
        expect({ staked, unstakeDelaySec, withdrawTime }).to.eql({
          staked: true,
          unstakeDelaySec: UNSTAKE_DELAY_SEC,
          withdrawTime: 0
        })
        expect(stake.toNumber()).to.greaterThanOrEqual(2000)
      })

      it('should succeed to stake again', async () => {
        const { stake } = await entryPoint.getDepositInfo(address4)
        await vtho.approve(entryPointAddress, 1000)
        await entryPoint.addStake(UNSTAKE_DELAY_SEC)
        const { stake: stakeAfter } = await entryPoint.getDepositInfo(address4)
        expect(stakeAfter).to.eq(stake.add(1000))
      })
      it('should fail to withdraw before unlock', async () => {
        await expect(entryPoint.withdrawStake(AddressZero)).to.revertedWith('must call unlockStake() first')
      })
      describe('with unlocked stake', () => {
        let withdrawTime1: number
        before(async () => {
          const transaction = await entryPoint.unlockStake()
          withdrawTime1 = await ethers.provider.getBlock(transaction.blockHash!).then(block => block.timestamp) + UNSTAKE_DELAY_SEC
        })
        it('should report as "not staked"', async () => {
          expect(await entryPoint.getDepositInfo(address4).then(info => info.staked)).to.eq(false)
        })
        it('should report unstake state', async () => {
          const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(address4)
          expect({ staked, unstakeDelaySec, withdrawTime }).to.eql({
            staked: false,
            unstakeDelaySec: UNSTAKE_DELAY_SEC,
            withdrawTime: withdrawTime1
          })

          expect(stake.toNumber()).to.greaterThanOrEqual(3000)
        })
        it('should fail to withdraw before unlock timeout', async () => {
          await expect(entryPoint.withdrawStake(AddressZero)).to.revertedWith('Stake withdrawal is not due')
        })
        it('should fail to unlock again', async () => {
          await expect(entryPoint.unlockStake()).to.revertedWith('already unstaking')
        })
        describe('after unstake delay', () => {
          before(async () => {
            await new Promise(resolve => setTimeout(resolve, 60000))
          })
          it('should fail to unlock again', async () => {
            await expect(entryPoint.unlockStake()).to.revertedWith('already unstaking')
          })
          it('adding stake should reset "unlockStake"', async () => {
            await vtho.approve(entryPointAddress, 1000)
            await entryPoint.addStake(UNSTAKE_DELAY_SEC)
            const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(address4)
            expect({ staked, unstakeDelaySec, withdrawTime }).to.eql({
              staked: true,
              unstakeDelaySec: UNSTAKE_DELAY_SEC,
              withdrawTime: 0
            })

            expect(stake.toNumber()).to.greaterThanOrEqual(4000)
          })
          it('should succeed to withdraw', async () => {
            await entryPoint.unlockStake().catch(e => console.log(e.message))

            // wait 2 minutes
            await new Promise((resolve) => setTimeout(resolve, 120000))

            const { stake } = await entryPoint.getDepositInfo(address4)
            const addr1 = createRandomAddress()
            await entryPoint.withdrawStake(addr1)
            expect(await vtho.balanceOf(addr1)).to.eq(stake)
            const { stake: stakeAfter, withdrawTime, unstakeDelaySec } = await entryPoint.getDepositInfo(address4)

            expect({ stakeAfter, withdrawTime, unstakeDelaySec }).to.eql({
              stakeAfter: BigNumber.from(0),
              unstakeDelaySec: 0,
              withdrawTime: 0
            })
          })
        })
      })
    })
    describe('with deposit', () => {
      let account: SimpleAccount
      const signer5 = ethers.provider.getSigner(5)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer5)
      before(async () => {
        const accountFromFactory = await createAccountFromFactory(simpleAccountFactory, signer5, await signer5.getAddress())
        account = accountFromFactory.account
        await vtho.transfer(account.address, BigNumber.from(ONE_THOUSAND_VTHO))
        await account.deposit(ONE_THOUSAND_VTHO, { gasLimit: 1e7 }).then(async tx => tx.wait())
        expect(await getBalance(account.address)).to.equal(0)
        expect(await account.getDeposit()).to.eql(ONE_THOUSAND_VTHO)
      })
      it('should be able to withdraw', async () => {
        const depositBefore = await account.getDeposit()
        await account.withdrawDepositTo(account.address, ONE_HUNDRED_VTHO).then(async tx => tx.wait())
        expect(await account.getDeposit()).to.equal(depositBefore.sub(ONE_HUNDRED_VTHO))
      })
    })
  })

  describe('#simulateValidation', () => {
    const accountOwner1 = createAccountOwner()
    let entryPoint: EntryPoint
    let account1: SimpleAccount
    const signer2 = ethers.provider.getSigner(2)
    const vtho = ERC20__factory.connect(config.VTHOAddress, signer2)

    before(async () => {
      entryPoint = EntryPoint__factory.connect(entryPointAddress, signer2)
      const accountFromFactory = await createAccountFromFactory(simpleAccountFactory, ethersSigner, await accountOwner1.getAddress())
      account1 = accountFromFactory.account

      await fund(account1)

      // Fund account
      await vtho.approve(entryPoint.address, BigNumber.from(ONE_HUNDRED_VTHO))
      await entryPoint.depositAmountTo(account.address, BigNumber.from(ONE_HUNDRED_VTHO))

      // Fund account1
      await vtho.approve(entryPoint.address, BigNumber.from(ONE_HUNDRED_VTHO))
      await entryPoint.depositAmountTo(account1.address, BigNumber.from(ONE_HUNDRED_VTHO))
    })

    it('should fail if validateUserOp fails', async () => {
      // using wrong nonce
      const op = await fillAndSign({ sender: account.address, nonce: 1234 }, accountOwner, entryPoint)
      await expect(entryPoint.callStatic.simulateValidation(op)).to
        .revertedWith('AA25 invalid account nonce')
    })

    it('should report signature failure without revert', async () => {
      // (this is actually a feature of the wallet, not the entrypoint)
      // using wrong owner for account1
      // (zero gas price so it doesn't fail on prefund)
      const op = await fillAndSign({ sender: account1.address, maxFeePerGas: 0 }, accountOwner, entryPoint)
      const { returnInfo } = await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
      expect(returnInfo.sigFailed).to.be.true
    })

    it('should revert if wallet not deployed (and no initcode)', async () => {
      const op = await fillAndSign({
        sender: createAddress(),
        nonce: 0,
        verificationGasLimit: 1000
      }, accountOwner, entryPoint)
      await expect(entryPoint.callStatic.simulateValidation(op)).to
        .revertedWith('AA20 account not deployed')
    })

    it('should revert on oog if not enough verificationGas', async () => {
      const op = await fillAndSign({ sender: account.address, verificationGasLimit: 1000 }, accountOwner, entryPoint)
      await expect(entryPoint.callStatic.simulateValidation(op)).to
        .revertedWith('AA23 reverted (or OOG)')
    })

    it('should succeed if validateUserOp succeeds', async () => {
      const op = await fillAndSign({ sender: account1.address }, accountOwner1, entryPoint)
      await fund(account1)
      await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
    })

    it('should return empty context if no paymaster', async () => {
      const op = await fillAndSign({ sender: account1.address, maxFeePerGas: 0 }, accountOwner1, entryPoint)
      const { returnInfo } = await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
      expect(returnInfo.paymasterContext).to.eql('0x')
    })

    it('should return stake of sender', async () => {
      const stakeValue = BigNumber.from(456)
      const unstakeDelay = 3

      const accountOwner = createRandomAccountOwner()
      const accountFromFactory = await createRandomAccountFromFactory(simpleAccountFactory, ethersSigner, accountOwner.address)
      const account2 = accountFromFactory.account

      await fund(account2)
      await fundVtho(account2.address, entryPoint)
      await vtho.transfer(account2.address, ONE_HUNDRED_VTHO)

      // allow vtho from account to entrypoint
      const callData0 = account.interface.encodeFunctionData('execute', [vtho.address, 0, vtho.interface.encodeFunctionData('approve', [entryPoint.address, stakeValue])])

      const vthoOp = await fillAndSign({
        sender: account2.address,
        callData: callData0,
        callGasLimit: BigNumber.from(123456)
      }, accountOwner, entryPoint)

      const beneficiary = createRandomAddress()

      // Aprove some VTHO to entrypoint
      await entryPoint.handleOps([vthoOp], beneficiary, { gasLimit: 1e7 })

      // Call execute on account via userOp instead of directly
      const callData = account.interface.encodeFunctionData('execute', [entryPoint.address, 0, entryPoint.interface.encodeFunctionData('addStake', [unstakeDelay])])
      const opp = await fillAndSign({
        sender: account2.address,
        callData,
        callGasLimit: BigNumber.from(1234567),
        verificationGasLimit: BigNumber.from(1234567)
      }, accountOwner, entryPoint)

      // call entryPoint.addStake from account
      await entryPoint.handleOps([opp], createRandomAddress(), { gasLimit: 1e7 })

      // reverts, not from owner
      // let ret = await account2.execute(entryPoint.address, stakeValue, entryPoint.interface.encodeFunctionData('addStake', [unstakeDelay]), {gasLimit: 1e7})
      const op = await fillAndSign({ sender: account2.address }, accountOwner, entryPoint)
      const result = await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
      expect(result.senderInfo).to.eql({ stake: stakeValue, unstakeDelaySec: unstakeDelay })
    })

    it('should prevent overflows: fail if any numeric value is more than 120 bits', async () => {
      const op = await fillAndSign({
        preVerificationGas: BigNumber.from(2).pow(130),
        sender: account1.address
      }, accountOwner1, entryPoint)
      await expect(
        entryPoint.callStatic.simulateValidation(op)
      ).to.revertedWith('gas values overflow')
    })

    it('should fail creation for wrong sender', async () => {
      const op1 = await fillAndSign({
        initCode: getAccountInitCode(accountOwner1.address, simpleAccountFactory),
        sender: '0x'.padEnd(42, '1'),
        verificationGasLimit: 3e6
      }, accountOwner1, entryPoint)
      await expect(entryPoint.callStatic.simulateValidation(op1))
        .to.revertedWith('AA14 initCode must return sender')
    })

    it('should report failure on insufficient verificationGas (OOG) for creation', async () => {
      const accountOwner1 = createRandomAccountOwner()
      const initCode = getAccountInitCode(accountOwner1.address, simpleAccountFactory)
      const sender = await entryPoint.callStatic.getSenderAddress(initCode).catch(e => e.errorArgs.sender)
      const op0 = await fillAndSign({
        initCode,
        sender,
        verificationGasLimit: 5e5,
        maxFeePerGas: 0
      }, accountOwner1, entryPoint)
      // must succeed with enough verification gas.
      await expect(entryPoint.callStatic.simulateValidation(op0, { gasLimit: 1e6 }))
        .to.revertedWith('ValidationResult')

      const op1 = await fillAndSign({
        initCode,
        sender,
        verificationGasLimit: 1e5,
        maxFeePerGas: 0
      }, accountOwner1, entryPoint)
      await expect(entryPoint.callStatic.simulateValidation(op1, { gasLimit: 1e6 }))
        .to.revertedWith('AA13 initCode failed or OOG')
    })

    it('should succeed for creating an account', async () => {
      const accountOwner1 = createRandomAccountOwner()
      const sender = await getAccountAddress(accountOwner1.address, simpleAccountFactory)

      // Fund sender
      await vtho.approve(entryPoint.address, BigNumber.from(ONE_HUNDRED_VTHO))
      await entryPoint.depositAmountTo(sender, BigNumber.from(ONE_HUNDRED_VTHO))

      const op1 = await fillAndSign({
        sender,
        initCode: getAccountInitCode(accountOwner1.address, simpleAccountFactory)
      }, accountOwner1, entryPoint)
      await fund(op1.sender)

      await entryPoint.callStatic.simulateValidation(op1).catch(simulationResultCatch)
    })

    it('should not call initCode from entrypoint', async () => {
      // a possible attack: call an account's execFromEntryPoint through initCode. This might lead to stolen funds.
      const { account } = await createAccountFromFactory(simpleAccountFactory, ethersSigner, await accountOwner.getAddress())
      const sender = createAddress()
      const op1 = await fillAndSign({
        initCode: hexConcat([
          account.address,
          account.interface.encodeFunctionData('execute', [sender, 0, '0x'])
        ]),
        sender
      }, accountOwner, entryPoint)
      const error = await entryPoint.callStatic.simulateValidation(op1).catch(e => e)
      expect(error.message).to.match(/initCode failed or OOG/, error)
    })

    it('should not use banned ops during simulateValidation', async () => {
      const salt = getRandomInt(1, 2147483648)
      const op1 = await fillAndSign({
        initCode: getAccountInitCode(accountOwner1.address, simpleAccountFactory, salt),
        sender: await getAccountAddress(accountOwner1.address, simpleAccountFactory, salt)
      }, accountOwner1, entryPoint)

      await fund(op1.sender)
      await fundVtho(op1.sender, entryPoint)

      const transaction = await entryPoint.simulateValidation(op1, { gasLimit: 1e7 })
      transaction.wait().catch(e => e.errorArgs)
      const blockHash = transaction.blockHash ?? (await ethers.provider.getBlock('latest')).hash
      await checkForBannedOps(blockHash, transaction.hash, false)
    })
  })

  describe('#simulateHandleOp', () => {
    let entryPoint: EntryPoint
    const signer2 = ethers.provider.getSigner(2)

    before(() => {
      entryPoint = EntryPoint__factory.connect(entryPointAddress, signer2)
    })

    it('should simulate execution', async () => {
      const accountOwner1 = createAccountOwner()
      const { account } = await createAccountFromFactory(simpleAccountFactory, ethersSigner, await accountOwner.getAddress())
      await fund(account)
      const testCounterFactory = await ethers.getContractFactory('TestCounter')
      const testCounterContract = await testCounterFactory.deploy()
      const counter = TestCounter__factory.connect(testCounterContract.address, ethersSigner)

      const count = counter.interface.encodeFunctionData('count')
      const callData = account.interface.encodeFunctionData('execute', [counter.address, 0, count])
      // deliberately broken signature.. simulate should work with it too.
      const userOp = await fillAndSign({
        sender: account.address,
        callData
      }, accountOwner1, entryPoint)

      const ret = await entryPoint.callStatic.simulateHandleOp(userOp,
        counter.address,
        counter.interface.encodeFunctionData('counters', [account.address])
      ).catch(e => e.errorArgs)

      const [countResult] = counter.interface.decodeFunctionResult('counters', ret.targetResult)
      expect(countResult).to.eql(1)
      expect(ret.targetSuccess).to.be.true

      // actual counter is zero
      expect(await counter.counters(account.address)).to.eql(0)
    })
  })
})
