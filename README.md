Implementation of contracts for [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) account abstraction via alternative mempool.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

# Vechain Specific Changes
The changes mainly concern VTHO support, as the gas unit that is refunded.

# Test

## Deploy all on Solo

Make sure your `hardhat.config.ts` has the following line:

```ts
vechain: {
    url: VECHAIN_URL_SOLO
}
```


And then deploy all contracts (entryPoint included)
```bash
yarn hardhat test --network vechain test/deploy-contracts.test.ts
```

## Deploy EntryPoint on Testnet
To deploy on testnet modify the `hardhat.config.ts` with the following

```ts
vechain: {
    url: VECHAIN_URL_TESTNET,
    accounts: {
        mnemonic: "your testnet mnemonic goes here"
    },
}
```

And run the deployment script
```bash
yarn hardhat test --network vechain test/deploy-entrypoint.test.ts
```

## Deploy EntryPoint on Mainnet
To deploy on testnet modify the `hardhat.config.ts` with the following

```ts
vechain: {
    url: VECHAIN_URL_MAINNET,
    accounts: {
        mnemonic: "your mainnet mnemonic goes here"
    },
}
```

And run the deployment script
```bash
yarn hardhat test --network vechain test/deploy-entrypoint.test.ts
```


Update [./test/config.ts](./test/config.ts) with the addresses of the deployed contracts and

Run entryPoint tests:
```bash
yarn hardhat test test/entrypoint.test.ts --network vechain
```

Run paymaster tests:
```bash
yarn hardhat test test/paymaster.test.ts --network vechain
```

Run simple wallet tests:
```bash
yarn hardhat test test/simple-wallet.test.ts --network vechain
```

# Resources
- [Vitalik's post on account abstraction without Ethereum protocol changes](https://medium.com/infinitism/erc-4337-account-abstraction-without-ethereum-protocol-changes-d75c9d94dc4a)