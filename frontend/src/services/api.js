// Complete REST API Client for Arnav's Backend (http://localhost:4000/api/v1)

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

class ApiClient {
  constructor() {
    this.accessToken = localStorage.getItem('cert_access_token');
    this.refreshToken = localStorage.getItem('cert_refresh_token');
    this.user = JSON.parse(localStorage.getItem('cert_user') || 'null');
  }

  setSession(tokenPayload, user) {
    const accessToken = tokenPayload?.accessToken || tokenPayload?.tokens?.accessToken;
    const refreshToken = tokenPayload?.refreshToken || tokenPayload?.tokens?.refreshToken;
    const userData = user || tokenPayload?.user;

    if (accessToken) {
      this.accessToken = accessToken;
      localStorage.setItem('cert_access_token', accessToken);
    }
    if (refreshToken) {
      this.refreshToken = refreshToken;
      localStorage.setItem('cert_refresh_token', refreshToken);
    }
    if (userData) {
      this.user = userData;
      localStorage.setItem('cert_user', JSON.stringify(userData));
    }
  }

  clearSession() {
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    localStorage.removeItem('cert_access_token');
    localStorage.removeItem('cert_refresh_token');
    localStorage.removeItem('cert_user');
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = { ...options.headers };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    let response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (err) {
      throw new Error(`Network error: ${err.message}. Ensure backend is running at ${API_BASE}`);
    }

    // Attempt token refresh on 401 if refresh token is present
    if (response.status === 401 && this.refreshToken && !endpoint.includes('/auth/')) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        response = await fetch(url, { ...options, headers });
      } else {
        this.clearSession();
      }
    }

    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const message = data?.error?.message || data?.message || `HTTP ${response.status}: ${response.statusText}`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async refreshTokens() {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data?.data?.accessToken) {
        this.setSession(data.data);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // --- Auth Endpoints ---
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setSession(data.data, data.data.user);
    return data.data;
  }

  async logout() {
    try {
      if (this.refreshToken) {
        await this.request('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
      }
    } finally {
      this.clearSession();
    }
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // --- System Health & Readiness ---
  async getReadyStatus() {
    const host = API_BASE.replace('/api/v1', '');
    const res = await fetch(`${host}/ready`);
    return res.json();
  }

  // --- Events Endpoints ---
  async getEvents(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/events${query ? `?${query}` : ''}`);
  }

  async createEvent(eventData) {
    return this.request('/events', {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
  }

  async getEvent(id) {
    return this.request(`/events/${id}`);
  }

  async getEventStats(id) {
    return this.request(`/events/${id}/stats`);
  }

  // --- Templates Endpoints ---
  async getTemplates() {
    return this.request('/templates');
  }

  async getTemplate(id) {
    return this.request(`/templates/${id}`);
  }

  getTemplatePreviewUrl(id) {
    return `${API_BASE}/templates/${id}/preview`;
  }

  // --- Certificates Endpoints ---
  async issueSingle(payload) {
    return this.request('/certificates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async issueBulk(formData) {
    return this.request('/certificates/bulk', {
      method: 'POST',
      body: formData,
    });
  }

  async getCertificates(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/certificates${query ? `?${query}` : ''}`);
  }

  async getCertificate(id) {
    return this.request(`/certificates/${id}`);
  }

  getCertificatePdfUrl(id) {
    return `${API_BASE}/certificates/${id}/pdf`;
  }

  async revokeCertificate(id, reason) {
    return this.request(`/certificates/${id}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async retryCertificate(id) {
    return this.request(`/certificates/${id}/retry`, {
      method: 'POST',
    });
  }

  // --- Public Verification Endpoints ---
  async verifyById(certificateId) {
    return this.request(`/verify/${encodeURIComponent(certificateId)}`);
  }

  async verifyDocument(file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request('/verify/document', {
      method: 'POST',
      body: formData,
    });
  }

  // --- Audit Logs ---
  async getAuditLogs(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/audit${query ? `?${query}` : ''}`);
  }
}

export const api = new ApiClient();
export default api;
