import { expect } from 'chai'
import { ethers } from 'hardhat'
import { EntryPoint, SimpleAccountFactory, SimpleAccountFactory__factory } from '../../typechain'

describe('Factory', function () {
  let entryPoint: EntryPoint
  let simpleAccountFactory: SimpleAccountFactory
  const provider = ethers.provider

  beforeEach('deploy all', async function () {
    const entryPointFactory = await ethers.getContractFactory('EntryPoint')
    entryPoint = await entryPointFactory.deploy()
    const accountFactoryFactory = await ethers.getContractFactory('SimpleAccountFactory')
    simpleAccountFactory = await accountFactoryFactory.deploy(entryPoint.address)
    await simpleAccountFactory.deployed()
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
