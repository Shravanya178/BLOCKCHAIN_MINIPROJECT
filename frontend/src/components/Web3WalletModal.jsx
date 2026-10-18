import React from 'react';
import { Wallet, X, ExternalLink, Copy, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatAddressOrHash } from '../services/crypto';

export default function Web3WalletModal({ 
  isOpen, 
  onClose, 
  wallet, 
  onSwitchNetwork, 
  onDisconnect 
}) {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !wallet?.account) return null;

  const copyAddress = () => {
    navigator.clipboard.writeText(wallet.account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-panel modal-card wallet-modal-card">
        <div className="modal-header">
          <div className="modal-title-group">
            <Wallet size={20} className="icon-cyan" />
            <h3>Connected Web3 Wallet</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="wallet-card-body mt-3">
          <div className="address-display-box mono">
            <span>{wallet.account}</span>
            <button className="copy-btn" onClick={copyAddress} title="Copy Address">
              {copied ? <CheckCircle2 size={14} className="text-emerald" /> : <Copy size={14} />}
            </button>
          </div>

          <div className="network-info-row mt-4">
            <span className="text-muted">Network:</span>
            <span className="badge badge-chain">{wallet.networkName} (Chain {wallet.chainId})</span>
          </div>

          <div className="network-switch-options mt-4">
            <span className="field-label">Switch Network:</span>
            <div className="flex gap-2 mt-2">
              <button 
                className={`btn btn-secondary btn-sm flex-1 ${wallet.chainId === 31337 ? 'active-network' : ''}`}
                onClick={() => onSwitchNetwork(31337)}
              >
                Localhost (31337)
              </button>
              <button 
                className={`btn btn-secondary btn-sm flex-1 ${wallet.chainId === 11155111 ? 'active-network' : ''}`}
                onClick={() => onSwitchNetwork(11155111)}
              >
                Sepolia (11155111)
              </button>
            </div>
          </div>

          <div className="modal-actions mt-6">
            <button className="btn btn-secondary w-full" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
