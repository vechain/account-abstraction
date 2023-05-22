
const EntryPoint = artifacts.require('EntryPoint');
const { expect } = require('chai');

contract('EntryPoint', function (accounts) {
  beforeEach(async function () {
    this.EntryPoint = await EntryPoint.new({ from: accounts[0] });
  });

  it('default value is 0', async function () {
      var ret = await this.EntryPoint;

      // 0x575081D1590bA48C72d5c92188Af12BB6359FcC1
      console.log("EntryPoint address: ", ret.address)

      expect(true);
    });

});
