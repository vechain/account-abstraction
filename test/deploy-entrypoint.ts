import { artifacts } from "hardhat";

const TestUtil = artifacts.require('TestUtil');
const EntryPoint = artifacts.require('EntryPoint');
const SimpleAccountFactory = artifacts.require('SimpleAccountFactory');
const SimpleAccount = artifacts.require('SimpleAccount');
const TokenPaymaster = artifacts.require('TokenPaymaster');
const { expect } = require('chai');

contract('Deployments', function (accounts) {
    it('Adresses', async function () {
        const entryPoint = await EntryPoint.new({ from: accounts[0] });
        console.log("    EntryPoint address:               ", entryPoint.address)
    });
});