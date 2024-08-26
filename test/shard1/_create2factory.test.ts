import { expect } from 'chai'
import { artifacts, contract, ethers } from 'hardhat'
import { EntryPoint, SimpleAccountFactory, SimpleAccountFactory__factory } from '../../typechain'

const EntryPointArtifact = artifacts.require('EntryPoint')
const SimpleAccountFactoryArtifact = artifacts.require('SimpleAccountFactory')

contract('Factory', function (accounts) {
  let entryPoint: EntryPoint
  let simpleAccountFactory: SimpleAccountFactory
  const provider = ethers.provider

  beforeEach('deploy all', async function () {
    entryPoint = await EntryPointArtifact.new({ from: accounts[0] })
    simpleAccountFactory = await SimpleAccountFactoryArtifact.new(entryPoint.address, { from: accounts[0] })
  })

  it('should deploy to known address', async () => {
    const factory = SimpleAccountFactory__factory.connect(simpleAccountFactory.address, ethers.provider.getSigner())
    const simpleAccountAddress = await factory.getAddress(await ethers.provider.getSigner().getAddress(), 0)

    await factory.createAccount(await ethers.provider.getSigner().getAddress(), 0)

    // An account has been deployed at said address
    expect(await provider.getCode(simpleAccountAddress).then(code => code.length)).to.be.gt(2)
  })

  it('should deploy to different address based on salt', async () => {
    const factory = SimpleAccountFactory__factory.connect(simpleAccountFactory.address, ethers.provider.getSigner())
    const simpleAccountAddress = await factory.getAddress(await ethers.provider.getSigner().getAddress(), 123)

    await factory.createAccount(await ethers.provider.getSigner().getAddress(), 123)

    // An account has been deployed at said address
    expect(await provider.getCode(simpleAccountAddress).then(code => code.length)).to.be.gt(2)
  })
})
