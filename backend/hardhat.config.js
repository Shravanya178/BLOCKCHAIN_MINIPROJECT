require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY } = process.env;
const validKey = (k) => typeof k === 'string' && /^0x[0-9a-fA-F]{64}$/.test(k);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  paths: {
    sources: './contracts',
    tests: './test/contracts',
    cache: './cache',
    artifacts: './artifacts',
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: 'http://127.0.0.1:8545', chainId: 31337 },
    // Only enabled when a Sepolia RPC URL and a valid deployer key are configured.
    ...(SEPOLIA_RPC_URL && validKey(DEPLOYER_PRIVATE_KEY)
      ? { sepolia: { url: SEPOLIA_RPC_URL, accounts: [DEPLOYER_PRIVATE_KEY], chainId: 11155111 } }
      : {}),
  },
  mocha: { timeout: 60000 },
};
