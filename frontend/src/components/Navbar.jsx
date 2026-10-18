import React from 'react';
import { 
  ShieldCheck, 
  Layers, 
  FileText, 
  FileCheck2, 
  Cpu, 
  Wallet, 
  LogIn, 
  LogOut, 
  ExternalLink,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { formatAddressOrHash } from '../services/crypto';

export default function Navbar({ 
  currentTab, 
  setCurrentTab, 
  user, 
  onOpenLogin, 
  onLogout,
  wallet,
  onConnectWallet,
  onOpenWalletModal,
  systemStatus
}) {
  return (
    <header className="navbar-container">
      <div className="navbar-inner">
        {/* Brand Logo */}
        <div className="navbar-brand" onClick={() => setCurrentTab('verify')}>
          <div className="brand-logo-icon">
            <Cpu className="icon-cyan" size={24} />
            <div className="logo-sparkle" />
          </div>
          <div className="brand-text">
            <span className="brand-title">CERTI<span className="gradient-text">CHAIN</span></span>
            <span className="brand-subtitle">ETHEREUM PROTOCOL</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="navbar-nav">
          <button 
            className={`nav-link ${currentTab === 'verify' ? 'active' : ''}`}
            onClick={() => setCurrentTab('verify')}
          >
            <ShieldCheck size={18} />
            <span>Verification Hub</span>
          </button>

          <button 
            className={`nav-link ${currentTab === 'studio' ? 'active' : ''}`}
            onClick={() => setCurrentTab('studio')}
          >
            <Layers size={18} />
            <span>Authority Studio</span>
            {user && <span className="nav-badge-dot" />}
          </button>

          <button 
            className={`nav-link ${currentTab === 'ledger' ? 'active' : ''}`}
            onClick={() => setCurrentTab('ledger')}
          >
            <FileText size={18} />
            <span>Blockchain Ledger</span>
          </button>

          <button 
            className={`nav-link ${currentTab === 'contract' ? 'active' : ''}`}
            onClick={() => setCurrentTab('contract')}
          >
            <Cpu size={18} />
            <span>Smart Contract</span>
          </button>
        </nav>

        {/* Right Action Controls: Web3 & Auth */}
        <div className="navbar-actions">
          {/* Smart Contract Live Status Pill */}
          <div className="system-pill" title={`Blockchain: ${systemStatus?.checks?.blockchainRpc || 'checking...'}`}>
            <span className={`status-indicator ${systemStatus?.checks?.blockchainRpc === 'up' ? 'online' : 'offline'}`} />
            <span className="status-label mono">
              {systemStatus?.checks?.contractAddress 
                ? formatAddressOrHash(systemStatus.checks.contractAddress, 4, 4) 
                : 'CONTRACT ACTIVE'}
            </span>
          </div>

          {/* Web3 Wallet Button */}
          {wallet?.account ? (
            <button className="wallet-pill" onClick={onOpenWalletModal}>
              <div className="wallet-avatar-dot" />
              <div className="wallet-info">
                <span className="wallet-addr mono">{formatAddressOrHash(wallet.account, 4, 3)}</span>
                <span className="wallet-network">{wallet.networkName}</span>
              </div>
              <ChevronDown size={14} className="wallet-chevron" />
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={onConnectWallet}>
              <Wallet size={15} />
              <span>Connect Wallet</span>
            </button>
          )}

          {/* Authority User Auth Pill */}
          {user ? (
            <div className="user-profile-menu">
              <div className="user-chip">
                <div className="user-avatar-initials">
                  {user.name?.charAt(0) || 'U'}
                </div>
                <div className="user-details">
                  <span className="user-name">{user.name}</span>
                  <span className="user-role-badge">{user.role}</span>
                </div>
                <button className="logout-icon-btn" onClick={onLogout} title="Sign Out">
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onOpenLogin}>
              <LogIn size={15} />
              <span>Authority Login</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
