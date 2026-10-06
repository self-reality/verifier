// Shared by VerifierRegistry (ETH) and VerifierRegistryUSDC
export const ANCHORED_EVENT = {
  type: 'event',
  name: 'Anchored',
  anonymous: false,
  inputs: [
    { indexed: true, name: 'cidIndex', type: 'string' },
    { indexed: false, name: 'cid', type: 'string' },
    { indexed: false, name: 'filename', type: 'string' },
    { indexed: false, name: 'submitter', type: 'address' },
    { indexed: false, name: 'timestamp', type: 'uint256' },
    { indexed: false, name: 'paid', type: 'uint256' },
  ],
};

export const REGISTRY_ABI = [
  ANCHORED_EVENT,
  { type: 'function', name: 'price', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'firstAnchor',
    stateMutability: 'view',
    inputs: [{ name: 'cid', type: 'string' }],
    outputs: [
      { name: 'submitter', type: 'address' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'blockNumber', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'settled',
    stateMutability: 'view',
    inputs: [
      { name: 'payer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'anchorWithAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'cid', type: 'string' },
      { name: 'filename', type: 'string' },
      {
        name: 'auth',
        type: 'tuple',
        components: [
          { name: 'from', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'anchorPaid',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'cid', type: 'string' },
      { name: 'filename', type: 'string' },
      { name: 'from', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
    outputs: [],
  },
];

export const TOKEN_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'authorizationState',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'event',
    name: 'AuthorizationUsed',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'authorizer', type: 'address' },
      { indexed: true, name: 'nonce', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'Transfer',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  },
];
