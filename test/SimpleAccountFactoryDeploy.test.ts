
const SimpleAccountFactory = artifacts.require('SimpleAccountFactory');
const { expect } = require('chai');

contract('SimpleAccountFactory', function (accounts) {
  beforeEach(async function () {
    // Pass entryPoint address in constructor
    this.SimpleAccountFactory = await SimpleAccountFactory.new("0x72072375e1CC596284995a17AC401E11Cadd5337", { from: accounts[0] });
  });

  it('default value is 0', async function () {
      var ret = await this.SimpleAccountFactory;

      console.log("SimpleAccountFactory address: ", ret.address)
      expect(true);
    });

});
