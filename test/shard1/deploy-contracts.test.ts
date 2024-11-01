import { ethers } from 'hardhat'

describe('Deployments', function () {
  it('Adresses', async function () {
    const testUtilFactory = await ethers.getContractFactory('TestUtil')
    const testUtil = await testUtilFactory.deploy()
    const entryPointFactory = await ethers.getContractFactory('EntryPoint')
    const entryPoint = await entryPointFactory.deploy()
    const accountFactoryFactory = await ethers.getContractFactory('SimpleAccountFactory')
    const simpleAccountFactory = await accountFactoryFactory.deploy(entryPoint.address)
    await simpleAccountFactory.deployed()

    const tokenPaymasterFactory = await ethers.getContractFactory('TokenPaymaster')
    const tokenPaymaster = await tokenPaymasterFactory.deploy(simpleAccountFactory.address, 'ttt', entryPoint.address)
    await tokenPaymaster.deployed()

    const accounts = await ethers.provider.listAccounts()
    const fakeSimpleAccountFactory = await accountFactoryFactory.deploy(accounts[9])

    console.log('    TestUtil address:                ', testUtil.address)
    console.log('    EntryPoint address:               ', entryPoint.address)
    console.log('    SimpleAccountFactory address:     ', simpleAccountFactory.address)
    console.log('    FakeSimpleAccountFactory address: ', fakeSimpleAccountFactory.address)
    console.log('    TokenPaymaster address :          ', tokenPaymaster.address)
  })
})
