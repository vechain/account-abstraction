import { expect } from 'chai'
import { ethers } from 'hardhat'
import { EntryPoint, SimpleAccountFactory, SimpleAccountFactory__factory, TestUtil } from '../typechain'

const TestUtil = artifacts.require('TestUtil')
const EntryPoint = artifacts.require('EntryPoint')
const SimpleAccountFactory = artifacts.require('SimpleAccountFactory')
const { expect } = require('chai')

contract('Deployments', function (accounts) {
  let testUtils: TestUtil
  let entryPoint: EntryPoint
  let simpleAccountFactory: SimpleAccountFactory
  const provider = ethers.provider

  beforeEach('deploy all', async function () {
    testUtils = await TestUtil.new({ from: accounts[0] })
    entryPoint = await EntryPoint.new({ from: accounts[0] })
    simpleAccountFactory = await SimpleAccountFactory.new(entryPoint.address, { from: accounts[0] })
  })

  it('should deploy to known address', async () => {
    const factory = await SimpleAccountFactory__factory.connect(simpleAccountFactory.address, ethers.provider.getSigner())
    const simpleAccountAddress = await factory.getAddress(await ethers.provider.getSigner().getAddress(), 0)

    await factory.createAccount(await ethers.provider.getSigner().getAddress(), 0)

    // An account has been deployed at said address
    expect(await provider.getCode(simpleAccountAddress).then(code => code.length)).to.be.gt(2)
  })

  it('should deploy to different address based on salt', async () => {
    const factory = await SimpleAccountFactory__factory.connect(simpleAccountFactory.address, ethers.provider.getSigner())
    const simpleAccountAddress = await factory.getAddress(await ethers.provider.getSigner().getAddress(), 123)

    await factory.createAccount(await ethers.provider.getSigner().getAddress(), 123)

    // An account has been deployed at said address
    expect(await provider.getCode(simpleAccountAddress).then(code => code.length)).to.be.gt(2)
  })
})
