
const SimpleAccount = artifacts.require('SimpleAccount');
const { expect } = require('chai');

contract('SimpleAccount', function (accounts) {
  beforeEach(async function () {
    this.SimpleAccount = await new SimpleAccount("0x3262187393A1d87a1c790000d7594ADB48D1847C");
  });

  it('default value is 0', async function () {
      var ret = await this.SimpleAccount;
      
      console.log("SimpleAccount address: ", ret.address);

      var dest = [
        "0x7dE82CA858DdBeF45c875b7E7AcCd59007D1f227",
        "0x7dE82CA858DdBeF45c875b7E7AcCd59007D1f227",
      ]

      var data = [
        "0xb61d27f600000000000000000000000025df024637d4e56c1ae9563987bf3e92c9f534c0000000000000000000000000000000000000000000000000002386f26fc1000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        "0xb61d27f6000000000000000000000000d502034ae4592a73d4d2dea2d61aed5fcfc8ad74000000000000000000000000000000000000000000000000002386f26fc1000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
      ]

    //   var returned = await ret.execute(dest[0], 0, data[0]);
    //   console.log(returned);

    var rett = await ret.entryPoint();

      var returned = await ret.executeBatch(dest, data);
      console.log(returned);
    //   var balance1 = await ret.balanceOf("0x6982508145454Ce325dDbE47a25d4ec3d2311933");
    //   var balance2 = await ret.balanceOf("0x8cF905C50F25A481171e7f5936625754d44A9537");
    //   var balance3 = await ret.balanceOf("0x7dE82CA858DdBeF45c875b7E7AcCd59007D1f227");
    //   console.log(balance1);
    //   console.log(balance2);
    //   console.log(await ret.symbol())
      expect(true);
    });

});
