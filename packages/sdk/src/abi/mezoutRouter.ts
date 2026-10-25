// Generated from contracts/out by `pnpm --filter @mezout/sdk gen:abi`. Do not edit.
export const mezoutRouterAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "musd_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "borrowerOperationsSignatures_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "troveManager_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "priceFeed_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "invoiceSigner_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "feeRecipient_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tigrisFactory_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "btc_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "mezo_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "INVOICE_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_BORROW_ICR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PAYMENT_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SWAP_PAYMENT_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "borrowerOperationsSignatures",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IBorrowerOperationsSignatures"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "btc",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "domainSeparator",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "eip712Domain",
    "inputs": [],
    "outputs": [
      {
        "name": "fields",
        "type": "bytes1",
        "internalType": "bytes1"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "chainId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verifyingContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "extensions",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "feeRecipient",
    "inputs": [],
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
    "type": "function",
    "name": "hashInvoice",
    "inputs": [
      {
        "name": "invoice",
        "type": "tuple",
        "internalType": "struct MezoutRouter.Invoice",
        "components": [
          {
            "name": "merchant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fee",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "orderId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "expiry",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hashPayment",
    "inputs": [
      {
        "name": "invoice",
        "type": "tuple",
        "internalType": "struct MezoutRouter.Invoice",
        "components": [
          {
            "name": "merchant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fee",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "orderId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "expiry",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      },
      {
        "name": "payer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hashSwapPayment",
    "inputs": [
      {
        "name": "invoice",
        "type": "tuple",
        "internalType": "struct MezoutRouter.Invoice",
        "components": [
          {
            "name": "merchant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fee",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "orderId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "expiry",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      },
      {
        "name": "payer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenIn",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "limit",
        "type": "tuple",
        "internalType": "struct MezoutRouter.SwapLimit",
        "components": [
          {
            "name": "maxAmountIn",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "invoiceSigner",
    "inputs": [],
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
    "type": "function",
    "name": "mezo",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "musd",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "paid",
    "inputs": [
      {
        "name": "orderId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "payWithBTC",
    "inputs": [
      {
        "name": "invoice",
        "type": "tuple",
        "internalType": "struct MezoutRouter.Invoice",
        "components": [
          {
            "name": "merchant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fee",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "orderId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "expiry",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      },
      {
        "name": "invoiceSig",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "payer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "payerSig",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "limit",
        "type": "tuple",
        "internalType": "struct MezoutRouter.SwapLimit",
        "components": [
          {
            "name": "maxAmountIn",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "permit",
        "type": "tuple",
        "internalType": "struct MezoutRouter.PermitSig",
        "components": [
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "v",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "r",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "s",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "payWithBorrow",
    "inputs": [
      {
        "name": "invoice",
        "type": "tuple",
        "internalType": "struct MezoutRouter.Invoice",
        "components": [
          {
            "name": "merchant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fee",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "orderId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "expiry",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      },
      {
        "name": "invoiceSig",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "payer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "payerSig",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "fromBalance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "permit",
        "type": "tuple",
        "internalType": "struct MezoutRouter.PermitSig",
        "components": [
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "v",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "r",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "s",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      },
      {
        "name": "borrow",
        "type": "tuple",
        "internalType": "struct MezoutRouter.BorrowAuth",
        "components": [
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "upperHint",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "lowerHint",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "signature",
            "type": "bytes",
            "internalType": "bytes"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "payWithMEZO",
    "inputs": [
      {
        "name": "invoice",
        "type": "tuple",
        "internalType": "struct MezoutRouter.Invoice",
        "components": [
          {
            "name": "merchant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fee",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "orderId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "expiry",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      },
      {
        "name": "invoiceSig",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "payer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "payerSig",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "limit",
        "type": "tuple",
        "internalType": "struct MezoutRouter.SwapLimit",
        "components": [
          {
            "name": "maxAmountIn",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "permit",
        "type": "tuple",
        "internalType": "struct MezoutRouter.PermitSig",
        "components": [
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "v",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "r",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "s",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "payWithMUSD",
    "inputs": [
      {
        "name": "invoice",
        "type": "tuple",
        "internalType": "struct MezoutRouter.Invoice",
        "components": [
          {
            "name": "merchant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "fee",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "orderId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "expiry",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      },
      {
        "name": "invoiceSig",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "payer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "payerSig",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "permit",
        "type": "tuple",
        "internalType": "struct MezoutRouter.PermitSig",
        "components": [
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "v",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "r",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "s",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "priceFeed",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPriceFeed"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteSwapIn",
    "inputs": [
      {
        "name": "tokenIn",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tigrisFactory",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ITigrisPoolFactory"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "troveManager",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ITroveManager"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "EIP712DomainChanged",
    "inputs": [],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Paid",
    "inputs": [
      {
        "name": "orderId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "merchant",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "payer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "fee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "method",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum MezoutRouter.Method"
      },
      {
        "name": "assetIn",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amountIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "borrowed",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BorrowMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientLiquidity",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidBorrowAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInvoice",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInvoiceSignature",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPayerSignature",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidShortString",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvoiceAlreadyPaid",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvoiceExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoPool",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PermitFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "QuoteExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "SlippageExceeded",
    "inputs": [
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxAmountIn",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "StringTooLong",
    "inputs": [
      {
        "name": "str",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "SwapMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TroveBelowSafetyFloor",
    "inputs": [
      {
        "name": "icr",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnexpectedBTC",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;
