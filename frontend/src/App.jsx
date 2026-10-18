import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import VerificationHub from './components/VerificationHub';
import StudioDashboard from './components/StudioDashboard';
import BlockchainLedger from './components/BlockchainLedger';
import DirectContractInspector from './components/DirectContractInspector';
import AuthModal from './components/AuthModal';
import Web3WalletModal from './components/Web3WalletModal';
import { api } from './services/api';
import { web3 } from './services/web3';
import './App.css';

export default function App() {
  const [currentTab, setCurrentTab] = useState('verify'); // 'verify' | 'studio' | 'ledger' | 'contract'
  const [user, setUser] = useState(api.user);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState(null);
  const [wallet, setWallet] = useState({
    account: null,
    chainId: null,
    networkName: null,
  });

  useEffect(() => {
    checkSystemStatus();
    checkExistingSession();
    autoDetectWallet();
  }, []);

  const checkSystemStatus = async () => {
    try {
      const status = await api.getReadyStatus();
      setSystemStatus(status);
      if (status?.checks?.contractAddress) {
        web3.setContractAddress(status.checks.contractAddress);
      }
    } catch (err) {
      console.warn('Backend readiness check failed:', err);
    }
  };

  const checkExistingSession = async () => {
    if (api.accessToken) {
      try {
        const res = await api.getMe();
        if (res?.data) {
          setUser(res.data);
        }
      } catch {
        api.clearSession();
        setUser(null);
      }
    }
  };

  const autoDetectWallet = async () => {
    if (web3.isAvailable() && window.ethereum.selectedAddress) {
      try {
        const info = await web3.connectWallet();
        setWallet(info);
      } catch (e) {
        // user hasn't authorized yet, ignore
      }
    }
  };

  const handleConnectWallet = async () => {
    try {
      const info = await web3.connectWallet();
      setWallet(info);
    } catch (err) {
      alert(err.message || 'Failed to connect Ethereum wallet');
    }
  };

  const handleSwitchNetwork = async (chainId) => {
    try {
      await web3.switchNetwork(chainId);
      const info = await web3.connectWallet();
      setWallet(info);
      setIsWalletOpen(false);
    } catch (err) {
      alert(`Network switch failed: ${err.message}`);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <div className="app-root">
      {/* Top Glass Navigation */}
      <Navbar 
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        user={user}
        onOpenLogin={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
        wallet={wallet}
        onConnectWallet={handleConnectWallet}
        onOpenWalletModal={() => setIsWalletOpen(true)}
        systemStatus={systemStatus}
      />

      {/* Main View Router */}
      <main className="main-content-area">
        {currentTab === 'verify' && (
          <VerificationHub systemStatus={systemStatus} />
        )}

        {currentTab === 'studio' && (
          <StudioDashboard 
            user={user} 
            onRequireLogin={() => setIsAuthOpen(true)}
            systemStatus={systemStatus}
          />
        )}

        {currentTab === 'ledger' && (
          <BlockchainLedger />
        )}

        {currentTab === 'contract' && (
          <DirectContractInspector 
            wallet={wallet}
            systemStatus={systemStatus}
            onConnectWallet={handleConnectWallet}
          />
        )}
      </main>

      {/* Footer Strip */}
      <footer className="footer-strip">
        <div className="footer-content">
          <div className="footer-col">
            <span className="footer-brand">CERTI<span className="gradient-text">CHAIN</span></span>
            <p className="footer-copy">Cryptographic Document Registry & Verification Protocol. Built on Ethereum & IPFS.</p>
          </div>
          <div className="footer-col text-right">
            <div className="tech-tags mono">
              <span>SOLIDITY 0.8.24</span>
              <span>ETHERS.JS V6</span>
              <span>PRISMA</span>
              <span>PINATA IPFS</span>
            </div>
            <p className="text-muted text-xs mt-1">Academic Mini-Project // Shravanya Andhale • Arnav Chaudhary • Karuna Jeswani • Nikhil Kadam</p>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal 
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(userData) => setUser(userData)}
      />

      <Web3WalletModal 
        isOpen={isWalletOpen}
        onClose={() => setIsWalletOpen(false)}
        wallet={wallet}
        onSwitchNetwork={handleSwitchNetwork}
      />
    </div>
  );
}
