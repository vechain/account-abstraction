
const MyPaymaster = artifacts.require('MyPaymaster');
const MyToken = artifacts.require('MyToken');
const { expect } = require('chai');

contract('MyPaymaster', function (accounts) {
  beforeEach(async function () {
    // Pass entryPoint address in constructor
    this.MyPaymaster = await MyPaymaster.new("0x156af466f5309022abc7E3472E8C1A4BF7bC1177");
  });

  it('default value is 0', async function () {
        console.log("MyPaymaster address: ", this.MyPaymaster.address)
      
        // Fund MyPaymster with VTHO
        // const VTHO = await new MyToken("0x0000000000000000000000000000456E65726779");
        // await VTHO.transfer(this.MyPaymaster.address, 1234)

        // var balance = await VTHO.balanceOf(this.MyPaymaster.address);

        // Instead of VET deposit VTHO to the EntryPoint
        // var result = await this.MyPaymaster.depositVTHO(1000000000000000);
        // console.log(result);

        expect(true);
    });

});
