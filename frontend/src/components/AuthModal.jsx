import React, { useState } from 'react';
import { LogIn, X, Sparkles, AlertCircle, Shield } from 'lucide-react';
import { api } from '../services/api';

export default function AuthModal({ isOpen, onClose, onLoginSuccess }) {
  const [email, setEmail] = useState('teacher@college.edu');
  const [password, setPassword] = useState('Teacher@12345');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.login(email, password);
      onLoginSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err.message || 'Login failed. Check credentials or backend connectivity.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-panel modal-card auth-modal-card">
        <div className="modal-header">
          <div className="modal-title-group">
            <Shield size={20} className="icon-cyan" />
            <h3>Authority Authentication</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="modal-desc">
          Sign in to access the Certificate Studio, configure Canva templates, issue credentials, and submit blockchain transactions.
        </p>

        {/* Quick Demo Fill Buttons */}
        <div className="demo-credentials-strip">
          <span className="demo-tip-label">Quick Demo Access:</span>
          <div className="demo-btn-row">
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={() => fillCredentials('teacher@college.edu', 'Teacher@12345')}
            >
              <Sparkles size={13} />
              <span>Teacher Account</span>
            </button>
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={() => fillCredentials('admin@college.edu', 'Admin@12345')}
            >
              <Shield size={13} />
              <span>Admin Account</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleLogin} className="auth-form mt-4">
          <div className="form-group mb-3">
            <label className="field-label">College Email</label>
            <input 
              type="email" 
              className="input-field" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group mb-4">
            <label className="field-label">Password</label>
            <input 
              type="password" 
              className="input-field" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="status-banner error-banner mb-3">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In to Portal'}
          </button>
        </form>
      </div>
    </div>
  );
}
