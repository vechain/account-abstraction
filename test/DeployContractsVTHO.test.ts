import { artifacts } from "hardhat";

const EntryPoint = artifacts.require('EntryPoint');
const SimpleAccountFactory = artifacts.require('SimpleAccountFactory');
const MyPaymaster = artifacts.require('MyPaymaster');
const MyToken = artifacts.require('MyToken');
const { expect } = require('chai');


contract('Deployments', function (accounts) {
    it('Adresses', async function () {
        this.EntryPoint = await EntryPoint.new({ from: accounts[0] });
        this.SimpleAccountFactory = await SimpleAccountFactory.new(this.EntryPoint.address, { from: accounts[0] });
        this.MyPaymaster = await MyPaymaster.new(this.EntryPoint.address, {value: 1000000000000000000});

        // Sent VTHO Token
        const VTHO = await new MyToken("0x0000000000000000000000000000456E65726779");
        var balance = await VTHO.balanceOf(this.MyPaymaster.address);
        await VTHO.transfer(this.MyPaymaster.address, 1000000000000000)
        var balance = await VTHO.balanceOf(this.MyPaymaster.address);
        var result = await this.MyPaymaster.fundWithVTHO(100000000000000);
        var balance = await VTHO.balanceOf(this.MyPaymaster.address);

        // await this.MyPaymaster.deposit({ from: accounts[0], value: 10000 });

        const bundler = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
        // const [owner] = await ethers.getSigners();
        // await owner.sendTransaction({
        //     to: bundler,
        //     value: ethers.utils.parseEther('1.0')
        // })
// ​
        console.log("    Bundler address:              ", bundler)
        // // console.log("    Bundler balance:              ", await ethers.provider.getBalance(bundler))
        // console.log("    -------------------------------------------------------------------------")
        console.log("    SimpleAccountFactory address: ", this.SimpleAccountFactory.address)
        console.log("    MyPaymaster address:          ", this.MyPaymaster.address)
        console.log("    EntryPoint address:           ", this.EntryPoint.address)
    });
​
});