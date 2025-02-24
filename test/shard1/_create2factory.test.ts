import { expect } from 'chai'
import { Contract } from 'ethers'
import { artifacts, contract, ethers } from 'hardhat'
import { EntryPoint } from '../../typechain/contracts/core'
import { SimpleAccountFactory } from '../../typechain/contracts/samples'
import { SimpleAccountFactory__factory } from '../../typechain/factories/contracts/samples'

const EntryPointArtifact: Contract = artifacts.require('contracts/core/EntryPoint.sol:EntryPoint')
const SimpleAccountFactoryArtifact: Contract = artifacts.require('contracts/samples/SimpleAccountFactory.sol:SimpleAccountFactory')

contract('Factory', function (accounts) {
  let entryPoint: EntryPoint
  let simpleAccountFactory: SimpleAccountFactory
  const provider = ethers.provider

  beforeEach('deploy all', async function () {
    entryPoint = await EntryPointArtifact.new({ from: accounts[0] })
    console.log('EntryPoint address', entryPoint.address)
    simpleAccountFactory = await SimpleAccountFactoryArtifact.new(entryPoint.address, { from: accounts[0] })
    console.log('SimpleAccountFactory address', simpleAccountFactory.address)
  })

  it('should deploy to known address', async () => {
    const factory = SimpleAccountFactory__factory.connect(simpleAccountFactory.address, ethers.provider.getSigner())
    const simpleAccountAddress = await factory.getAddress(await ethers.provider.getSigner().getAddress(), 0)

    await factory.createAccount(await ethers.provider.getSigner().getAddress(), 0)

    console.log('SimpleAccountKnown address', simpleAccountAddress)

    // An account has been deployed at said address
    expect(await provider.getCode(simpleAccountAddress).then(code => code.length)).to.be.gt(2)
  })

  it('should deploy to different address based on salt', async () => {
    const factory = SimpleAccountFactory__factory.connect(simpleAccountFactory.address, ethers.provider.getSigner())
    const simpleAccountAddress = await factory.getAddress(await ethers.provider.getSigner().getAddress(), 123)

    await factory.createAccount(await ethers.provider.getSigner().getAddress(), 123)

    console.log('SimpleAccountSalt address', simpleAccountAddress)

    // An account has been deployed at said address
    expect(await provider.getCode(simpleAccountAddress).then(code => code.length)).to.be.gt(2)
  })
})
