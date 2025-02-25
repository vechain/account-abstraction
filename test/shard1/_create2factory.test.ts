import { expect } from 'chai'
import { Contract } from 'ethers'
import { artifacts, contract, ethers } from 'hardhat'
import { EcdsaOwnershipRegistryModule, SmartAccount, SmartAccountFactory } from '../../typechain'
import { EntryPoint } from '../../typechain/contracts/core'
import { SimpleAccountFactory } from '../../typechain/contracts/samples'

const EntryPointArtifact: Contract = artifacts.require('contracts/core/EntryPoint.sol:EntryPoint')
const SimpleAccountFactoryArtifact: Contract = artifacts.require('contracts/samples/SimpleAccountFactory.sol:SimpleAccountFactory')
// const SimpleAccountArtifact: Contract = artifacts.require('contracts/samples/SimpleAccount.sol:SimpleAccount')
const SmartAccountArtifact: Contract = artifacts.require('contracts/smart-account/SmartAccount.sol:SmartAccount')
const SmartAccountFactoryArtifact: Contract = artifacts.require('contracts/smart-account/factory/SmartAccountFactory.sol:SmartAccountFactory')

const EcdsaOwnershipRegistryModuleArtifact: Contract = artifacts.require('EcdsaOwnershipRegistryModule')

contract('Factory', function (accounts) {
  let entryPoint: EntryPoint
  let simpleAccountFactory: SimpleAccountFactory
  // let simpleAccount: SimpleAccount
  let smartAccount: SmartAccount
  let smartAccountFactory: SmartAccountFactory
  let ecdsaModule: EcdsaOwnershipRegistryModule
  const provider = ethers.provider

  beforeEach('deploy all', async function () {
    entryPoint = await EntryPointArtifact.new({ from: accounts[0] })
    console.log('EntryPoint address', entryPoint.address)
    simpleAccountFactory = await SimpleAccountFactoryArtifact.new(entryPoint.address, { from: accounts[0] })
    console.log('SimpleAccountFactory address', simpleAccountFactory.address)
    // simpleAccount = await SimpleAccountArtifact.new(entryPoint.address, { from: accounts[0] })
    // console.log('SimpleAccount address', simpleAccount.address)
    // smartAccountFactory = await SmartAccountFactoryArtifact.new(simpleAccount.address, accounts[0], { from: accounts[0] })
    // console.log('SmartAccountFactory address', smartAccountFactory.address)

    smartAccount = await SmartAccountArtifact.new(entryPoint.address, { from: accounts[0] })
    console.log('SmartAccount address', smartAccount.address)
    smartAccountFactory = await SmartAccountFactoryArtifact.new(smartAccount.address, accounts[0], { from: accounts[0] })
    console.log('SmartAccountFactory address', smartAccountFactory.address)
    ecdsaModule = await EcdsaOwnershipRegistryModuleArtifact.new({ from: accounts[0] })
    console.log('EcdsaOwnershipRegistryModule address', ecdsaModule.address)
  })

  it('should deploy account using ECDSA validation module', async () => {
    const EcdsaOwnershipRegistryModule = await ethers.getContractFactory(
      'EcdsaOwnershipRegistryModule'
    )
    const ecdsaOwnershipSetupData =
    EcdsaOwnershipRegistryModule.interface.encodeFunctionData(
      'initForSmartAccount',
      [await provider.getSigner().getAddress()]
    )

    const smartAccountFactoryInstance = await ethers.getContractAt(
      'SmartAccountFactory',
      smartAccountFactory.address
    )
    const deploymentTx = await smartAccountFactoryInstance.deployAccount(
      ecdsaModule.address,
      ecdsaOwnershipSetupData
    )

    const receipt = await deploymentTx.wait()

    const deployedSmartAccountAddress = receipt.events?.filter(
      event => event.event === 'AccountCreationWithoutIndex'
    )[0].args?.[0]

    console.log('SmartAccount with ECDSA module address', smartAccount.address)

    const smartAccountInstance = await ethers.getContractAt(
      'SmartAccount',
      deployedSmartAccountAddress
    )
    expect(await smartAccountInstance.isModuleEnabled(ecdsaModule.address)).to.equal(
      true
    )
    expect(await ecdsaModule.getOwner(smartAccountInstance.address)).to.equal(
      await provider.getSigner().getAddress()
    )
  })

  // it('should deploy to known address', async () => {
  //   const factory = SimpleAccountFactory__factory.connect(simpleAccountFactory.address, ethers.provider.getSigner())
  //   const simpleAccountAddress = await factory.getAddress(await ethers.provider.getSigner().getAddress(), 0)

  //   await factory.createAccount(await ethers.provider.getSigner().getAddress(), 0)

  //   console.log('SimpleAccountKnown address', simpleAccountAddress)

  //   // An account has been deployed at said address
  //   expect(await provider.getCode(simpleAccountAddress).then(code => code.length)).to.be.gt(2)
  // })

  // it('should deploy to different address based on salt', async () => {
  //   const factory = SimpleAccountFactory__factory.connect(simpleAccountFactory.address, ethers.provider.getSigner())
  //   const simpleAccountAddress = await factory.getAddress(await ethers.provider.getSigner().getAddress(), 123)

  //   await factory.createAccount(await ethers.provider.getSigner().getAddress(), 123)

  //   console.log('SimpleAccountSalt address', simpleAccountAddress)

  //   // An account has been deployed at said address
  //   expect(await provider.getCode(simpleAccountAddress).then(code => code.length)).to.be.gt(2)
  // })
})
