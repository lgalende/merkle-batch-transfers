# Merkle Batch Transfers

This project includes smart contracts and tests for performing batch transfers of ERC20 tokens based on Merkle proofs.

## Contracts

### MerkleBatchTransfers.sol

The `MerkleBatchTransfers.sol` contract allows batch transfers of ERC20 tokens based on a Merkle proof. It provides a secure and efficient way to distribute tokens to multiple recipients in a single transaction.

### MyErc20.sol

The `MyErc20.sol` contract is an example ERC20 token implementation for testing purposes only. It extends the `ERC20` contract from the OpenZeppelin library and includes basic functionality for token transfers and approvals.

## Tests

### MerkleBatchTransfers.ts

The `MerkleBatchTransfers.ts` test file contains test cases written in TypeScript for the `MerkleBatchTransfers` contract.

## Getting Started

To get started with the project, follow these steps:

1. Clone the repository:
```shell
git clone https://github.com/lgalende/merkle-batch-transfers.git
```

2. Install the dependencies:
```shell
npm install
```

3. Compile the smart contracts:
```shell
npx hardhat compile
```

4. Run the tests:
```shell
npx hardhat test
```
