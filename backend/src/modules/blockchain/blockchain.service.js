'use strict';

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const config = require('../../config');
const logger = require('../../utils/logger');
const AppError = require('../../utils/AppError');

// ABI file path
const ABI_PATH = path.resolve(__dirname, 'abi/CertificateRegistry.json');
// In case Hardhat artifacts are present directly
const ARTIFACT_PATH = path.resolve(__dirname, '../../../artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json');

class BlockchainService {
  constructor() {
    this._provider = null;
    this._wallet = null;
    this._contract = null;
    this._contractAddress = null;
    this._abi = null;
  }

  loadAbi() {
    if (this._abi) return this._abi;
    if (fs.existsSync(ABI_PATH)) {
      const data = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
      this._abi = data.abi;
      return this._abi;
    }
    if (fs.existsSync(ARTIFACT_PATH)) {
      const data = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
      this._abi = data.abi;
      return this._abi;
    }
    return null;
  }

  resolveContractAddress() {
    if (config.blockchain.contractAddress) {
      return config.blockchain.contractAddress;
    }
    const deploymentFile = path.resolve(config.blockchain.deploymentsDir, `${config.blockchain.network}.json`);
    if (fs.existsSync(deploymentFile)) {
      try {
        const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
        if (deployment.address) {
          return deployment.address;
        }
      } catch (err) {
        logger.warn('Failed to parse deployment file', { path: deploymentFile, err: err.message });
      }
    }
    return null;
  }

  getProvider() {
    if (!this._provider) {
      this._provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl, undefined, {
        staticNetwork: true,
      });
    }
    return this._provider;
  }

  getSigner() {
    if (!this._wallet) {
      const provider = this.getProvider();
      this._wallet = new ethers.Wallet(config.blockchain.privateKey, provider);
    }
    return this._wallet;
  }

  getContract(readOnly = false) {
    const address = this.resolveContractAddress();
    if (!address) {
      throw AppError.unavailable('Smart contract address is not configured or deployed yet');
    }
    const abi = this.loadAbi();
    if (!abi) {
      throw AppError.unavailable('Contract ABI not found. Compile the contract first.');
    }

    if (readOnly) {
      return new ethers.Contract(address, abi, this.getProvider());
    }
    return new ethers.Contract(address, abi, this.getSigner());
  }

  async isChainReachable() {
    try {
      const provider = this.getProvider();
      const network = await Promise.race([
        provider.getNetwork(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('RPC Timeout')), config.blockchain.rpcTimeoutMs)),
      ]);
      return { reachable: true, chainId: Number(network.chainId) };
    } catch (err) {
      return { reachable: false, error: err.message };
    }
  }

  async getCertificateFromChain(certificateId) {
    const contract = this.getContract(true);
    try {
      const [exists, documentHash, issuer, issuedAt, revoked, revokedAt] = await contract.getCertificate(certificateId);
      return {
        exists,
        documentHash: documentHash === ethers.ZeroHash ? null : documentHash,
        issuer: issuer === ethers.ZeroAddress ? null : issuer,
        issuedAt: Number(issuedAt),
        revoked,
        revokedAt: Number(revokedAt),
        contractAddress: await contract.getAddress(),
        network: config.blockchain.network,
        chainId: config.blockchain.chainId,
      };
    } catch (err) {
      logger.error('Failed to read certificate from blockchain', { certificateId, error: err.message });
      throw AppError.unavailable('Blockchain query failed', { originalError: err.message });
    }
  }

  async registerCertificateOnChain(certificateId, documentHash) {
    if (!documentHash || !documentHash.startsWith('0x') || documentHash.length !== 66) {
      throw AppError.badRequest('Invalid document hash for blockchain registration');
    }

    const contract = this.getContract(false);
    const contractAddress = await contract.getAddress();

    try {
      // Pre-check if already registered on-chain
      const exists = await contract.certificateExists(certificateId);
      if (exists) {
        const details = await contract.getCertificate(certificateId);
        return {
          alreadyRegistered: true,
          txHash: null,
          blockNumber: null,
          contractAddress,
          documentHash: details[1],
          issuer: details[2],
        };
      }

      // Submit transaction
      const tx = await contract.registerCertificate(certificateId, documentHash);
      logger.info('Submitted certificate registration tx', { certificateId, txHash: tx.hash });

      // Wait for confirmation
      const receipt = await tx.wait(config.blockchain.confirmations);
      if (receipt.status !== 1) {
        throw new Error(`Transaction reverted with status ${receipt.status}`);
      }

      logger.info('Confirmed certificate registration tx', {
        certificateId,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        alreadyRegistered: false,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        contractAddress,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (err) {
      logger.error('Failed to register certificate on blockchain', {
        certificateId,
        error: err.message,
        code: err.code,
      });

      // Handle custom errors or reverts
      if (err.message && err.message.includes('CertificateAlreadyExists')) {
        return { alreadyRegistered: true, contractAddress };
      }

      throw AppError.unavailable('Blockchain transaction failed', {
        reason: err.shortMessage || err.message,
        code: err.code,
      });
    }
  }

  async revokeCertificateOnChain(certificateId) {
    const contract = this.getContract(false);
    const contractAddress = await contract.getAddress();

    try {
      const details = await contract.getCertificate(certificateId);
      if (!details[0]) {
        throw AppError.notFound('Certificate does not exist on blockchain');
      }
      if (details[4]) {
        return {
          alreadyRevoked: true,
          txHash: null,
          blockNumber: null,
          contractAddress,
        };
      }

      const tx = await contract.revokeCertificate(certificateId);
      logger.info('Submitted certificate revocation tx', { certificateId, txHash: tx.hash });

      const receipt = await tx.wait(config.blockchain.confirmations);
      if (receipt.status !== 1) {
        throw new Error(`Transaction reverted with status ${receipt.status}`);
      }

      logger.info('Confirmed certificate revocation tx', {
        certificateId,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        alreadyRevoked: false,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        contractAddress,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('Failed to revoke certificate on blockchain', { certificateId, error: err.message });
      throw AppError.unavailable('Blockchain revocation failed', {
        reason: err.shortMessage || err.message,
      });
    }
  }
}

module.exports = new BlockchainService();
