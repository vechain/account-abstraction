import '@nomiclabs/hardhat-etherscan'
import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import 'hardhat-dependency-compiler'
import 'hardhat-deploy'
import { HardhatUserConfig } from 'hardhat/config'

import '@nomiclabs/hardhat-truffle5'
import '@vechain/hardhat-ethers'
import { VECHAIN_URL_MAINNET, VECHAIN_URL_SOLO, VECHAIN_URL_TESTNET } from '@vechain/hardhat-vechain'
import '@vechain/hardhat-web3'

const shardNumber = process.env.shard

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers: [{
      version: '0.8.20',
      settings: {
        optimizer: { enabled: true, runs: 1000000 }
      }
    }]
  },
  networks: {
    vechain: {
      url: VECHAIN_URL_SOLO
    },
    vechain_testnet: {
      url: VECHAIN_URL_TESTNET,
      accounts: {
        mnemonic:
            'vivid any call mammal mosquito budget midnight expose spirit approve reject system',
        path: "m/44'/818'/0'/0",
        count: 3,
        initialIndex: 0,
        passphrase: 'vechainthor'
      }
    },
    vechain_mainnet: {
      url: VECHAIN_URL_MAINNET
    }
  },
  dependencyCompiler: {
    paths: ['@account-abstraction/contracts/core/EntryPoint.sol']
  },
  paths: {
    tests: shardNumber !== undefined && shardNumber !== null && shardNumber !== ''
      ? `./test/shard${shardNumber}`
      : './test'
  },
  mocha: {
    timeout: 180000
  }
}

export default config
