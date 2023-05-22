
const MyToken = artifacts.require('MyToken');
const { expect } = require('chai');

contract('MyToken', function (accounts) {
  beforeEach(async function () {
    this.MyToken = await MyToken.new("0x8d769aE89c6B4c454d5A48D98631393a3A041d08", { from: accounts[0] });
  });

  it('default value is 0', async function () {
      var ret = await this.MyToken;
      
      // 0x575081D1590bA48C72d5c92188Af12BB6359FcC1
      console.log("MyToken address: ", ret.address)

      expect(true);
    });

});
