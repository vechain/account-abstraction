
const EntryPoint = artifacts.require('EntryPoint');
const { expect } = require('chai');

contract('EntryPoint', function (accounts) {
  beforeEach(async function () {
    this.EntryPoint = await new EntryPoint("0xDcc7db5AE3433901FC92E66EFFE9d37e86619132");
  });

  it('default value is 0', async function () {
      var ret = await this.EntryPoint;
      
      // 0x575081D1590bA48C72d5c92188Af12BB6359FcC1
      console.log("EntryPoint address: ", ret.address)

      var accountBalance = await ret.balanceOf("0x4ebCF852d352AAF0bcc671c048B51480d7Ae05c8");
      console.log(accountBalance);
      var paymasterBalance = await ret.balanceOf("0x9fff7E4E4911e5FE27ab5668DB9cA8E54F08b996");
      console.log(paymasterBalance);

      var paymasterDepositInfo = await ret.getDepositInfo("0x9fff7E4E4911e5FE27ab5668DB9cA8E54F08b996");
      console.log(paymasterDepositInfo)

      expect(true);
    });
    
});
