// Generated from contracts/out by `pnpm --filter @mezout/sdk gen:abi`. Do not edit.
export const mezoutAccountFactoryAbi = [
  {
    "type": "function",
    "name": "createAccount",
    "inputs": [
      {
        "name": "qx",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "qy",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAddress",
    "inputs": [
      {
        "name": "qx",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "qy",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "AccountCreated",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "qx",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "qy",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  }
] as const;
