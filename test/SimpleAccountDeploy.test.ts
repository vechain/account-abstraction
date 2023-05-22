
const SimpleAccount = artifacts.require('SimpleAccount');
const { expect } = require('chai');

contract('SimpleAccount', function (accounts) {
  beforeEach(async function () {
    // Pass entryPoint address in constructor

    this.SimpleAccount = await SimpleAccount.new("0xED57c8cd8862fd29FAB2CdAc8B2262db756B5D3d", { from: accounts[0] });
  });

  it('default value is 0', async function () {
      var ret = await this.SimpleAccount;

      console.log("SimpleAccount address: ", ret.address)
      expect(true);
    });

});
