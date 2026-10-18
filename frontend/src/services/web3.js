import { ethers } from 'ethers';
import { CONTRACT_ABI, NETWORKS, DEFAULT_CONTRACT_ADDRESS } from '../config/contracts';

class Web3Service {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.account = null;
    this.chainId = null;
    this.contractAddress = DEFAULT_CONTRACT_ADDRESS;
  }

  setContractAddress(addr) {
    if (addr && ethers.isAddress(addr)) {
      this.contractAddress = addr;
    }
  }

  isAvailable() {
    return typeof window !== 'undefined' && Boolean(window.ethereum);
  }

  getReadOnlyProvider() {
    // Fallback to local hardhat node or sepolia public RPC
    return new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  }

  async connectWallet() {
    if (!this.isAvailable()) {
      throw new Error('No Ethereum wallet detected. Please install MetaMask to use direct Web3 features.');
    }

    this.provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await this.provider.send('eth_requestAccounts', []);
    if (!accounts || accounts.length === 0) {
      throw new Error('No Ethereum accounts authorized.');
    }

    this.signer = await this.provider.getSigner();
    this.account = await this.signer.getAddress();
    const network = await this.provider.getNetwork();
    this.chainId = Number(network.chainId);

    return {
      account: this.account,
      chainId: this.chainId,
      networkName: NETWORKS[this.chainId]?.chainName || `Chain ID ${this.chainId}`,
    };
  }

  async switchNetwork(targetChainId = 31337) {
    if (!this.isAvailable()) return;
    const target = NETWORKS[targetChainId];
    if (!target) throw new Error(`Unsupported chain ID: ${targetChainId}`);

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: target.chainId }],
      });
    } catch (switchError) {
      // 4902 error code means network is not added to wallet
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [target],
        });
      } else {
        throw switchError;
      }
    }
  }

  getContract(withSigner = false) {
    const providerOrSigner = withSigner && this.signer ? this.signer : (this.provider || this.getReadOnlyProvider());
    return new ethers.Contract(this.contractAddress, CONTRACT_ABI, providerOrSigner);
  }

  async getCertificateOnChain(certificateId) {
    const contract = this.getContract(false);
    const result = await contract.getCertificate(certificateId);
    return {
      exists: result[0],
      documentHash: result[1],
      issuer: result[2],
      issuedAt: Number(result[3]),
      revoked: result[4],
      revokedAt: Number(result[5]),
      contractAddress: this.contractAddress,
    };
  }

  async verifyCertificateOnChain(certificateId, documentHash) {
    const contract = this.getContract(false);
    const [valid, revoked] = await contract.verifyCertificate(certificateId, documentHash);
    return { valid, revoked };
  }

  async getTotalCertificates() {
    try {
      const contract = this.getContract(false);
      const total = await contract.totalCertificates();
      return Number(total);
    } catch {
      return 0;
    }
  }

  async checkRoles(account) {
    const addr = account || this.account;
    if (!addr) return { isAdmin: false, isIssuer: false };

    try {
      const contract = this.getContract(false);
      const adminRole = await contract.DEFAULT_ADMIN_ROLE();
      const issuerRole = await contract.ISSUER_ROLE();

      const [isAdmin, isIssuer] = await Promise.all([
        contract.hasRole(adminRole, addr),
        contract.hasRole(issuerRole, addr),
      ]);

      return { isAdmin, isIssuer };
    } catch (err) {
      console.warn('Role check error:', err);
      return { isAdmin: false, isIssuer: false };
    }
  }

  async registerCertificateDirect(certificateId, documentHash) {
    if (!this.signer) throw new Error('Wallet not connected');
    const contract = this.getContract(true);
    const tx = await contract.registerCertificate(certificateId, documentHash);
    const receipt = await tx.wait(1);
    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  async revokeCertificateDirect(certificateId) {
    if (!this.signer) throw new Error('Wallet not connected');
    const contract = this.getContract(true);
    const tx = await contract.revokeCertificate(certificateId);
    const receipt = await tx.wait(1);
    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  }
}

export const web3 = new Web3Service();
export default web3;
