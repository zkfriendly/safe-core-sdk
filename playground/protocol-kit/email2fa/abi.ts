export const EMAIL_SIGNER_FACTORY_ABI = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_implementation',
        type: 'address',
        internalType: 'address'
      },
      {
        name: '_dkimRegistry',
        type: 'address',
        internalType: 'address'
      },
      {
        name: '_verifier',
        type: 'address',
        internalType: 'address'
      }
    ],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'deploy',
    inputs: [
      {
        name: 'accountSalt',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address'
      }
    ],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'dkimRegistry',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'implementation',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'predictAddress',
    inputs: [
      {
        name: 'accountSalt',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'verifier',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'event',
    name: 'EmailSignerDeployed',
    inputs: [
      {
        name: 'emailSigner',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'accountSalt',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      }
    ],
    anonymous: false
  },
  {
    type: 'error',
    name: 'FailedDeployment',
    inputs: []
  },
  {
    type: 'error',
    name: 'InsufficientBalance',
    inputs: [
      {
        name: 'balance',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'needed',
        type: 'uint256',
        internalType: 'uint256'
      }
    ]
  }
]

export const EMAIL_SIGNER_ABI = [
  {
    inputs: [],
    stateMutability: 'nonpayable',
    type: 'constructor'
  },
  {
    inputs: [],
    name: 'InvalidAccountSalt',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidCommand',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidDKIMPublicKeyHash',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidDKIMRegistryAddress',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidEmailProof',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidInitialization',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidMaskedCommandLength',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidSkippedCommandPrefixSize',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidTemplateId',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidVerifierAddress',
    type: 'error'
  },
  {
    inputs: [],
    name: 'NotInitializing',
    type: 'error'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint64',
        name: 'version',
        type: 'uint64'
      }
    ],
    name: 'Initialized',
    type: 'event'
  },
  {
    inputs: [],
    name: 'accountSalt',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'dkimRegistryAddr',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: '_accountSalt',
        type: 'bytes32'
      },
      {
        internalType: 'address',
        name: '_dkimRegistryAddr',
        type: 'address'
      },
      {
        internalType: 'address',
        name: '_verifierAddr',
        type: 'address'
      },
      {
        internalType: 'uint256',
        name: '_templateId',
        type: 'uint256'
      }
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: '_hash',
        type: 'bytes32'
      },
      {
        internalType: 'bytes',
        name: '_signature',
        type: 'bytes'
      }
    ],
    name: 'isValidSignature',
    outputs: [
      {
        internalType: 'bytes4',
        name: '',
        type: 'bytes4'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'templateId',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'verifierAddr',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'templateId',
            type: 'uint256'
          },
          {
            internalType: 'bytes[]',
            name: 'commandParams',
            type: 'bytes[]'
          },
          {
            internalType: 'uint256',
            name: 'skippedCommandPrefix',
            type: 'uint256'
          },
          {
            components: [
              {
                internalType: 'string',
                name: 'domainName',
                type: 'string'
              },
              {
                internalType: 'bytes32',
                name: 'publicKeyHash',
                type: 'bytes32'
              },
              {
                internalType: 'uint256',
                name: 'timestamp',
                type: 'uint256'
              },
              {
                internalType: 'string',
                name: 'maskedCommand',
                type: 'string'
              },
              {
                internalType: 'bytes32',
                name: 'emailNullifier',
                type: 'bytes32'
              },
              {
                internalType: 'bytes32',
                name: 'accountSalt',
                type: 'bytes32'
              },
              {
                internalType: 'bool',
                name: 'isCodeExist',
                type: 'bool'
              },
              {
                internalType: 'bytes',
                name: 'proof',
                type: 'bytes'
              }
            ],
            internalType: 'struct EmailProof',
            name: 'proof',
            type: 'tuple'
          }
        ],
        internalType: 'struct EmailAuthMsg',
        name: 'emailAuthMsg',
        type: 'tuple'
      }
    ],
    name: 'verifyEmail',
    outputs: [],
    stateMutability: 'view',
    type: 'function'
  }
]
