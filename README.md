Implementation of contracts for [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) account abstraction via alternative mempool.

This project is based on [eth-infinistism v0.6.0 implementation](https://github.com/eth-infinitism/account-abstraction/tree/abff2aca61a8f0934e533d0d352978055fddbd96).

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

# VeChain Specific Changes
The changes mainly concern VTHO support, as the gas unit that is refunded.

# Test using Thor Solo

The tests run using Docker Compose to bring up a Thor Solo instance. You should also install all dependencies first by running `yarn install`.

When using Docker Compose V1, please run the script:

```bash
yarn test:compose:v1
```

If you have Docker Compose V2, please run this instead:

```bash
yarn test:compose:v2
```

If you need to find out first which one is your version, please execute (V1 would be the below)

```bash
➜ docker-compose -v
docker-compose version 1.29.2, build 5becea4c
```

The test files are included in separate folders (`shard1`, `shard2`...) so we can parallelise the execution in the pipelines.

# Test on networks

**DISCLAIMER**: There are over a hundred tests in this repository. Further adjustments might be required in this case (for instance, make sure that the sender account is well-funded).

## Deploy contracts on Testnet
To deploy on testnet modify the `hardhat.config.ts` with the following

```ts
vechain_testnet: {
    url: VECHAIN_URL_TESTNET,
    accounts: {
        mnemonic: "your testnet mnemonic goes here"
    },
}
```

And run the deployment script
```bash
yarn hardhat test --network vechain_testnet shard1/deploy-contracts.test.ts
```

## Deploy contracts on Mainnet
To deploy on testnet modify the `hardhat.config.ts` with the following

```ts
vechain_mainnet: {
    url: VECHAIN_URL_MAINNET,
    accounts: {
        mnemonic: "your mainnet mnemonic goes here"
    },
}
```

And run the deployment script
```bash
yarn hardhat test --network vechain_mainnet shard1/deploy-contracts.test.ts
```

## Run tests on a network

Update [./test/config.ts](./test/config.ts) with the addresses of the deployed contracts and then for testnet:

```bash
yarn test:testnet
```

And for mainnet:
```bash
yarn test:mainnet
```


# Resources
- [Vitalik's post on account abstraction without Ethereum protocol changes](https://medium.com/infinitism/erc-4337-account-abstraction-without-ethereum-protocol-changes-d75c9d94dc4a)