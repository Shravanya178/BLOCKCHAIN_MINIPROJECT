import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Search, 
  ShieldCheck, 
  Layers, 
  Terminal, 
  CheckCircle2, 
  XCircle, 
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Copy,
  Lock,
  Code
} from 'lucide-react';
import { web3 } from '../services/web3';
import { CONTRACT_ABI, ROOT_CONTRACT_ABI } from '../config/contracts';
import { formatAddressOrHash } from '../services/crypto';

export default function DirectContractInspector({ wallet, systemStatus, onConnectWallet }) {
  const [totalCerts, setTotalCerts] = useState(null);
  const [queryCertId, setQueryCertId] = useState('');
  const [chainResult, setChainResult] = useState(null);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState(null);
  const [userRoles, setUserRoles] = useState({ isAdmin: false, isIssuer: false });

  // Direct On-chain Registration state (for wallet with ISSUER_ROLE)
  const [directId, setDirectId] = useState('');
  const [directHash, setDirectHash] = useState('');
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);
  const [txSuccess, setTxSuccess] = useState(null);

  useEffect(() => {
    fetchContractStats();
  }, [wallet?.account]);

  const fetchContractStats = async () => {
    try {
      const total = await web3.getTotalCertificates();
      setTotalCerts(total);

      if (wallet?.account) {
        const roles = await web3.checkRoles(wallet.account);
        setUserRoles(roles);
      }
    } catch (err) {
      console.warn('Failed to fetch contract stats:', err);
    }
  };

  const handleQueryOnChain = async (e) => {
    e.preventDefault();
    if (!queryCertId.trim()) return;
    setQuerying(true);
    setQueryError(null);
    setChainResult(null);

    try {
      const res = await web3.getCertificateOnChain(queryCertId.trim());
      setChainResult(res);
    } catch (err) {
      setQueryError(err.message || 'On-chain read call failed');
    } finally {
      setQuerying(false);
    }
  };

  const handleDirectRegister = async (e) => {
    e.preventDefault();
    if (!wallet?.account) {
      onConnectWallet();
      return;
    }
    if (!directId.trim() || !directHash.trim()) return;

    setIsSubmittingTx(true);
    setTxSuccess(null);
    try {
      const res = await web3.registerCertificateDirect(directId.trim(), directHash.trim());
      setTxSuccess(res);
      fetchContractStats();
    } catch (err) {
      alert(`On-chain transaction failed: ${err.message}`);
    } finally {
      setIsSubmittingTx(false);
    }
  };

  return (
    <div className="contract-inspector-section">
      <div className="inspector-hero">
        <span className="badge badge-chain">
          <Cpu size={14} />
          <span>DIRECT SOLIDITY SMART CONTRACT PROTOCOL</span>
        </span>
        <h2>On-Chain Smart Contract Inspector</h2>
        <p>Interact directly with <code>CertificateRegistry.sol</code> via Ethereum JSON-RPC without passing through the backend API.</p>
      </div>

      {/* Contract Architecture Metadata Cards */}
      <div className="inspector-grid">
        <div className="glass-panel stat-chip-card">
          <div className="stat-icon-wrap">
            <Cpu size={22} className="icon-cyan" />
          </div>
          <div>
            <span className="stat-label">Contract Address</span>
            <span className="stat-val mono text-sm">
              {formatAddressOrHash(systemStatus?.checks?.contractAddress || web3.contractAddress, 8, 6)}
            </span>
          </div>
        </div>

        <div className="glass-panel stat-chip-card">
          <div className="stat-icon-wrap">
            <Layers size={22} className="icon-violet" />
          </div>
          <div>
            <span className="stat-label">Total On-Chain Records</span>
            <span className="stat-val mono">{totalCerts !== null ? totalCerts : '0'}</span>
          </div>
        </div>

        <div className="glass-panel stat-chip-card">
          <div className="stat-icon-wrap">
            <Lock size={22} className="icon-emerald" />
          </div>
          <div>
            <span className="stat-label">Connected Wallet Roles</span>
            <div className="flex gap-2 mt-1">
              <span className={`badge ${userRoles.isAdmin ? 'badge-verified' : 'badge-pending'}`}>
                {userRoles.isAdmin ? 'ADMIN' : 'NO ADMIN'}
              </span>
              <span className={`badge ${userRoles.isIssuer ? 'badge-verified' : 'badge-pending'}`}>
                {userRoles.isIssuer ? 'ISSUER' : 'PUBLIC'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Direct On-Chain Query Card */}
      <div className="glass-panel query-contract-card">
        <div className="card-top">
          <h3 className="card-heading">
            <Terminal size={20} className="icon-cyan" />
            <span>Direct Smart Contract Call: <code>getCertificate(string certificateId)</code></span>
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={fetchContractStats}>
            <RefreshCw size={13} />
            <span>Refresh State</span>
          </button>
        </div>

        <form onSubmit={handleQueryOnChain} className="contract-query-form">
          <div className="query-input-wrap">
            <input 
              type="text" 
              className="input-field mono"
              placeholder="Query Certificate ID on Ethereum (e.g. CERT-2026-X8K9M3P2)"
              value={queryCertId}
              onChange={(e) => setQueryCertId(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={querying}>
              {querying ? 'Calling RPC...' : 'Execute Call'}
            </button>
          </div>
        </form>

        {queryError && (
          <div className="status-banner error-banner my-3">
            <XCircle size={18} />
            <span>{queryError}</span>
          </div>
        )}

        {/* On-Chain Result Breakdown */}
        {chainResult && (
          <div className="onchain-result-box mono">
            <div className="result-row">
              <span className="k">exists:</span>
              <span className={`v ${chainResult.exists ? 'text-emerald' : 'text-muted'}`}>
                {String(chainResult.exists)}
              </span>
            </div>
            <div className="result-row">
              <span className="k">documentHash:</span>
              <span className="v text-cyan">{chainResult.documentHash || '0x000...'}</span>
            </div>
            <div className="result-row">
              <span className="k">issuer (wallet):</span>
              <span className="v text-violet">{chainResult.issuer || '0x000...'}</span>
            </div>
            <div className="result-row">
              <span className="k">issuedAt (block.timestamp):</span>
              <span className="v">
                {chainResult.issuedAt ? new Date(chainResult.issuedAt * 1000).toLocaleString() : 'N/A'}
              </span>
            </div>
            <div className="result-row">
              <span className="k">revoked:</span>
              <span className={`v ${chainResult.revoked ? 'text-red' : 'text-emerald'}`}>
                {String(chainResult.revoked)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Direct Smart Contract Write Call (For Wallet with ISSUER_ROLE) */}
      <div className="glass-panel write-contract-card mt-6">
        <h3 className="card-heading">
          <Code size={20} className="icon-violet" />
          <span>Direct Web3 Transaction: <code>registerCertificate(certificateId, documentHash)</code></span>
        </h3>
        <p className="card-sub">
          Authorized issuers can submit transactions directly to the smart contract using MetaMask, bypassing any server API.
        </p>

        {!wallet?.account ? (
          <div className="connect-prompt-box">
            <p>Connect your Web3 wallet to interact with write methods.</p>
            <button className="btn btn-violet btn-sm mt-2" onClick={onConnectWallet}>
              Connect MetaMask
            </button>
          </div>
        ) : (
          <form onSubmit={handleDirectRegister} className="direct-write-form">
            <div className="form-row">
              <div className="form-group flex-1">
                <label className="field-label">Certificate ID</label>
                <input 
                  type="text" 
                  className="input-field mono" 
                  placeholder="e.g. CERT-WEB3-001"
                  value={directId}
                  onChange={(e) => setDirectId(e.target.value)}
                  required
                />
              </div>

              <div className="form-group flex-2">
                <label className="field-label">SHA-256 Document Hash (bytes32 hex)</label>
                <input 
                  type="text" 
                  className="input-field mono" 
                  placeholder="0x..."
                  value={directHash}
                  onChange={(e) => setDirectHash(e.target.value)}
                  required
                />
              </div>
            </div>

            {txSuccess && (
              <div className="status-banner success-banner my-3">
                <CheckCircle2 size={18} />
                <span>Transaction confirmed! Tx Hash: {txSuccess.txHash} (Block #{txSuccess.blockNumber})</span>
              </div>
            )}

            <button 
              type="submit" 
              className="btn btn-violet"
              disabled={isSubmittingTx || !directId.trim() || !directHash.trim()}
            >
              {isSubmittingTx ? 'Submitting to Blockchain...' : 'Submit Transaction (MetaMask)'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
