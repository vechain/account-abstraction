import './aa.init'
import { expect } from 'chai'
import {
  ERC20__factory,
  EntryPoint__factory,
  MaliciousAccount__factory,
  SimpleAccount,
  SimpleAccountFactory,
  TestAggregatedAccount,
  TestAggregatedAccountFactory__factory,
  TestAggregatedAccount__factory,
  TestCounter,
  TestExpirePaymaster,
  TestExpirePaymaster__factory,
  TestExpiryAccount,
  TestExpiryAccount__factory,
  TestPaymasterAcceptAll,
  TestPaymasterAcceptAll__factory,
  TestRevertAccount__factory,
  TestSignatureAggregator,
  TestSignatureAggregator__factory,
  TestWarmColdAccount__factory,
} from '../typechain'
import {
  EntryPoint,
  TokenPaymaster__factory,
  TestCounter__factory,
  SimpleAccountFactory__factory,
  TokenPaymaster,
} from '../typechain'
import {
  fund,
  createAccount,
  createAccountOwner,
  AddressZero,
  createAddress,
  createRandomAccount,
  createRandomAccountOwner,
  createRandomAddress,
  fundVtho,
} from './testutils'
import {
  checkForGeth,
  rethrow,
  tostr,
  getAccountInitCode,
  calcGasUsage,
  checkForBannedOps,
  ONE_ETH,
  TWO_ETH,
  deployEntryPoint,
  getBalance,
  getAccountAddress,
  HashZero,
  simulationResultCatch,
  getAggregatedAccountInitCode,
  simulationResultWithAggregationCatch, decodeRevertReason
} from './testutils'
import { BigNumber, PopulatedTransaction, Wallet } from 'ethers/lib/ethers'
import { artifacts, ethers } from 'hardhat'
import {
  DefaultsForUserOp,
  fillAndSign,
  getUserOpHash
} from './UserOp'
import config from './config'
import { BytesLike, arrayify, defaultAbiCoder, hexConcat, hexZeroPad, parseEther } from 'ethers/lib/utils'
import { UserOperation } from './UserOperation'
import { debugTransaction } from './_debugTx'
import { toChecksumAddress } from 'ethereumjs-util'

const TestCounterT = artifacts.require('TestCounter');
const TestSignatureAggregatorT = artifacts.require('TestSignatureAggregator');
const TestAggregatedAccountT = artifacts.require('TestAggregatedAccount');
const TestExpiryAccountT = artifacts.require('TestExpiryAccount')
const TestPaymasterAcceptAllT = artifacts.require('TestPaymasterAcceptAll');
const TestExpirePaymasterT = artifacts.require('TestExpirePaymaster');
const TestRevertAccountT = artifacts.require('TestRevertAccount');
const TestAggregatedAccountFactoryT = artifacts.require('TestAggregatedAccountFactory')
const MaliciousAccountT = artifacts.require('MaliciousAccount')
const TestWarmColdAccountT = artifacts.require('TestWarmColdAccount');
const ONE_HUNDERD_VTHO = "100000000000000000000"
const ONE_THOUSAND_VTHO = "1000000000000000000000"

describe('EntryPoint', function () {
  let simpleAccountFactory: SimpleAccountFactory

  let accountOwner: Wallet
  const ethersSigner = ethers.provider.getSigner()
  let account: SimpleAccount

  const globalUnstakeDelaySec = 2
  const paymasterStake = ethers.utils.parseEther('2')

  before(async function () {
    const chainId = await ethers.provider.send('eth_chainId', []); //await ethers.provider.getNetwork().then(net => net.chainId);
    const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, ethers.provider.getSigner());

    accountOwner = createAccountOwner();
    ({
      proxy: account,
      accountFactory: simpleAccountFactory
    } = await createAccount(ethersSigner, await accountOwner.getAddress()))
    await fund(account)

    // sanity: validate helper functions
    const sampleOp = await fillAndSign({
      sender: account.address
    }, accountOwner, entryPoint)

    expect(getUserOpHash(sampleOp, entryPoint.address, chainId)).to.eql(await entryPoint.getUserOpHash(sampleOp))
  })

  describe('Stake Management', () => {
    describe("with deposit", () => {
      let address2: string;
      const signer2 = ethers.provider.getSigner(2)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer2)
      const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer2)
      const DEPOSIT = 1000;

      beforeEach(async function () {
        // Approve transfer from signer to Entrypoint and deposit
        await vtho.approve(config.entryPointAddress, DEPOSIT);
        address2 = await signer2.getAddress();
      })

      afterEach(async function () {
        // Reset state by withdrawing deposit
        const balance = await entryPoint.balanceOf(address2);
        await entryPoint.withdrawTo(address2, balance);
      })

      it("should transfer full approved amount into EntryPoint", async () => {
        // Transfer approved amount to entrpoint
        await entryPoint.depositTo(address2);

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
        expect(await vtho.allowance(address2, config.entryPointAddress)).to.eql(0);
      })

      it("should transfer partial approved amount into EntryPoint", async () => {
        // Transfer partial amount to entrpoint
        const ONE = 1;
        await entryPoint.depositAmountTo(address2, DEPOSIT - ONE);

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
        expect(await vtho.allowance(address2, config.entryPointAddress)).to.eql(ONE);
      })

      it("should fail to transfer more than approved amount into EntryPoint", async () => {
        // Check transferring more than the amount fails
        expect(entryPoint.depositAmountTo(address2, DEPOSIT + 1)).to.revertedWith("amount to deposit > allowance")
      })

      it('should fail to withdraw larger amount than available', async () => {
        const addrTo = createAddress()
        await expect(entryPoint.withdrawTo(addrTo, DEPOSIT)).to.revertedWith("Withdraw amount too large");
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
      const signer3 = ethers.provider.getSigner(3)
      const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer3)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer3)
      it('should fail to stake without approved amount', async () => {
        await vtho.approve(config.entryPointAddress, 0);
        await expect(entryPoint.addStake(0)).to.revertedWith("amount to stake == 0")
      })
      it('should fail to stake more than approved amount', async () => {
        await vtho.approve(config.entryPointAddress, 100);
        await expect(entryPoint.addStakeAmount(0, 101)).to.revertedWith("amount to stake > allowance")
      })
      it('should fail to stake without delay', async () => {
        await vtho.approve(config.entryPointAddress, 100);
        await expect(entryPoint.addStake(0)).to.revertedWith('must specify unstake delay')
        await expect(entryPoint.addStakeAmount(0, 100)).to.revertedWith('must specify unstake delay')
      })
      it('should fail to unlock', async () => {
        await expect(entryPoint.unlockStake()).to.revertedWith('not staked')
      })
    });

    describe('with stake', () => {
      const UNSTAKE_DELAY_SEC = 60;
      var address4: string;
      const signer4 = ethers.provider.getSigner(4)
      const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer4)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer4)
    
      before(async () => {
        address4 = await signer4.getAddress()
        await vtho.approve(config.entryPointAddress, 2000)
        await entryPoint.addStake(UNSTAKE_DELAY_SEC)
      })
      it('should report "staked" state', async () => {
        const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(address4)
        expect({staked, unstakeDelaySec, withdrawTime }).to.eql({
          staked: true,
          unstakeDelaySec: UNSTAKE_DELAY_SEC,
          withdrawTime: 0
        })
        expect(stake.toNumber()).to.greaterThanOrEqual(2000)
      })

      it('should succeed to stake again', async () => {
        const { stake } = await entryPoint.getDepositInfo(address4)
        await vtho.approve(config.entryPointAddress, 1000);
        await entryPoint.addStake(UNSTAKE_DELAY_SEC)
        const { stake: stakeAfter } = await entryPoint.getDepositInfo(address4)
        expect(stakeAfter).to.eq(stake.add(1000))
      })
      it('should fail to withdraw before unlock', async () => {
        await expect(entryPoint.withdrawStake(AddressZero)).to.revertedWith('must call unlockStake() first')
      })
      describe('with unlocked stake', () => {
        var withdrawTime1: number
        before(async () => {
          let transaction = await entryPoint.unlockStake();
          withdrawTime1 = await ethers.provider.getBlock(transaction.blockHash!).then(block => block.timestamp) + UNSTAKE_DELAY_SEC
        })
        it('should report as "not staked"', async () => {
          expect(await entryPoint.getDepositInfo(address4).then(info => info.staked)).to.eq(false)
        })
        it('should report unstake state', async () => {
          const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(address4)
          expect({staked, unstakeDelaySec, withdrawTime }).to.eql({
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
            // wait 61 seconds
            await new Promise(r => setTimeout(r, 60000));
          })
          it('should fail to unlock again', async () => {
            await expect(entryPoint.unlockStake()).to.revertedWith('already unstaking')
          })
          it('adding stake should reset "unlockStake"', async () => {
            await vtho.approve(config.entryPointAddress, 1000);
            await entryPoint.addStake(UNSTAKE_DELAY_SEC)
            const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(address4)
            expect({staked, unstakeDelaySec, withdrawTime }).to.eql({
              staked: true,
              unstakeDelaySec: UNSTAKE_DELAY_SEC,
              withdrawTime: 0
            })

            expect(stake.toNumber()).to.greaterThanOrEqual(4000);

          })
          it('should succeed to withdraw', async () => {
            await entryPoint.unlockStake().catch(e => console.log(e.message));

            // wait 65 seconds
            await new Promise(r => setTimeout(r, 120000));

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
      const signer5 = ethers.provider.getSigner(5)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer5)
      const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer5)
      let account: SimpleAccount
      let address5: string;
      before(async () => {
        address5 = await signer5.getAddress();
        await account.addDeposit(ONE_ETH)
        expect(await getBalance(account.address)).to.equal(0)
        expect(await account.getDeposit()).to.eql(ONE_ETH)
      })
      
    })
  })

  describe('#simulateValidation', () => {
    const accountOwner1 = createAccountOwner()
    let account1: SimpleAccount
    let address2: string;
    const signer2 = ethers.provider.getSigner(2)
    const vtho = ERC20__factory.connect(config.VTHOAddress, signer2)
    const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer2)
    const DEPOSIT = 1000;

    before(async () => {
      ({ proxy: account1 } = await createAccount(ethersSigner, await accountOwner1.getAddress()))

      await fund(account1)

      // Fund account 
      await vtho.approve(entryPoint.address, BigNumber.from(ONE_HUNDERD_VTHO));
      await entryPoint.depositAmountTo(account.address, BigNumber.from(ONE_HUNDERD_VTHO));

      // Fund account1
      await vtho.approve(entryPoint.address, BigNumber.from(ONE_HUNDERD_VTHO));
      await entryPoint.depositAmountTo(account1.address, BigNumber.from(ONE_HUNDERD_VTHO));
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

      let accountOwner = createRandomAccountOwner();
      const { proxy: account2 } = await createRandomAccount(ethersSigner, accountOwner.address)
      
      await fund(account2)
      await fundVtho(account2.address)
      await vtho.transfer(account2.address, ONE_HUNDERD_VTHO);

      // allow vtho from account to entrypoint
      const callData0 = account.interface.encodeFunctionData('execute', [vtho.address, 0, vtho.interface.encodeFunctionData('approve', [entryPoint.address, stakeValue])])

      const vthoOp = await fillAndSign({
        sender: account2.address,
        callData: callData0,
        callGasLimit: BigNumber.from(123456),
      }, accountOwner, entryPoint)
      
      let beneficiary = createRandomAddress();

      // Aprove some VTHO to entrypoint
      await entryPoint.handleOps([vthoOp], beneficiary, {gasLimit: 1e7})

      // Call execute on account via userOp instead of directly
      const callData = account.interface.encodeFunctionData('execute', [entryPoint.address, 0, entryPoint.interface.encodeFunctionData('addStake', [unstakeDelay])])
      const opp = await fillAndSign({
        sender: account2.address,
        callData,
        callGasLimit: BigNumber.from(1234567),
        verificationGasLimit: BigNumber.from(1234567),
      }, accountOwner, entryPoint)

      // call entryPoint.addStake from account
      let ret = await entryPoint.handleOps([opp], createRandomAddress(), {gasLimit: 1e7})

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
      await vtho.approve(entryPoint.address, BigNumber.from(ONE_HUNDERD_VTHO));
      await entryPoint.depositAmountTo(sender, BigNumber.from(ONE_HUNDERD_VTHO));

      const op1 = await fillAndSign({
        sender,
        initCode: getAccountInitCode(accountOwner1.address, simpleAccountFactory)
      }, accountOwner1, entryPoint)
      await fund(op1.sender)

      await entryPoint.callStatic.simulateValidation(op1).catch(simulationResultCatch)
    })

    it('should not call initCode from entrypoint', async () => {
      // a possible attack: call an account's execFromEntryPoint through initCode. This might lead to stolen funds.
      const { proxy: account } = await createAccount(ethersSigner, await accountOwner.getAddress())
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
      await fundVtho(op1.sender)

      await entryPoint.simulateValidation(op1, { gasLimit: 1e7 }).catch(e => e)
      const block = await ethers.provider.getBlock('latest')
      const hash = block.transactions[0]
      await checkForBannedOps(hash, false)
    })
  })

  describe('#simulateHandleOp', () => {
    let address2: string;
    const signer2 = ethers.provider.getSigner(2)
    const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer2)
    
    it('should simulate execution', async () => {
      const accountOwner1 = createAccountOwner()
      const { proxy: account } = await createAccount(ethersSigner, await accountOwner.getAddress())
      await fund(account)
      let testCounterContract = await TestCounterT.new();
      const counter = await TestCounter__factory.connect(testCounterContract.address, ethersSigner);

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

  describe('flickering account validation', () => {

    const signer2 = ethers.provider.getSigner(2)
    const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer2)

    // NaN
    // it('should prevent leakage of basefee', async () => {
    //   const maliciousAccountContract = await MaliciousAccountT.new(entryPoint.address, { value: parseEther('1') })
    //   const maliciousAccount = MaliciousAccount__factory.connect(maliciousAccountContract.address, ethersSigner);

    //   // const snap = await ethers.provider.send('evm_snapshot', [])
    //   // await ethers.provider.send('evm_mine', [])
    //   var block = await ethers.provider.getBlock('latest')
    //   // await ethers.provider.send('evm_revert', [snap])

    //   block.baseFeePerGas = BigNumber.from(0x0);

    //   // Needs newer web3-providers-connex
    //   if (block.baseFeePerGas == null) {
    //     expect.fail(null, null, 'test error: no basefee')
    //   }

    //   const userOp: UserOperation = {
    //     sender: maliciousAccount.address,
    //     nonce: await entryPoint.getNonce(maliciousAccount.address, 0),
    //     signature: defaultAbiCoder.encode(['uint256'], [block.baseFeePerGas]),
    //     initCode: '0x',
    //     callData: '0x',
    //     callGasLimit: '0x' + 1e5.toString(16),
    //     verificationGasLimit: '0x' + 1e5.toString(16),
    //     preVerificationGas: '0x' + 1e5.toString(16),
    //     // we need maxFeeperGas > block.basefee + maxPriorityFeePerGas so requiredPrefund onchain is basefee + maxPriorityFeePerGas
    //     maxFeePerGas: block.baseFeePerGas.mul(3),
    //     maxPriorityFeePerGas: block.baseFeePerGas,
    //     paymasterAndData: '0x'
    //   }
    //   try {
    //     // Why should this revert? 
    //     // This doesn't revert but we need it to
    //     await expect(entryPoint.simulateValidation(userOp, { gasLimit: 1e6 }))
    //       .to.revertedWith('ValidationResult')
    //     console.log('after first simulation')
    //     // await ethers.provider.send('evm_mine', [])
    //     await expect(entryPoint.simulateValidation(userOp, { gasLimit: 1e6 }))
    //       .to.revertedWith('Revert after first validation')
    //     // if we get here, it means the userOp passed first sim and reverted second
    //     expect.fail(null, null, 'should fail on first simulation')
    //   } catch (e: any) {
    //     expect(e.message).to.include('Revert after first validation')
    //   }
    // })

    it('should limit revert reason length before emitting it', async () => {
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer2)
      const revertLength = 1e5
      const REVERT_REASON_MAX_LEN = 2048
      const testRevertAccountContract = await TestRevertAccountT.new(entryPoint.address, { value: parseEther('1') })
      const testRevertAccount = TestRevertAccount__factory.connect(testRevertAccountContract.address, ethersSigner);
      const badData = await testRevertAccount.populateTransaction.revertLong(revertLength + 1)
      const badOp: UserOperation = {
        ...DefaultsForUserOp,
        sender: testRevertAccount.address,
        callGasLimit: 1e5,
        maxFeePerGas: 1,
        nonce: await entryPoint.getNonce(testRevertAccount.address, 0),
        verificationGasLimit: 1e6,
        callData: badData.data!
      }
      
      await vtho.approve(testRevertAccount.address, ONE_HUNDERD_VTHO);
      const beneficiaryAddress = createRandomAddress()

      await expect(entryPoint.callStatic.simulateValidation(badOp, { gasLimit: 1e7 })).to.revertedWith('ValidationResult')
      // const tx = await entryPoint.handleOps([badOp], beneficiaryAddress, {gasLimit: 1e7}) // { gasLimit: 3e5 })
      // const receipt = await tx.wait()
      // const userOperationRevertReasonEvent = receipt.events?.find(event => event.event === 'UserOperationRevertReason')
      // expect(userOperationRevertReasonEvent?.event).to.equal('UserOperationRevertReason')
      // const revertReason = Buffer.from(arrayify(userOperationRevertReasonEvent?.args?.revertReason))
      // expect(revertReason.length).to.equal(REVERT_REASON_MAX_LEN)
    })

    
    describe('warm/cold storage detection in simulation vs execution', () => {
      const TOUCH_GET_AGGREGATOR = 1
      const TOUCH_PAYMASTER = 2
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer2)
      it('should prevent detection through getAggregator()', async () => {
        // const testWarmColdAccountContract = await new TestWarmColdAccount__factory(ethersSigner).deploy(entryPoint.address,
        //   { value: parseEther('1') })
          const testWarmColdAccountContract = await TestWarmColdAccountT.new(entryPoint.address,{ value: parseEther('1') })
        const testWarmColdAccount = TestWarmColdAccount__factory.connect(testWarmColdAccountContract.address, ethersSigner);
        const badOp: UserOperation = {
          ...DefaultsForUserOp,
          nonce: TOUCH_GET_AGGREGATOR,
          sender: testWarmColdAccount.address
        }
        const beneficiaryAddress = createAddress()
        try {
          await entryPoint.simulateValidation(badOp, { gasLimit: 1e6 })
        } catch (e: any) {
          if ((e as Error).message.includes('ValidationResult')) {
            const tx = await entryPoint.handleOps([badOp], beneficiaryAddress, { gasLimit: 1e6 })
            await tx.wait()
          } else {
            expect(e.message).to.include('FailedOp(0, "AA23 reverted (or OOG)")')
          }
        }
      })

      it('should prevent detection through paymaster.code.length', async () => {
        const testWarmColdAccountContract = await TestWarmColdAccountT.new(entryPoint.address,{ value: parseEther('1') })
        const testWarmColdAccount = TestWarmColdAccount__factory.connect(testWarmColdAccountContract.address, ethersSigner);
        
        await fundVtho(testWarmColdAccountContract.address);

        let paymasterContract = await TestPaymasterAcceptAllT.new(entryPoint.address)
        const paymaster = TestPaymasterAcceptAll__factory.connect(paymasterContract.address, ethersSigner);

        await fundVtho(paymaster.address)
        await paymaster.deposit(ONE_ETH, {gasLimit: 1e7})

        const badOp: UserOperation = {
          ...DefaultsForUserOp,
          nonce: TOUCH_PAYMASTER,
          paymasterAndData: paymaster.address,
          sender: testWarmColdAccount.address
        }
        const beneficiaryAddress = createRandomAddress()
        try {
          await entryPoint.simulateValidation(badOp, { gasLimit: 1e6 })
        } catch (e: any) {
          if ((e as Error).message.includes('ValidationResult')) {
            const tx = await entryPoint.handleOps([badOp], beneficiaryAddress, { gasLimit: 1e6 })
            await tx.wait()
          } else {
            expect(e.message).to.include('FailedOp(0, "AA23 reverted (or OOG)")')
          }
        }
      })
    })
  })

  describe('2d nonces', () => {

    const signer2 = ethers.provider.getSigner(2)
    const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer2)

    const beneficiaryAddress = createRandomAddress()
    let sender: string
    const key = 1
    const keyShifted = BigNumber.from(key).shl(64)

    before(async () => {
      const { proxy } = await createRandomAccount(ethersSigner, accountOwner.address)
      sender = proxy.address
      await fund(sender)
      await fundVtho(sender)
    })

    it('should fail nonce with new key and seq!=0', async () => {
      const op = await fillAndSign({
        sender,
        nonce: keyShifted.add(1)
      }, accountOwner, entryPoint)
      await expect(entryPoint.callStatic.handleOps([op], beneficiaryAddress)).to.revertedWith('AA25 invalid account nonce')
    })

    describe('with key=1, seq=1', () => {
      before(async () => {
        
        await fundVtho(sender);

        const op = await fillAndSign({
          sender,
          nonce: keyShifted
        }, accountOwner, entryPoint)
        let ret = await entryPoint.handleOps([op], beneficiaryAddress, {gasLimit: 1e7})
      })

      it('should get next nonce value by getNonce', async () => {
        expect(await entryPoint.getNonce(sender, key)).to.eql(keyShifted.add(1))
      })

      it('should allow to increment nonce of different key', async () => {
        const op = await fillAndSign({
          sender,
          nonce: await entryPoint.getNonce(sender, key)
        }, accountOwner, entryPoint)
        await entryPoint.callStatic.handleOps([op], beneficiaryAddress)
      })

      it('should allow manual nonce increment', async () => {

        await fundVtho(sender);

        // must be called from account itself
        const incNonceKey = 5
        const incrementCallData = entryPoint.interface.encodeFunctionData('incrementNonce', [incNonceKey])
        const callData = account.interface.encodeFunctionData('execute', [entryPoint.address, 0, incrementCallData])
        const op = await fillAndSign({
          sender,
          callData,
          nonce: await entryPoint.getNonce(sender, key)
        }, accountOwner, entryPoint)
        await entryPoint.handleOps([op], beneficiaryAddress, {gasLimit: 1e7})

        expect(await entryPoint.getNonce(sender, incNonceKey)).to.equal(BigNumber.from(incNonceKey).shl(64).add(1))
      })
      it('should fail with nonsequential seq', async () => {
        const op = await fillAndSign({
          sender,
          nonce: keyShifted.add(3)
        }, accountOwner, entryPoint)
        await expect(entryPoint.callStatic.handleOps([op], beneficiaryAddress)).to.revertedWith('AA25 invalid account nonce')
      })
    })
  })

  describe('without paymaster (account pays in eth)', () => {
    const signer2 = ethers.provider.getSigner(2)
    const vtho = ERC20__factory.connect(config.VTHOAddress, signer2)
    const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer2)
    describe('#handleOps', () => {
      let counter: TestCounter
      let accountExecFromEntryPoint: PopulatedTransaction
      before(async () => {
        let testCounterContract = await TestCounterT.new();
        counter = await TestCounter__factory.connect(testCounterContract.address, ethersSigner);
        const count = await counter.populateTransaction.count()
        accountExecFromEntryPoint = await account.populateTransaction.execute(counter.address, 0, count.data!)
      })

      it('should revert on signature failure', async () => {
        // wallet-reported signature failure should revert in handleOps
        const wrongOwner = createAccountOwner()

        // Fund wrong owner
        await vtho.approve(entryPoint.address, BigNumber.from(ONE_HUNDERD_VTHO));
        await entryPoint.depositAmountTo(wrongOwner.address, BigNumber.from(ONE_HUNDERD_VTHO));

        const op = await fillAndSign({
          sender: account.address
        }, wrongOwner, entryPoint)
        const beneficiaryAddress = createAddress()
        await expect(entryPoint.callStatic.handleOps([op], beneficiaryAddress)).to.revertedWith('AA24 signature error')
      })

      it('account should pay for tx', async function () {
        const op = await fillAndSign({
          sender: account.address,
          callData: accountExecFromEntryPoint.data,
          verificationGasLimit: 1e6,
          callGasLimit: 1e6
        }, accountOwner, entryPoint)
        const beneficiaryAddress = createAddress()

        const countBefore = await counter.counters(account.address)
        // for estimateGas, must specify maxFeePerGas, otherwise our gas check fails
        console.log('  == est gas=', await entryPoint.estimateGas.handleOps([op], beneficiaryAddress, { maxFeePerGas: 1e9 }).then(tostr))

        // must specify at least on of maxFeePerGas, gasLimit
        // (gasLimit, to prevent estimateGas to fail on missing maxFeePerGas, see above..)
        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 1e7
        }).then(async t => await t.wait())

        const countAfter = await counter.counters(account.address)
        expect(countAfter.toNumber()).to.equal(countBefore.toNumber() + 1)
        console.log('rcpt.gasUsed=', rcpt.gasUsed.toString(), rcpt.transactionHash)

        // Skip this since we are using VTHO
        // await calcGasUsage(rcpt, entryPoint, beneficiaryAddress)
      })

      it('account should pay for high gas usage tx', async function () {
        if (process.env.COVERAGE != null) {
          return
        }
        const iterations = 1
        const count = await counter.populateTransaction.gasWaster(iterations, '')
        const accountExec = await account.populateTransaction.execute(counter.address, 0, count.data!)

        await fundVtho(account.address);

        const op = await fillAndSign({
          sender: account.address,
          callData: accountExec.data,
          verificationGasLimit: 1e5,
          callGasLimit: 11e5
        }, accountOwner, entryPoint)


        const beneficiaryAddress = createAddress()
        const offsetBefore = await counter.offset()
        console.log('  == offset before', offsetBefore)
        // for estimateGas, must specify maxFeePerGas, otherwise our gas check fails
        let ret = await entryPoint.estimateGas.handleOps([op], beneficiaryAddress, { maxFeePerGas: 1e9 }).then(tostr);
        console.log('  == est gas=', ret)

        // must specify at least on of maxFeePerGas, gasLimit
        // (gasLimit, to prevent estimateGas to fail on missing maxFeePerGas, see above..)
        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 1e7
        }).then(async t => await t.wait())

        console.log('rcpt.gasUsed=', rcpt.gasUsed.toString(), rcpt.transactionHash)
        // await calcGasUsage(rcpt, entryPoint, beneficiaryAddress)

        // check that the state of the counter contract is updated
        // this ensures that the `callGasLimit` is high enough
        // therefore this value can be used as a reference in the test below
        console.log('  == offset after', await counter.offset())
        expect(await counter.offset()).to.equal(offsetBefore.add(iterations))
      })

      it('account should not pay if too low gas limit was set', async function () {
        const iterations = 1
        const count = await counter.populateTransaction.gasWaster(iterations, '')
        const accountExec = await account.populateTransaction.execute(counter.address, 0, count.data!)
        const op = await fillAndSign({
          sender: account.address,
          callData: accountExec.data,
          verificationGasLimit: 1e5,
          callGasLimit: 11e5
        }, accountOwner, entryPoint)
        const inititalAccountBalance = await getBalance(account.address)
        const beneficiaryAddress = createAddress()
        const offsetBefore = await counter.offset()
        console.log('  == offset before', offsetBefore)
        // for estimateGas, must specify maxFeePerGas, otherwise our gas check fails
        console.log('  == est gas=', await entryPoint.estimateGas.handleOps([op], beneficiaryAddress, { maxFeePerGas: 1e9 }).then(tostr))

        // must specify at least on of maxFeePerGas, gasLimit
        // (gasLimit, to prevent estimateGas to fail on missing maxFeePerGas, see above..)
        // this transaction should revert as the gasLimit is too low to satisfy the expected `callGasLimit` (see test above)
        await expect(entryPoint.callStatic.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 12e5
        })).to.revertedWith('AA95 out of gas')

        // Make sure that the user did not pay for the transaction
        expect(await getBalance(account.address)).to.eq(inititalAccountBalance)
      })

      it('legacy mode (maxPriorityFee==maxFeePerGas) should not use "basefee" opcode', async function () {
        const op = await fillAndSign({
          sender: account.address,
          callData: accountExecFromEntryPoint.data,
          maxPriorityFeePerGas: 10e9,
          maxFeePerGas: 10e9,
          verificationGasLimit: 1e6,
          callGasLimit: 1e6
        }, accountOwner, entryPoint)
        const beneficiaryAddress = createAddress()

        await fundVtho(op.sender)

        // (gasLimit, to prevent estimateGas to fail on missing maxFeePerGas, see above..)
        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 1e7
        }).then(async t => await t.wait())

        const ops = await debugTransaction(rcpt.transactionHash).then(tx => tx.structLogs.map(op => op.op))
        expect(ops).to.include('GAS')
        expect(ops).to.not.include('BASEFEE')
      })

      it('if account has a deposit, it should use it to pay', async function () {

        // Send some VTHO to account
        await vtho.transfer(account.address, BigNumber.from(ONE_ETH));
        // We can't run this since it has to be done via the entryPoint
        // await account.deposit(ONE_ETH)

        let sendVTHOCallData = await account.populateTransaction.deposit(ONE_ETH);

        const depositVTHOOp = await fillAndSign({
          sender: account.address,
          callData: sendVTHOCallData.data,
          verificationGasLimit: 1e6,
          callGasLimit: 1e6
        }, accountOwner, entryPoint);

        var beneficiaryAddress = createRandomAddress()

        const ret = await entryPoint.handleOps([depositVTHOOp], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 1e7
        }).then(async t => await t.wait())

        var beneficiaryAddress = createRandomAddress()

        const op = await fillAndSign({
          sender: account.address,
          callData: accountExecFromEntryPoint.data,
          verificationGasLimit: 1e6,
          callGasLimit: 1e6
        }, accountOwner, entryPoint)
        
        const countBefore = await counter.counters(account.address)
        // for estimateGas, must specify maxFeePerGas, otherwise our gas check fails
        console.log('  == est gas=', await entryPoint.estimateGas.handleOps([op], beneficiaryAddress, { maxFeePerGas: 1e9 }).then(tostr))

        const balBefore = await getBalance(account.address)
        const depositBefore = await entryPoint.balanceOf(account.address)
        // must specify at least one of maxFeePerGas, gasLimit
        // (gasLimit, to prevent estimateGas to fail on missing maxFeePerGas, see above..)
        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 1e7
        }).then(async t => await t.wait())

        const countAfter = await counter.counters(account.address)
        expect(countAfter.toNumber()).to.equal(countBefore.toNumber() + 1)
        console.log('rcpt.gasUsed=', rcpt.gasUsed.toString(), rcpt.transactionHash)

        const balAfter = await getBalance(account.address)
        const depositAfter = await entryPoint.balanceOf(account.address)
        expect(balAfter).to.equal(balBefore, 'should pay from stake, not balance')
        const depositUsed = depositBefore.sub(depositAfter)
        expect(await vtho.balanceOf(beneficiaryAddress)).to.equal(depositUsed)

        // await calcGasUsage(rcpt, entryPoint, beneficiaryAddress)
      })

      it('should pay for reverted tx', async () => {
        const op = await fillAndSign({
          sender: account.address,
          callData: '0xdeadface',
          verificationGasLimit: 1e6,
          callGasLimit: 1e6
        }, accountOwner, entryPoint)
        const beneficiaryAddress = createAddress()

        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 1e7
        }).then(async t => await t.wait())

        // const [log] = await entryPoint.queryFilter(entryPoint.filters.UserOperationEvent(), rcpt.blockHash)
        // expect(log.args.success).to.eq(false)
        expect(await vtho.balanceOf(beneficiaryAddress)).to.be.gte(1)
      })

      it('#handleOp (single)', async () => {
        const beneficiaryAddress = createAddress()

        const op = await fillAndSign({
          sender: account.address,
          callData: accountExecFromEntryPoint.data
        }, accountOwner, entryPoint)

        const countBefore = await counter.counters(account.address)
        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          gasLimit: 1e7
        }).then(async t => await t.wait())
        const countAfter = await counter.counters(account.address)
        expect(countAfter.toNumber()).to.equal(countBefore.toNumber() + 1)

        console.log('rcpt.gasUsed=', rcpt.gasUsed.toString(), rcpt.transactionHash)
        // await calcGasUsage(rcpt, entryPoint, beneficiaryAddress)
      })

      it('should fail to call recursively into handleOps', async () => {
        const beneficiaryAddress = createAddress()

        const callHandleOps = entryPoint.interface.encodeFunctionData('handleOps', [[], beneficiaryAddress])
        const execHandlePost = account.interface.encodeFunctionData('execute', [entryPoint.address, 0, callHandleOps])
        const op = await fillAndSign({
          sender: account.address,
          callData: execHandlePost
        }, accountOwner, entryPoint)

        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          gasLimit: 1e7
        }).then(async r => r.wait())

        const error = rcpt.events?.find(ev => ev.event === 'UserOperationRevertReason')
        expect(decodeRevertReason(error?.args?.revertReason)).to.eql('Error(ReentrancyGuard: reentrant call)', 'execution of handleOps inside a UserOp should revert')
      })
      it('should report failure on insufficient verificationGas after creation', async () => {
        const op0 = await fillAndSign({
          sender: account.address,
          verificationGasLimit: 5e6
        }, accountOwner, entryPoint)
        // must succeed with enough verification gas
        await expect(entryPoint.callStatic.simulateValidation(op0))
          .to.revertedWith('ValidationResult')

        const op1 = await fillAndSign({
          sender: account.address,
          verificationGasLimit: 1000
        }, accountOwner, entryPoint)
        await expect(entryPoint.callStatic.simulateValidation(op1))
          .to.revertedWith('AA23 reverted (or OOG)')
      })
    })

    describe('create account', () => {
      if (process.env.COVERAGE != null) {
        return
      }
      let createOp: UserOperation
      const beneficiaryAddress = createAddress() // 1

      it('should reject create if sender address is wrong', async () => {
        const op = await fillAndSign({
          initCode: getAccountInitCode(accountOwner.address, simpleAccountFactory),
          verificationGasLimit: 2e6,
          sender: '0x'.padEnd(42, '1')
        }, accountOwner, entryPoint)

        await expect(entryPoint.callStatic.handleOps([op], beneficiaryAddress, {
          gasLimit: 1e7
        })).to.revertedWith('AA14 initCode must return sender')
      })

      it('should reject create if account not funded', async () => {
        const op = await fillAndSign({
          initCode: getAccountInitCode(accountOwner.address, simpleAccountFactory, 100),
          verificationGasLimit: 2e6
        }, accountOwner, entryPoint)

        expect(await ethers.provider.getBalance(op.sender)).to.eq(0)

        await expect(entryPoint.callStatic.handleOps([op], beneficiaryAddress, {
          gasLimit: 1e7,
          gasPrice: await ethers.provider.getGasPrice()
        })).to.revertedWith('didn\'t pay prefund')

        // await expect(await ethers.provider.getCode(op.sender).then(x => x.length)).to.equal(2, "account exists before creation")
      })

      it('should succeed to create account after prefund', async () => {
        const salt = getRandomInt(1, 2147483648);
        const preAddr = await getAccountAddress(accountOwner.address, simpleAccountFactory, salt)
        
        await fund(preAddr) // send VET
        await vtho.transfer(preAddr, BigNumber.from(ONE_HUNDERD_VTHO)); // send VTHO
        // Fund preAddr through EntryPoint
        await vtho.approve(entryPoint.address, BigNumber.from(ONE_HUNDERD_VTHO));
        await entryPoint.depositAmountTo(preAddr, BigNumber.from(ONE_HUNDERD_VTHO));


        createOp = await fillAndSign({
          initCode: getAccountInitCode(accountOwner.address, simpleAccountFactory, salt),
          callGasLimit: 1e6,
          verificationGasLimit: 2e6

        }, accountOwner, entryPoint)

        await expect(await ethers.provider.getCode(preAddr).then(x => x.length)).to.equal(2, 'account exists before creation')
        const ret = await entryPoint.handleOps([createOp], beneficiaryAddress, {
          gasLimit: 1e7
        })
        const rcpt = await ret.wait()
        const hash = await entryPoint.getUserOpHash(createOp)
        await expect(ret).to.emit(entryPoint, 'AccountDeployed')
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          .withArgs(hash, createOp.sender, toChecksumAddress(createOp.initCode.toString().slice(0, 42)), AddressZero)

        // await calcGasUsage(rcpt!, entryPoint, beneficiaryAddress)
      })

      it('should reject if account already created', async function () {
        
        const salt = 20
        const preAddr = await getAccountAddress(accountOwner.address, simpleAccountFactory, salt)
        
        await fund(preAddr) // send VET
        await vtho.transfer(preAddr, BigNumber.from(ONE_HUNDERD_VTHO)); // send VTHO
        // Fund preAddr through EntryPoint
        await vtho.approve(entryPoint.address, BigNumber.from(ONE_HUNDERD_VTHO));
        await entryPoint.depositAmountTo(preAddr, BigNumber.from(ONE_HUNDERD_VTHO));


        createOp = await fillAndSign({
          initCode: getAccountInitCode(accountOwner.address, simpleAccountFactory, salt),
          callGasLimit: 1e6,
          verificationGasLimit: 2e6

        }, accountOwner, entryPoint)

        // If account already exists don't deploy it
        if (await ethers.provider.getCode(preAddr).then(x => x.length) !== 2) {
          const ret = await entryPoint.handleOps([createOp], beneficiaryAddress, {
            gasLimit: 1e7
          })
        }
      
        createOp = await fillAndSign({
          initCode: getAccountInitCode(accountOwner.address, simpleAccountFactory, salt),
          callGasLimit: 1e6,
          verificationGasLimit: 2e6
        }, accountOwner, entryPoint)

       expect(entryPoint.callStatic.handleOps([createOp], beneficiaryAddress, {
          gasLimit: 1e7
        })).to.revertedWith('sender already constructed')
      })
    })

    describe('batch multiple requests', function () {
      this.timeout(200000)
      if (process.env.COVERAGE != null) {
        return
      }
      /**
       * attempt a batch:
       * 1. create account1 + "initialize" (by calling counter.count())
       * 2. account2.exec(counter.count()
       *    (account created in advance)
       */
      let counter: TestCounter
      let accountExecCounterFromEntryPoint: PopulatedTransaction
      const beneficiaryAddress = createAddress()
      const accountOwner1 = createAccountOwner()
      let account1: string
      const accountOwner2 = createAccountOwner()
      let account2: SimpleAccount

      before('before', async () => {
        let testCounterContract = await TestCounterT.new();
        counter = await TestCounter__factory.connect(testCounterContract.address, ethersSigner);
        const count = await counter.populateTransaction.count()
        accountExecCounterFromEntryPoint = await account.populateTransaction.execute(counter.address, 0, count.data!)

        const salt = getRandomInt(1, 2147483648);

        account1 = await getAccountAddress(accountOwner1.address, simpleAccountFactory, salt);
        ({ proxy: account2 } = await createRandomAccount(ethersSigner, await accountOwner2.getAddress()))
        
        await fund(account1)
        await fundVtho(account1)
        await fund(account2.address)
        await fundVtho(account2.address)

        // execute and increment counter
        const op1 = await fillAndSign({
          initCode: getAccountInitCode(accountOwner1.address, simpleAccountFactory, salt),
          callData: accountExecCounterFromEntryPoint.data,
          callGasLimit: 2e6,
          verificationGasLimit: 2e6
        }, accountOwner1, entryPoint)

        const op2 = await fillAndSign({
          callData: accountExecCounterFromEntryPoint.data,
          sender: account2.address,
          callGasLimit: 2e6,
          verificationGasLimit: 76000
        }, accountOwner2, entryPoint)

        await entryPoint.callStatic.simulateValidation(op2, { gasPrice: 1e9 }).catch(simulationResultCatch)

        await fund(op1.sender)
        await fundVtho(op1.sender)
        
        await fund(account2.address)
        await fundVtho(account2.address)


        let res = await entryPoint.handleOps([op1!, op2], beneficiaryAddress, {gasLimit: 1e7, gasPrice: 1e9})//.catch((rethrow())).then(async r => r!.wait())
        // console.log(ret.events!.map(e=>({ev:e.event, ...objdump(e.args!)})))
      })
      it('should execute', async () => {
        expect(await counter.counters(account1)).equal(1)
        expect(await counter.counters(account2.address)).equal(1)
      })
      it('should pay for tx', async () => {
        // const cost1 = prebalance1.sub(await ethers.provider.getBalance(account1))
        // const cost2 = prebalance2.sub(await ethers.provider.getBalance(account2.address))
        // console.log('cost1=', cost1)
        // console.log('cost2=', cost2)
      })
    })

    describe('aggregation tests', () => {
      const beneficiaryAddress = createAddress()
      let aggregator: TestSignatureAggregator
      let aggAccount: TestAggregatedAccount
      let aggAccount2: TestAggregatedAccount

      before(async () => {
        let aggregatorContract = await TestSignatureAggregatorT.new();
        const signer2 = ethers.provider.getSigner(2)
        aggregator = TestSignatureAggregator__factory.connect(aggregatorContract.address, signer2);
        // aggregator = await new TestSignatureAggregator__factory(ethersSigner).deploy()
        // aggAccount = await new TestAggregatedAccount__factory(ethersSigner).deploy(entryPoint.address, aggregator.address)
        let aggAccountContract = await TestAggregatedAccountT.new(entryPoint.address, aggregator.address)
        aggAccount = TestAggregatedAccount__factory.connect(aggAccountContract.address, ethersSigner);
        // aggAccount2 = await new TestAggregatedAccount__factory(ethersSigner).deploy(entryPoint.address, aggregator.address)
        let aggAccount2Contract = await TestAggregatedAccountT.new(entryPoint.address, aggregator.address)
        aggAccount2 = TestAggregatedAccount__factory.connect(aggAccount2Contract.address, ethersSigner);
        
        await ethersSigner.sendTransaction({ to: aggAccount.address, value: parseEther('0.1') })
        await fundVtho(aggAccount.address)
        await ethersSigner.sendTransaction({ to: aggAccount2.address, value: parseEther('0.1') })
        await fundVtho(aggAccount2.address)

      })
      it('should fail to execute aggregated account without an aggregator', async () => {
        const userOp = await fillAndSign({
          sender: aggAccount.address
        }, accountOwner, entryPoint)

        // no aggregator is kind of "wrong aggregator"
        await expect(entryPoint.callStatic.handleOps([userOp], beneficiaryAddress)).to.revertedWith('AA24 signature error')
      })
      it('should fail to execute aggregated account with wrong aggregator', async () => {
        const userOp = await fillAndSign({
          sender: aggAccount.address
        }, accountOwner, entryPoint)

        const wrongAggregator = await TestSignatureAggregatorT.new()
        const sig = HashZero

        await expect(entryPoint.callStatic.handleAggregatedOps([{
          userOps: [userOp],
          aggregator: wrongAggregator.address,
          signature: sig
        }], beneficiaryAddress)).to.revertedWith('AA24 signature error')
      })

      it('should reject non-contract (address(1)) aggregator', async () => {
        // this is just sanity check that the compiler indeed reverts on a call to "validateSignatures()" to nonexistent contracts
        const address1 = hexZeroPad('0x1', 20)
        const aggAccount1 = await TestAggregatedAccountT.new(entryPoint.address, address1)

        const userOp = await fillAndSign({
          sender: aggAccount1.address,
          maxFeePerGas: 0
        }, accountOwner, entryPoint)

        const sig = HashZero

        expect(await entryPoint.handleAggregatedOps([{
          userOps: [userOp],
          aggregator: address1,
          signature: sig
        }], beneficiaryAddress).catch(e => e.reason))
          .to.match(/invalid aggregator/)
        // (different error in coverage mode (because of different solidity settings)
      })

      it('should fail to execute aggregated account with wrong agg. signature', async () => {
        const userOp = await fillAndSign({
          sender: aggAccount.address
        }, accountOwner, entryPoint)

        const wrongSig = hexZeroPad('0x123456', 32)
        const aggAddress: string = aggregator.address
        await expect(
          entryPoint.callStatic.handleAggregatedOps([{
            userOps: [userOp],
            aggregator: aggregator.address,
            signature: wrongSig
          }], beneficiaryAddress)).to.revertedWith(`SignatureValidationFailed`)
      })

      it('should run with multiple aggregators (and non-aggregated-accounts)', async () => {
        const aggregator3 = await TestSignatureAggregatorT.new()
        const aggAccount3 = await TestAggregatedAccountT.new(entryPoint.address, aggregator3.address)
        await ethersSigner.sendTransaction({ to: aggAccount3.address, value: parseEther('0.1') })

        await fundVtho(aggAccount3.address);

        const userOp1 = await fillAndSign({
          sender: aggAccount.address
        }, accountOwner, entryPoint)
        const userOp2 = await fillAndSign({
          sender: aggAccount2.address
        }, accountOwner, entryPoint)
        const userOp_agg3 = await fillAndSign({
          sender: aggAccount3.address
        }, accountOwner, entryPoint)
        const userOp_noAgg = await fillAndSign({
          sender: account.address
        }, accountOwner, entryPoint)

        // extract signature from userOps, and create aggregated signature
        // (not really required with the test aggregator, but should work with any aggregator
        const sigOp1 = await aggregator.validateUserOpSignature(userOp1)
        const sigOp2 = await aggregator.validateUserOpSignature(userOp2)
        userOp1.signature = sigOp1
        userOp2.signature = sigOp2
        const aggSig = await aggregator.aggregateSignatures([userOp1, userOp2]) // reverts here

        const aggInfos = [{
          userOps: [userOp1, userOp2],
          aggregator: aggregator.address,
          signature: aggSig
        }, {
          userOps: [userOp_agg3],
          aggregator: aggregator3.address,
          signature: HashZero
        }, {
          userOps: [userOp_noAgg],
          aggregator: AddressZero,
          signature: '0x'
        }]
        const rcpt = await entryPoint.handleAggregatedOps(aggInfos, beneficiaryAddress, { gasLimit: 3e6 }).then(async ret => ret.wait())
        const events = rcpt.events?.map((ev: Event) => {
          if (ev.event === 'UserOperationEvent') {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            return `userOp(${ev.args?.sender})`
          }
          if (ev.event === 'SignatureAggregatorChanged') {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            return `agg(${ev.args?.aggregator})`
          } else return null
        }).filter(ev => ev != null)
        // expected "SignatureAggregatorChanged" before every switch of aggregator
        expect(events).to.eql([
          `agg(${aggregator.address})`,
          `userOp(${userOp1.sender})`,
          `userOp(${userOp2.sender})`,
          `agg(${aggregator3.address})`,
          `userOp(${userOp_agg3.sender})`,
          `agg(${AddressZero})`,
          `userOp(${userOp_noAgg.sender})`,
          `agg(${AddressZero})`
        ])
      })

      describe('execution ordering', () => {
        let userOp1: UserOperation
        let userOp2: UserOperation
        before(async () => {
          userOp1 = await fillAndSign({
            sender: aggAccount.address
          }, accountOwner, entryPoint)
          userOp2 = await fillAndSign({
            sender: aggAccount2.address
          }, accountOwner, entryPoint)
          userOp1.signature = '0x'
          userOp2.signature = '0x'
        })

        context('create account', () => {
          let initCode: BytesLike
          let addr: string
          let userOp: UserOperation
          before(async () => {
            const factoryContract = await TestAggregatedAccountFactoryT.new(entryPoint.address, aggregator.address)
            const factory = TestAggregatedAccountFactory__factory.connect(factoryContract.address, ethersSigner);
            initCode = await getAggregatedAccountInitCode(entryPoint.address, factory)
            addr = await entryPoint.callStatic.getSenderAddress(initCode).catch(e => e.errorArgs.sender)
            await fundVtho(addr)
            await ethersSigner.sendTransaction({ to: addr, value: parseEther('0.1') })
            userOp = await fillAndSign({
              initCode
            }, accountOwner, entryPoint)

          })
          it('simulateValidation should return aggregator and its stake', async () => {
            await vtho.approve(aggregator.address, TWO_ETH);
            let tx = await aggregator.addStake(entryPoint.address, 3, TWO_ETH , {gasLimit: 1e7})
            const { aggregatorInfo } = await entryPoint.callStatic.simulateValidation(userOp).catch(simulationResultWithAggregationCatch)
            expect(aggregatorInfo.aggregator).to.equal(aggregator.address)
            expect(aggregatorInfo.stakeInfo.stake).to.equal(TWO_ETH)
            expect(aggregatorInfo.stakeInfo.unstakeDelaySec).to.equal(3)
          })
          it('should create account in handleOps', async () => {
            await aggregator.validateUserOpSignature(userOp)
            const sig = await aggregator.aggregateSignatures([userOp])
            await entryPoint.handleAggregatedOps([{
              userOps: [{ ...userOp, signature: '0x' }],
              aggregator: aggregator.address,
              signature: sig
            }], beneficiaryAddress, { gasLimit: 3e6 })
          })
        })
      })
    })

    describe('with paymaster (account with no eth)', () => {
      let paymaster: TestPaymasterAcceptAll
      let counter: TestCounter
      let paymasterAddress: string;
      let accountExecFromEntryPoint: PopulatedTransaction
      const account2Owner = createAccountOwner()

      before(async () => {
        // paymaster = await new TestPaymasterAcceptAll__factory(ethersSigner).deploy(entryPoint.address)
        let paymasterContract = await TestPaymasterAcceptAllT.new(entryPoint.address)
        paymaster = TestPaymasterAcceptAll__factory.connect(paymasterContract.address, ethersSigner);
        paymasterAddress = paymasterContract.address;
        // Approve VTHO to paymaster before adding stake
        await vtho.approve(paymasterContract.address, ONE_HUNDERD_VTHO);
        await paymaster.addStake(globalUnstakeDelaySec, paymasterStake, {gasLimit: 1e7})
        let counterContract = await TestCounterT.new()
        counter = TestCounter__factory.connect(counterContract.address, ethersSigner);
        const count = await counter.populateTransaction.count()
        accountExecFromEntryPoint = await account.populateTransaction.execute(counter.address, 0, count.data!)
      })

      it('should fail with nonexistent paymaster', async () => {
        const pm = createAddress()
        const op = await fillAndSign({
          paymasterAndData: pm,
          callData: accountExecFromEntryPoint.data,
          initCode: getAccountInitCode(account2Owner.address, simpleAccountFactory),
          verificationGasLimit: 3e6,
          callGasLimit: 1e6
        }, account2Owner, entryPoint)
        await expect(entryPoint.callStatic.simulateValidation(op)).to.revertedWith('"AA30 paymaster not deployed"')
      })

      it('should fail if paymaster has no deposit', async function () {
        const op = await fillAndSign({
          paymasterAndData: paymaster.address,
          callData: accountExecFromEntryPoint.data,
          initCode: getAccountInitCode(account2Owner.address, simpleAccountFactory, getRandomInt(1, 2147483648)),

          verificationGasLimit: 3e6,
          callGasLimit: 1e6
        }, account2Owner, entryPoint)
        const beneficiaryAddress = createAddress()
        await expect(entryPoint.callStatic.handleOps([op], beneficiaryAddress)).to.revertedWith('"AA31 paymaster deposit too low"')
      })

      it('paymaster should pay for tx', async function () {
        
        let paymasterContract = await TestPaymasterAcceptAllT.new(entryPoint.address)
        const paymaster = TestPaymasterAcceptAll__factory.connect(paymasterContract.address, ethersSigner);

        await fundVtho(paymaster.address)
        await paymaster.deposit(ONE_ETH, {gasLimit: 1e7})

        let balanceBefore = await entryPoint.balanceOf(paymaster.address);
        // console.log("Balance Before", balanceBefore)

        const op = await fillAndSign({
          paymasterAndData: paymaster.address,
          callData: accountExecFromEntryPoint.data,
          initCode: getAccountInitCode(account2Owner.address, simpleAccountFactory, getRandomInt(1, 2147483648))
        }, account2Owner, entryPoint)
        const beneficiaryAddress = createRandomAddress()

        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {gasLimit: 1e7}).then(async t => t.wait())

        // const { actualGasCost } = await calcGasUsage(rcpt, entryPoint, beneficiaryAddress)
        let balanceAfter = await entryPoint.balanceOf(paymaster.address)
        const paymasterPaid = balanceBefore.sub(balanceAfter);
        expect(paymasterPaid.toNumber()).to.greaterThan(0)
      })
      it('simulateValidation should return paymaster stake and delay', async () => {

        // await fundVtho(paymasterAddress);
        let paymasterContract = await TestPaymasterAcceptAllT.new(entryPoint.address)
        const paymaster = TestPaymasterAcceptAll__factory.connect(paymasterContract.address, ethersSigner);

        const vtho = ERC20__factory.connect(config.VTHOAddress, ethersSigner);

        // Vtho uses the same signer as paymaster
        await vtho.approve(paymasterContract.address, ONE_THOUSAND_VTHO)
        await paymaster.addStake(2, paymasterStake, {gasLimit: 1e7})
        await paymaster.deposit(ONE_HUNDERD_VTHO, {gasLimit: 1e7})

        const anOwner = createRandomAccountOwner()
        const op = await fillAndSign({
          paymasterAndData: paymaster.address,
          callData: accountExecFromEntryPoint.data,
          callGasLimit: BigNumber.from(1234567),
          verificationGasLimit: BigNumber.from(1234567),
          initCode: getAccountInitCode(anOwner.address, simpleAccountFactory, getRandomInt(1, 2147483648))
        }, anOwner, entryPoint) 

        const { paymasterInfo } = await entryPoint.callStatic.simulateValidation(op, {gasLimit: 1e7}).catch(simulationResultCatch)
        const {
          stake: simRetStake,
          unstakeDelaySec: simRetDelay
        } = paymasterInfo

        expect(simRetStake).to.eql(paymasterStake)
        expect(simRetDelay).to.eql(globalUnstakeDelaySec)
      })
    })

    describe('Validation time-range', () => {
      const beneficiary = createAddress()
      let account: TestExpiryAccount
      let now: number
      let sessionOwner: Wallet
      before('init account with session key', async () => {
        // create a test account. The primary owner is the global ethersSigner, so that we can easily add a temporaryOwner, below
        // account = await new TestExpiryAccount__factory(ethersSigner).deploy(entryPoint.address)
        account =  await TestExpiryAccountT.new(entryPoint.address);
        await account.initialize(await ethersSigner.getAddress())
        await ethersSigner.sendTransaction({ to: account.address, value: parseEther('0.1') })
        now = await ethers.provider.getBlock('latest').then(block => block.timestamp)
        sessionOwner = createAccountOwner()
        await account.addTemporaryOwner(sessionOwner.address, 100, now + 60)
      })

      describe('validateUserOp time-range', function () {
        it('should accept non-expired owner', async () => {
          await fundVtho(account.address);
          const userOp = await fillAndSign({
            sender: account.address
          }, sessionOwner, entryPoint)
          const ret = await entryPoint.callStatic.simulateValidation(userOp).catch(simulationResultCatch)
          expect(ret.returnInfo.validUntil).to.eql(now + 60)
          expect(ret.returnInfo.validAfter).to.eql(100)
        })

        it('should not reject expired owner', async () => {
          await fundVtho(account.address)
          const expiredOwner = createAccountOwner()
          await account.addTemporaryOwner(expiredOwner.address, 123, now - 60)
          const userOp = await fillAndSign({
            sender: account.address
          }, expiredOwner, entryPoint)
          const ret = await entryPoint.callStatic.simulateValidation(userOp).catch(simulationResultCatch)
          expect(ret.returnInfo.validUntil).eql(now - 60)
          expect(ret.returnInfo.validAfter).to.eql(123)
        })
      })

      describe('validatePaymasterUserOp with deadline', function () {
        let paymaster: TestExpirePaymaster
        let now: number
        before('init account with session key', async function () {
          // this.timeout(20000)
          await new Promise(r => setTimeout(r, 20000));
          // Deploy Paymaster
          let paymasterContract = await TestExpirePaymasterT.new(entryPoint.address)
          paymaster = TestExpirePaymaster__factory.connect(paymasterContract.address, ethersSigner);
           // Approve VTHO to paymaster before adding stake
           await fundVtho(paymasterContract.address, ONE_HUNDERD_VTHO);

          await paymaster.addStake(1, paymasterStake , {gasLimit: 1e7})
          await paymaster.deposit(parseEther('0.1'), {gasLimit: 1e7})
          now = await ethers.provider.getBlock('latest').then(block => block.timestamp)
        })

        it('should accept non-expired paymaster request', async () => {
          const timeRange = defaultAbiCoder.encode(['uint48', 'uint48'], [123, now + 60])
          await fundVtho(account.address);
          const userOp = await fillAndSign({
            sender: account.address,
            paymasterAndData: hexConcat([paymaster.address, timeRange])
          }, createAccountOwner(), entryPoint)
          const ret = await entryPoint.callStatic.simulateValidation(userOp).catch(simulationResultCatch)
          expect(ret.returnInfo.validUntil).to.eql(now + 60)
          expect(ret.returnInfo.validAfter).to.eql(123)
        })

        it('should not reject expired paymaster request', async () => {
          const timeRange = defaultAbiCoder.encode(['uint48', 'uint48'], [321, now - 60])
          const userOp = await fillAndSign({
            sender: account.address,
            paymasterAndData: hexConcat([paymaster.address, timeRange])
          }, createAccountOwner(), entryPoint)
          const ret = await entryPoint.callStatic.simulateValidation(userOp).catch(simulationResultCatch)
          expect(ret.returnInfo.validUntil).to.eql(now - 60)
          expect(ret.returnInfo.validAfter).to.eql(321)
        })

        // helper method
        async function createOpWithPaymasterParams (owner: Wallet, after: number, until: number): Promise<UserOperation> {
          const timeRange = defaultAbiCoder.encode(['uint48', 'uint48'], [after, until])
          return await fillAndSign({
            sender: account.address,
            paymasterAndData: hexConcat([paymaster.address, timeRange])
          }, owner, entryPoint)
        }

        describe('time-range overlap of paymaster and account should intersect', () => {
          let owner: Wallet
          before(async () => {
            owner = createAccountOwner()
            await account.addTemporaryOwner(owner.address, 100, 500)
          })

          async function simulateWithPaymasterParams (after: number, until: number): Promise<any> {
            const userOp = await createOpWithPaymasterParams(owner, after, until)
            const ret = await entryPoint.callStatic.simulateValidation(userOp).catch(simulationResultCatch)
            return ret.returnInfo
          }

          // sessionOwner has a range of 100.. now+60
          it('should use lower "after" value of paymaster', async () => {
            expect((await simulateWithPaymasterParams(10, 1000)).validAfter).to.eql(100)
          })
          it('should use lower "after" value of account', async () => {
            expect((await simulateWithPaymasterParams(200, 1000)).validAfter).to.eql(200)
          })
          it('should use higher "until" value of paymaster', async () => {
            expect((await simulateWithPaymasterParams(10, 400)).validUntil).to.eql(400)
          })
          it('should use higher "until" value of account', async () => {
            expect((await simulateWithPaymasterParams(200, 600)).validUntil).to.eql(500)
          })

          it('handleOps should revert on expired paymaster request', async () => {
            const userOp = await createOpWithPaymasterParams(sessionOwner, now + 100, now + 200)
            await expect(entryPoint.callStatic.handleOps([userOp], beneficiary))
              .to.revertedWith('AA22 expired or not due')
          })
        })
      })
      describe('handleOps should abort on time-range', () => {
        it('should revert on expired account', async () => {
          const expiredOwner = createRandomAccountOwner()
          await account.addTemporaryOwner(expiredOwner.address, 1, 2)

          await fundVtho(account.address);

          const userOp = await fillAndSign({
            sender: account.address
          }, expiredOwner, entryPoint)
          await expect(entryPoint.callStatic.handleOps([userOp], beneficiary))
            .to.revertedWith('AA22 expired or not due')
        })


        // this test passed when running it individually but fails when its run alonside the other tests
        it('should revert on date owner', async () => {
          await fundVtho(account.address);

          const futureOwner = createRandomAccountOwner()
          await account.addTemporaryOwner(futureOwner.address, now + 1000, now + 2000)
          const userOp = await fillAndSign({
            sender: account.address
          }, futureOwner, entryPoint)
          await expect(entryPoint.callStatic.handleOps([userOp], beneficiary))
            .to.revertedWith('AA22 expired or not due')
        })
      })
    })
  })
})

function getRandomInt(min: any, max: any) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min);
}

