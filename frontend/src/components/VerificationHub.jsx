import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Search, 
  UploadCloud, 
  FileCheck, 
  AlertTriangle, 
  XCircle, 
  ExternalLink, 
  Copy, 
  CheckCircle2, 
  Download, 
  Sparkles, 
  Lock, 
  FileText,
  Clock,
  Layers,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { api } from '../services/api';
import { web3 } from '../services/web3';
import { hashFile, formatAddressOrHash } from '../services/crypto';

export default function VerificationHub({ systemStatus }) {
  const [activeMode, setActiveMode] = useState('id'); // 'id' | 'file'
  const [certIdInput, setCertIdInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  
  // File upload state
  const [uploadedFile, setUploadedFile] = useState(null);
  const [computedFileHash, setComputedFileHash] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00f5d4', '#8b5cf6', '#00bbf9', '#fbbf24']
      });
    } catch (e) {
      // ignore
    }
  };

  const handleCopy = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Verify by Certificate ID
  const handleVerifyById = async (idToVerify) => {
    const id = (idToVerify || certIdInput).trim();
    if (!id) return;
    setIsVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);

    try {
      const res = await api.verifyById(id);
      setVerifyResult(res.data);
      if (res.data?.isVerified) {
        triggerConfetti();
      }
    } catch (err) {
      if (err.data?.data) {
        setVerifyResult(err.data.data);
      } else {
        setVerifyError(err.message || 'Verification request failed');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Verify by Document Upload
  const handleFileUpload = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setVerifyError('Please upload a valid PDF certificate file.');
      return;
    }

    setUploadedFile(file);
    setIsVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);

    try {
      // 1. Calculate SHA-256 directly in browser for instant cryptographic proof
      const { hash } = await hashFile(file);
      setComputedFileHash(hash);

      // 2. Query backend document verification endpoint
      const res = await api.verifyDocument(file);
      setVerifyResult(res.data);
      if (res.data?.isVerified) {
        triggerConfetti();
      }
    } catch (err) {
      if (err.data?.data) {
        setVerifyResult(err.data.data);
      } else {
        setVerifyError(err.message || 'Document verification failed');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="verification-hub-section">
      {/* Hero Header */}
      <div className="hub-hero">
        <div className="hero-badge">
          <Sparkles size={14} className="icon-cyan" />
          <span>CRYPTOGRAPHIC VERIFICATION PROTOCOL</span>
        </div>
        <h1 className="hero-headline">
          Instant & Immutable <span className="gradient-text">Certificate Verification</span>
        </h1>
        <p className="hero-description">
          Verify academic credentials directly against the Ethereum blockchain registry. 
          No central intermediary can forge, alter, or falsify registered records.
        </p>

        {/* Live Metrics Ribbons */}
        <div className="hero-metrics-bar">
          <div className="metric-tag">
            <ShieldCheck size={16} className="icon-emerald" />
            <span>SHA-256 Byte Level Tamper Proof</span>
          </div>
          <div className="metric-tag">
            <Lock size={16} className="icon-cyan" />
            <span>Zero Personal Data On-Chain</span>
          </div>
          <div className="metric-tag">
            <Layers size={16} className="icon-violet" />
            <span>IPFS Decentralized Storage</span>
          </div>
        </div>
      </div>

      {/* Verification Matrix Card */}
      <div className="glass-panel verification-matrix-card">
        {/* Verification Mode Selector Tabs */}
        <div className="matrix-tabs-header">
          <button 
            className={`matrix-tab ${activeMode === 'id' ? 'active' : ''}`}
            onClick={() => { setActiveMode('id'); setVerifyResult(null); }}
          >
            <Search size={18} />
            <span>Verify by Certificate ID</span>
          </button>

          <button 
            className={`matrix-tab ${activeMode === 'file' ? 'active' : ''}`}
            onClick={() => { setActiveMode('file'); setVerifyResult(null); }}
          >
            <UploadCloud size={18} />
            <span>Verify by PDF Document (Tamper Check)</span>
          </button>
        </div>

        <div className="matrix-body">
          {activeMode === 'id' ? (
            /* Mode 1: Search by ID */
            <div className="id-verifier-pane">
              <form 
                onSubmit={(e) => { e.preventDefault(); handleVerifyById(); }}
                className="search-input-group"
              >
                <div className="input-with-icon">
                  <Search className="field-icon" size={20} />
                  <input 
                    type="text"
                    className="input-field cert-id-input mono"
                    placeholder="Enter Certificate ID (e.g. CERT-2026-X8K9M3P2)"
                    value={certIdInput}
                    onChange={(e) => setCertIdInput(e.target.value)}
                  />
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary verify-submit-btn"
                  disabled={isVerifying || !certIdInput.trim()}
                >
                  {isVerifying ? (
                    <span className="spinner-dots">Verifying...</span>
                  ) : (
                    <>
                      <span>Verify Authenticity</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>

              {/* Quick Demo Pre-fill Links */}
              <div className="demo-links-row">
                <span className="demo-label">Demo Test Cases:</span>
                  <button 
                    type="button" 
                    className="demo-chip-btn"
                    onClick={() => {
                      const demoId = 'CERT-2026-AZZMDDUK';
                      setCertIdInput(demoId);
                      handleVerifyById(demoId);
                    }}
                  >
                    <Sparkles size={13} />
                    <span>Try Minted Demo (CERT-2026-AZZMDDUK)</span>
                  </button>
              </div>
            </div>
          ) : (
            /* Mode 2: Drag & Drop PDF File Tamper Check */
            <div className="file-verifier-pane">
              <div 
                className={`dropzone-box ${isDragging ? 'dragging' : ''} ${uploadedFile ? 'has-file' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('cert-file-input').click()}
              >
                <input 
                  type="file" 
                  id="cert-file-input" 
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileUpload(e.target.files[0])}
                />
                
                <div className="dropzone-laser-scan" />
                
                <div className="dropzone-icon-wrap">
                  <UploadCloud size={40} className="icon-cyan" />
                </div>
                
                <h3 className="dropzone-title">
                  {uploadedFile ? uploadedFile.name : 'Drag & Drop Certificate PDF Document'}
                </h3>
                <p className="dropzone-subtitle">
                  {uploadedFile 
                    ? `File size: ${(uploadedFile.size / 1024).toFixed(1)} KB — In-browser SHA-256 computed`
                    : 'Upload the original certificate to test byte-by-byte integrity against the blockchain'}
                </p>

                <button type="button" className="btn btn-secondary btn-sm dropzone-browse-btn">
                  Browse Local Files
                </button>
              </div>

              {computedFileHash && (
                <div className="computed-hash-strip mono">
                  <span className="hash-label">LOCAL BROWSER SHA-256:</span>
                  <span className="hash-value">{computedFileHash}</span>
                </div>
              )}
            </div>
          )}

          {/* Verification Status Feedback / Errors */}
          {verifyError && (
            <div className="status-banner error-banner">
              <XCircle size={20} />
              <div className="banner-text">
                <strong>Verification Request Failed</strong>
                <p>{verifyError}</p>
              </div>
            </div>
          )}

          {/* Verification Result Holographic Card */}
          {verifyResult && (
            <div className={`verification-result-card ${verifyResult.status?.toLowerCase()}`}>
              {/* Status Header Bar */}
              <div className="result-header-bar">
                <div className="result-status-group">
                  {verifyResult.status === 'VERIFIED' && (
                    <>
                      <div className="status-icon-ring verified">
                        <CheckCircle2 size={24} />
                      </div>
                      <div>
                        <h2 className="status-title verified">AUTHENTIC & CRYPTOGRAPHICALLY VERIFIED</h2>
                        <p className="status-sub">Smart contract consensus confirmed on Ethereum</p>
                      </div>
                    </>
                  )}

                  {verifyResult.status === 'REVOKED' && (
                    <>
                      <div className="status-icon-ring revoked">
                        <AlertTriangle size={24} />
                      </div>
                      <div>
                        <h2 className="status-title revoked">CERTIFICATE HAS BEEN REVOKED</h2>
                        <p className="status-sub">Nullified by college authority on blockchain</p>
                      </div>
                    </>
                  )}

                  {(verifyResult.status === 'NOT_FOUND' || verifyResult.status === 'NOT_FOUND_ON_CHAIN') && (
                    <>
                      <div className="status-icon-ring not-found">
                        <XCircle size={24} />
                      </div>
                      <div>
                        <h2 className="status-title not-found">UNREGISTERED / NOT FOUND</h2>
                        <p className="status-sub">No matching record found on the blockchain registry</p>
                      </div>
                    </>
                  )}

                  {verifyResult.status === 'HASH_MISMATCH' && (
                    <>
                      <div className="status-icon-ring mismatch">
                        <AlertTriangle size={24} />
                      </div>
                      <div>
                        <h2 className="status-title mismatch">TAMPERING DETECTED // HASH MISMATCH</h2>
                        <p className="status-sub">The PDF bytes differ from the immutable blockchain record</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="result-header-badge">
                  <span className={`badge badge-${verifyResult.status?.toLowerCase()}`}>
                    {verifyResult.status}
                  </span>
                </div>
              </div>

              {/* Certificate Metadata Details (if verified or revoked) */}
              {verifyResult.details && (
                <div className="result-details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Recipient Name</span>
                    <span className="detail-value highlight">{verifyResult.details.recipientName}</span>
                  </div>

                  {verifyResult.details.studentIdentifier && (
                    <div className="detail-item">
                      <span className="detail-label">Student ID</span>
                      <span className="detail-value mono">{verifyResult.details.studentIdentifier}</span>
                    </div>
                  )}

                  <div className="detail-item">
                    <span className="detail-label">Certificate Title</span>
                    <span className="detail-value">{verifyResult.details.certificateTitle || 'Certificate of Completion'}</span>
                  </div>

                  {verifyResult.details.achievement && (
                    <div className="detail-item">
                      <span className="detail-label">Achievement / Distinction</span>
                      <span className="detail-value badge-gold">{verifyResult.details.achievement}</span>
                    </div>
                  )}

                  <div className="detail-item">
                    <span className="detail-label">Event / Activity</span>
                    <span className="detail-value">{verifyResult.details.eventName}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Institution</span>
                    <span className="detail-value">{verifyResult.details.institutionName || 'College of Engineering'}</span>
                  </div>

                  {verifyResult.details.revocationReason && (
                    <div className="detail-item full-width revocation-box">
                      <span className="detail-label text-red">Revocation Reason</span>
                      <span className="detail-value text-red">{verifyResult.details.revocationReason}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Blockchain Cryptographic Proof Section */}
              {verifyResult.details?.blockchain && (
                <div className="blockchain-proof-panel">
                  <div className="proof-panel-title">
                    <Cpu size={16} className="icon-cyan" />
                    <span>ON-CHAIN CRYPTOGRAPHIC PROOF</span>
                  </div>

                  <div className="proof-rows">
                    <div className="proof-row">
                      <span className="proof-label">Contract Address:</span>
                      <div className="proof-val-group mono">
                        <span>{verifyResult.details.blockchain.contractAddress}</span>
                        <button 
                          className="copy-btn" 
                          onClick={() => handleCopy(verifyResult.details.blockchain.contractAddress, 'contract')}
                          title="Copy Contract Address"
                        >
                          {copiedField === 'contract' ? <CheckCircle2 size={13} className="text-emerald" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>

                    {verifyResult.details.blockchain.txHash && (
                      <div className="proof-row">
                        <span className="proof-label">Transaction Hash:</span>
                        <div className="proof-val-group mono">
                          <span>{verifyResult.details.blockchain.txHash}</span>
                          <button 
                            className="copy-btn" 
                            onClick={() => handleCopy(verifyResult.details.blockchain.txHash, 'tx')}
                            title="Copy Tx Hash"
                          >
                            {copiedField === 'tx' ? <CheckCircle2 size={13} className="text-emerald" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="proof-row">
                      <span className="proof-label">SHA-256 PDF Hash:</span>
                      <div className="proof-val-group mono">
                        <span>{verifyResult.details.documentHash || verifyResult.computedHash}</span>
                        <button 
                          className="copy-btn" 
                          onClick={() => handleCopy(verifyResult.details.documentHash || verifyResult.computedHash, 'hash')}
                          title="Copy Document Hash"
                        >
                          {copiedField === 'hash' ? <CheckCircle2 size={13} className="text-emerald" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>

                    {verifyResult.details.ipfs && (
                      <div className="proof-row">
                        <span className="proof-label">IPFS CID (Pinata):</span>
                        <div className="proof-val-group mono">
                          <a 
                            href={verifyResult.details.ipfs.gatewayUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="ipfs-link"
                          >
                            <span>{verifyResult.details.ipfs.cid}</span>
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
