import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  ExternalLink, 
  Copy, 
  CheckCircle2, 
  ShieldCheck, 
  Clock, 
  RefreshCw,
  Hash,
  Activity,
  Layers
} from 'lucide-react';
import { api } from '../services/api';
import { formatAddressOrHash } from '../services/crypto';

export default function BlockchainLedger() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.getAuditLogs({ limit: 30 });
      setAuditLogs(res.data?.items || res.data || []);
    } catch (err) {
      console.warn('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="blockchain-ledger-section">
      <div className="ledger-hero">
        <div className="flex justify-between items-center w-full">
          <div>
            <span className="badge badge-chain">
              <Activity size={14} />
              <span>LIVE AUDIT STREAM</span>
            </span>
            <h2>Blockchain & Protocol Audit Stream</h2>
            <p>Cryptographic chronological records of certificate minting, hash anchoring, and role events.</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="glass-panel ledger-timeline-card">
        {auditLogs.length === 0 ? (
          <div className="empty-logs-box">
            <Layers size={36} className="text-muted" />
            <p className="mt-2 text-muted">
              {loading ? 'Fetching blockchain audit records...' : 'No transaction logs yet. Issue a certificate to generate on-chain events.'}
            </p>
          </div>
        ) : (
          <div className="timeline-container">
            {auditLogs.map((log, idx) => (
              <div key={log.id || idx} className="timeline-item">
                <div className="timeline-indicator-dot" />
                <div className="timeline-content">
                  <div className="timeline-header">
                    <span className="action-tag mono">{log.action}</span>
                    <span className="timestamp-tag">
                      <Clock size={12} />
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </span>
                  </div>

                  <div className="timeline-meta-grid">
                    <div>
                      <span className="label">Entity Type:</span>
                      <span className="val mono">{log.entityType}</span>
                    </div>

                    {log.entityId && (
                      <div>
                        <span className="label">Entity ID:</span>
                        <span className="val mono text-xs">{formatAddressOrHash(log.entityId, 8, 6)}</span>
                      </div>
                    )}

                    {log.actor?.name && (
                      <div>
                        <span className="label">Actor:</span>
                        <span className="val">{log.actor.name} ({log.actor.role})</span>
                      </div>
                    )}
                  </div>

                  {log.metadata && (
                    <div className="metadata-json-box mono">
                      <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
