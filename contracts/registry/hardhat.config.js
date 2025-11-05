require('@nomicfoundation/hardhat-toolbox');
require('@nomicfoundation/hardhat-chai-matchers');
require('hardhat-gas-reporter');
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    token: "ETH",
    ethPrice: 4000,
    gasPrice: 100,
    excludeContracts: [],
    showTimeSpent: true,
  },
  networks: {
    hardhat: {},
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
    base: {
      url: process.env.BASE_MAINNET_RPC || 'https://mainnet.base.org',
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
    polygon: {
      url: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
    optimism: {
      url: process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io',
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
    mainnet: {
      url: process.env.MAINNET_RPC || 'https://eth.llamarpc.com',
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
  },
};


