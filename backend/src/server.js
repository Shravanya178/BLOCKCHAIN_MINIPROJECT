'use strict';

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const blockchainService = require('./modules/blockchain/blockchain.service');

const server = app.listen(config.port, async () => {
  logger.info(`Server running on port ${config.port} in ${config.env} mode`);
  logger.info(`Public API URL: ${config.publicBaseUrl}${config.apiPrefix}`);
  logger.info(`Swagger Documentation: ${config.publicBaseUrl}/api/docs`);

  const chainStatus = await blockchainService.isChainReachable();
  if (chainStatus.reachable) {
    logger.info(`Connected to blockchain RPC: ${config.blockchain.rpcUrl} (ChainId: ${chainStatus.chainId})`);
  } else {
    logger.warn(`Blockchain RPC not yet reachable: ${chainStatus.error}. Run 'npm run chain' and deploy contract.`);
  }
});

module.exports = server;
