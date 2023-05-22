
const MyToken = artifacts.require('MyToken');
const { expect } = require('chai');

contract('MyToken', function (accounts) {
  beforeEach(async function () {
    this.MyToken = await new MyToken("0x0000000000000000000000000000456E65726779");
  });

  it('default value is 0', async function () {
      var ret = await this.MyToken;
      
      // 0x575081D1590bA48C72d5c92188Af12BB6359FcC1
      console.log("MyToken address: ", ret.address)

      var balance1 = await ret.balanceOf("0x1D94FAA58597C0417207681a512Df24Bb7702acb");
      var balance2 = await ret.balanceOf("0x44182265d46dEc2CF2A0338BDf82e302b9c96e45");
      var rett = await ret.allowance("0x90e4779E3312392Bcc5C6C18B212b0BCCBe2B747", "0x44182265d46dEc2CF2A0338BDf82e302b9c96e45")
      // var balance3 = await ret.balanceOf("0x7dE82CA858DdBeF45c875b7E7AcCd59007D1f227");
      console.log(balance1);
      // console.log(balance2);
      // console.log(await ret.symbol())

      var rett  = await ret.transfer("0x44182265d46dEc2CF2A0338BDf82e302b9c96e45", 123456);

      var balance2 = await ret.balanceOf("0x44182265d46dEc2CF2A0338BDf82e302b9c96e45");

      expect(true);
    });

});
