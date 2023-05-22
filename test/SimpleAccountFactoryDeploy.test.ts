
const SimpleAccountFactory = artifacts.require('SimpleAccountFactory');
const { expect } = require('chai');

contract('SimpleAccountFactory', function (accounts) {
  beforeEach(async function () {
    // Pass entryPoint address in constructor
    this.SimpleAccountFactory = await SimpleAccountFactory.new("0x22c3601e3ffE9135ABc08F350D98AEE8b5928e1f", { from: accounts[0] });
  });

  it('default value is 0', async function () {
      var ret = await this.SimpleAccountFactory;

      console.log("SimpleAccountFactory address: ", ret.address)
      expect(true);
    });

});
