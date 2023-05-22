
const MyToken = artifacts.require('MyToken');
const { expect } = require('chai');

contract('MyToken', function (accounts) {
  beforeEach(async function () {
    this.MyToken = await new MyToken("0x94D2D900A5bD556cD002E1c992ED8eb538B6a046");
  });

  it('default value is 0', async function () {
      var ret = await this.MyToken;
      
      // 0x575081D1590bA48C72d5c92188Af12BB6359FcC1
      console.log("MyToken address: ", ret.address)

      var balance1 = await ret.balanceOf("0x8d769aE89c6B4c454d5A48D98631393a3A041d08");
      var balance2 = await ret.balanceOf("0xA9295E3e0531A39b8625C987F76F54ece5E76aD0");
      var balance3 = await ret.balanceOf("0x7dE82CA858DdBeF45c875b7E7AcCd59007D1f227");
      console.log(balance1);
      console.log(balance2);
      console.log(await ret.symbol())
      expect(true);
    });

});
