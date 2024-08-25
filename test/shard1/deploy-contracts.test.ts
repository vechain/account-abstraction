import { artifacts, contract } from 'hardhat'

const TestUtil = artifacts.require('TestUtil')
const EntryPoint = artifacts.require('EntryPoint')
const SimpleAccountFactory = artifacts.require('SimpleAccountFactory')
const TokenPaymaster = artifacts.require('TokenPaymaster')

contract('Deployments', function (accounts) {
  it('Adresses', async function () {
    const testUtils = await TestUtil.new({ from: accounts[0] })
    const entryPoint = await EntryPoint.new({ from: accounts[0] })
    const simpleAccountFactory = await SimpleAccountFactory.new(entryPoint.address, { from: accounts[0] })

    const tokenPaymaster = await TokenPaymaster.new(simpleAccountFactory.address, 'ttt', entryPoint.address)

    const fakeSimpleAccountFactory = await SimpleAccountFactory.new(accounts[9], { from: accounts[0] })
    console.log('    TestUtils address:                ', testUtils.address)
    console.log('    EntryPoint address:               ', entryPoint.address)
    console.log('    SimpleAccountFactory address:     ', simpleAccountFactory.address)
    console.log('    FakeSimpleAccountFactory address: ', fakeSimpleAccountFactory.address)
    console.log('    TokenPaymaster address :          ', tokenPaymaster.address)
  })
})
