import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  UploadCloud, 
  FileCheck2, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink, 
  Download, 
  Trash2, 
  RefreshCw, 
  Search, 
  Filter, 
  Layers, 
  Sparkles,
  QrCode,
  Calendar,
  Award,
  User,
  Building
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { api } from '../services/api';
import { formatAddressOrHash } from '../services/crypto';

export default function StudioDashboard({ user, onRequireLogin, systemStatus }) {
  const [activeSubTab, setActiveSubTab] = useState('single'); // 'single' | 'bulk' | 'vault' | 'events'
  
  // Data states
  const [events, setEvents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  
  // Single Certificate Form
  const [singleForm, setSingleForm] = useState({
    studentName: 'Arnav Chaudhary',
    studentId: 'CS-2026-002',
    achievement: 'Special Mention',
    certificateTitle: 'Certificate of Excellence',
  });
  const [isIssuingSingle, setIsIssuingSingle] = useState(false);
  const [issuedSingleResult, setIssuedSingleResult] = useState(null);
  const [singleError, setSingleError] = useState(null);

  // Bulk CSV/XLSX Form
  const [csvFile, setCsvFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [bulkRowsEdited, setBulkRowsEdited] = useState(false);
  const [isPreviewingBulk, setIsPreviewingBulk] = useState(false);
  const [isIssuingBulk, setIsIssuingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkError, setBulkError] = useState(null);

  // Vault state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vaultLoading, setVaultLoading] = useState(false);

  // Revocation modal
  const [revokingCert, setRevokingCert] = useState(null);
  const [revocationReason, setRevocationReason] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);

  // New Event Form
  const [eventForm, setEventForm] = useState({
    name: 'HackVenture 2026 Hackathon',
    description: 'National 36-hour blockchain and AI hackathon',
    eventDate: new Date().toISOString().split('T')[0],
    organizingBody: 'Department of Computer Engineering',
    institutionName: 'Institute of Engineering and Technology',
    signatoryName: 'Dr. R. K. Sharma',
    signatoryTitle: 'Dean of Academic Affairs',
    category: 'HACKATHONS',
    certificateType: 'PARTICIPATION',
    validityPolicy: 'PERMANENT',
    validityDays: '',
    validUntil: '',
  });
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [eventSuccess, setEventSuccess] = useState(null);

  const validateBulkRows = (rows) => {
    const seen = new Set();
    return rows.map((row) => {
      const identity = (row.id || row.name).trim().toLowerCase();
      const duplicate = identity && seen.has(identity);
      if (identity) seen.add(identity);
      return {
        ...row,
        invalid: !row.name.trim() || duplicate,
        error: !row.name.trim() ? 'Student name is required' : (duplicate ? 'Duplicate participant' : null),
      };
    });
  };

  useEffect(() => {
    loadInitialData();
  }, [user]);

  const loadInitialData = async () => {
    try {
      const [eventsRes, templatesRes] = await Promise.all([
        api.getEvents().catch(() => ({ data: { items: [] } })),
        api.getTemplates().catch(() => ({ data: [] })),
      ]);

      const evList = Array.isArray(eventsRes.data) ? eventsRes.data : (eventsRes.data?.items || []);
      const tmList = Array.isArray(templatesRes.data) ? templatesRes.data : (templatesRes.data?.items || []);

      setEvents(evList);
      setTemplates(tmList);

      if (evList.length > 0 && (!selectedEventId || !evList.some(e => e.id === selectedEventId))) {
        setSelectedEventId(evList[0].id);
      }
      if (tmList.length > 0 && (!selectedTemplateId || !tmList.some(t => t.id === selectedTemplateId))) {
        setSelectedTemplateId(tmList[0].id);
      }

      loadCertificates();
    } catch (err) {
      console.warn('Failed to load initial studio data:', err);
    }
  };

  const loadCertificates = async () => {
    setVaultLoading(true);
    try {
      const res = await api.getCertificates({ limit: 50 });
      const certList = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setCertificates(certList);
    } catch (err) {
      console.warn('Failed to load certificates:', err);
    } finally {
      setVaultLoading(false);
    }
  };

  // Issue Single Certificate
  const handleIssueSingle = async (e) => {
    e.preventDefault();
    if (!user) {
      onRequireLogin();
      return;
    }
    const targetEventId = selectedEventId || events[0]?.id;
    if (!targetEventId) {
      setSingleError('Please select or create an event first.');
      return;
    }

    setIsIssuingSingle(true);
    setSingleError(null);
    setIssuedSingleResult(null);

    try {
      const payload = {
        eventId: targetEventId,
        templateId: selectedTemplateId || templates[0]?.id || undefined,
        studentName: singleForm.studentName,
        studentId: singleForm.studentId || undefined,
        achievement: singleForm.achievement || undefined,
        certificateTitle: singleForm.certificateTitle || undefined,
      };

      const res = await api.issueSingle(payload);
      setIssuedSingleResult(res.data);
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      loadCertificates();
    } catch (err) {
      const conflictCertId = err.data?.error?.details?.certificateId;
      if (conflictCertId) {
        setSingleError(`Duplicate: Certificate already issued for this student (ID: ${conflictCertId}). Please change the Student ID or Name for a new recipient.`);
      } else {
        setSingleError(err.message || 'Issuance failed');
      }
    } finally {
      setIsIssuingSingle(false);
    }
  };

  // Normalize CSV/XLSX through the backend parser for a consistent preview.
  const handleCsvSelect = async (file) => {
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setBulkError('Only CSV and XLSX files are accepted.');
      return;
    }

    setCsvFile(file);
    setParsedRows([]);
    setBulkError(null);
    setBulkResult(null);

    setIsPreviewingBulk(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.previewBulk(formData);
      const recipients = res.data?.recipients || [];
      setParsedRows(validateBulkRows(recipients.map((recipient) => ({
        row: recipient.rowNumber,
        name: recipient.studentName || '',
        id: recipient.studentId || '',
        achievement: recipient.achievement || 'Participant',
        certificateTitle: recipient.certificateTitle || '',
      }))));
      setBulkRowsEdited(false);
    } catch (err) {
      setBulkError(err.message || 'Unable to preview recipient file');
    } finally {
      setIsPreviewingBulk(false);
    }
  };

  // Submit Bulk Issuance
  const handleIssueBulk = async () => {
    if (!user) {
      onRequireLogin();
      return;
    }
    if (!csvFile || !selectedEventId) {
      setBulkError('Please select an event and upload a CSV or XLSX file.');
      return;
    }
    if (parsedRows.some((row) => row.invalid)) {
      setBulkError('Fix or remove rows with a missing student name before issuing.');
      return;
    }

    setIsIssuingBulk(true);
    setBulkError(null);
    setBulkResult(null);

    try {
      const formData = new FormData();
      formData.append('eventId', selectedEventId);
      if (selectedTemplateId) {
        formData.append('templateId', selectedTemplateId);
      }
      if (bulkRowsEdited) {
        formData.append('recipients', JSON.stringify(parsedRows.map((row) => ({
          rowNumber: row.row,
          studentName: row.name.trim(),
          studentId: row.id.trim() || null,
          achievement: row.achievement.trim() || null,
          certificateTitle: row.certificateTitle?.trim() || null,
        }))));
        formData.append('originalFilename', csvFile.name);
      } else {
        formData.append('file', csvFile);
      }

      const res = await api.issueBulk(formData);
      setBulkResult(res.data);
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
      loadCertificates();
    } catch (err) {
      setBulkError(err.message || 'Bulk issuance failed');
    } finally {
      setIsIssuingBulk(false);
    }
  };

  // Download Sample CSV template
  const downloadSampleCsv = () => {
    const csvContent = 'student_name,student_id,achievement\n"Arnav Chaudhary","CS-2026-001","First Place Winner"\n"Shravanya Andhale","CS-2026-002","Special Mention"\n"Karuna Jeswani","CS-2026-003","Runner Up"\n"Nikhil Kadam","CS-2026-004","Finalist"';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_recipients.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Revoke Certificate
  const handleConfirmRevocation = async () => {
    if (!revokingCert) return;
    setIsRevoking(true);
    try {
      await api.revokeCertificate(revokingCert.certificateId, revocationReason);
      setRevokingCert(null);
      setRevocationReason('');
      loadCertificates();
    } catch (err) {
      alert(`Revocation failed: ${err.message}`);
    } finally {
      setIsRevoking(false);
    }
  };

  // Create Event
  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!user) {
      onRequireLogin();
      return;
    }
    setIsCreatingEvent(true);
    setEventSuccess(null);
    try {
      const eventData = {
        ...eventForm,
        validityDays: eventForm.validityPolicy === 'DAYS_AFTER_ISSUE'
          ? Number(eventForm.validityDays)
          : undefined,
        validUntil: eventForm.validityPolicy === 'UNTIL_DATE'
          ? eventForm.validUntil
          : undefined,
      };
      const res = await api.createEvent({
        ...eventData,
        defaultTemplateId: selectedTemplateId || undefined,
      });
      setEventSuccess(`Event "${res.data?.name || eventForm.name}" created successfully!`);
      loadInitialData();
    } catch (err) {
      alert(`Failed to create event: ${err.message}`);
    } finally {
      setIsCreatingEvent(false);
    }
  };

  // Filtered certificates for vault
  const filteredCerts = certificates.filter(c => {
    const matchesSearch = !searchQuery || 
      c.recipientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.certificateId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.studentIdentifier?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedEvent = events.find(e => e.id === selectedEventId) || events[0];

  return (
    <div className="studio-dashboard-section">
      {/* Studio Header */}
      <div className="studio-hero-bar">
        <div className="studio-headline">
          <span className="badge badge-chain">
            <Layers size={13} />
            <span>AUTHORITY ISSUANCE MATRIX</span>
          </span>
          <h2>Certificate Studio & Registry Vault</h2>
          <p>Generate cryptographic certificates, render customized Canva layouts, and record SHA-256 hashes onto Ethereum.</p>
        </div>

        {/* Action Tabs Navigation */}
        <div className="studio-subnav">
          <button 
            className={`subnav-btn ${activeSubTab === 'single' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('single')}
          >
            <Sparkles size={16} />
            <span>Single Issuance</span>
          </button>

          <button 
            className={`subnav-btn ${activeSubTab === 'bulk' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('bulk')}
          >
            <FileSpreadsheet size={16} />
            <span>Bulk CSV/XLSX Engine</span>
          </button>

          <button 
            className={`subnav-btn ${activeSubTab === 'vault' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('vault')}
          >
            <FileCheck2 size={16} />
            <span>Registry Vault ({certificates.length})</span>
          </button>

          <button 
            className={`subnav-btn ${activeSubTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('events')}
          >
            <Calendar size={16} />
            <span>Event Management</span>
          </button>
        </div>
      </div>

      {/* --- SUB-TAB 1: SINGLE CERTIFICATE FORGE & LIVE CANVA PREVIEW --- */}
      {activeSubTab === 'single' && (
        <div className="single-forge-layout">
          {/* Left Form Column */}
          <div className="glass-panel forge-form-card">
            <h3 className="card-heading">
              <PlusCircle size={20} className="icon-cyan" />
              <span>Issue Single Certificate</span>
            </h3>

            <form onSubmit={handleIssueSingle} className="forge-form">
              <div className="form-group">
                <div className="flex justify-between items-center mb-1">
                  <label className="field-label mb-0">Select College Event</label>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm py-1 px-2 text-xs" 
                    onClick={loadInitialData}
                    title="Reload Events from Database"
                  >
                    <RefreshCw size={12} />
                    <span>Reload Events</span>
                  </button>
                </div>
                <select 
                  className="input-field"
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  required
                >
                  {events.length === 0 ? (
                    <option value="">No events loaded — Please log in as Teacher/Admin</option>
                  ) : (
                    events.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.name} ({new Date(ev.eventDate).toLocaleDateString()})</option>
                    ))
                  )}
                </select>
                {events.length === 0 && (
                  <p className="text-xs text-red mt-1">
                    No active events loaded. Sign in using Authority Login (Teacher or Admin) or click "Reload Events".
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="field-label">Certificate Template</label>
                <select 
                  className="input-field"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                >
                  {templates.length === 0 ? (
                    <option value="">Canva Default Template (Excellence Landscape)</option>
                  ) : (
                    templates.map(tm => (
                      <option key={tm.id} value={tm.id}>{tm.name} ({tm.category})</option>
                    ))
                  )}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="field-label">Event Category</label>
                  <select
                    className="input-field"
                    value={eventForm.category}
                    onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}
                    required
                  >
                    <option value="HACKATHONS">Hackathon</option>
                    <option value="TECHNICAL_WORKSHOPS">Workshop</option>
                    <option value="SYMPOSIUMS">Symposium</option>
                    <option value="SEMINARS">Seminar</option>
                    <option value="FACULTY_DEVELOPMENT">Faculty Development</option>
                    <option value="CULTURAL">Cultural</option>
                    <option value="SPORTS">Sports</option>
                    <option value="CLUBS_VOLUNTEERING">Clubs and Volunteering</option>
                    <option value="SOCIAL_OUTREACH">Social Outreach</option>
                    <option value="ENTREPRENEURSHIP">Entrepreneurship</option>
                    <option value="CAREER_DEVELOPMENT">Career Development</option>
                    <option value="ACADEMIC_RECOGNITION">Academic Recognition</option>
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label className="field-label">Certificate Type</label>
                  <select
                    className="input-field"
                    value={eventForm.certificateType}
                    onChange={(e) => setEventForm({ ...eventForm, certificateType: e.target.value })}
                    required
                  >
                    <option value="PARTICIPATION">Participation</option>
                    <option value="COMPLETION">Completion</option>
                    <option value="WINNER">Winner</option>
                    <option value="RUNNER_UP">Runner-up</option>
                    <option value="FINALIST">Finalist</option>
                    <option value="BEST_PAPER">Best Paper</option>
                    <option value="RESOURCE_PERSON">Resource Person</option>
                    <option value="COORDINATOR">Coordinator</option>
                    <option value="VOLUNTEER_APPRECIATION">Volunteer Appreciation</option>
                    <option value="MERIT">Merit</option>
                    <option value="ACHIEVEMENT">Achievement</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="field-label">Certificate Validity</label>
                  <select
                    className="input-field"
                    value={eventForm.validityPolicy}
                    onChange={(e) => setEventForm({ ...eventForm, validityPolicy: e.target.value })}
                    required
                  >
                    <option value="PERMANENT">Permanent</option>
                    <option value="DAYS_AFTER_ISSUE">Expires after days</option>
                    <option value="UNTIL_DATE">Valid until date</option>
                  </select>
                </div>

                {eventForm.validityPolicy === 'DAYS_AFTER_ISSUE' && (
                  <div className="form-group flex-1">
                    <label className="field-label">Validity Days</label>
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      className="input-field"
                      value={eventForm.validityDays}
                      onChange={(e) => setEventForm({ ...eventForm, validityDays: e.target.value })}
                      required
                    />
                  </div>
                )}

                {eventForm.validityPolicy === 'UNTIL_DATE' && (
                  <div className="form-group flex-1">
                    <label className="field-label">Valid Until</label>
                    <input
                      type="date"
                      className="input-field"
                      value={eventForm.validUntil}
                      onChange={(e) => setEventForm({ ...eventForm, validUntil: e.target.value })}
                      required
                    />
                  </div>
                )}
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="field-label">Student Full Name</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={singleForm.studentName}
                    onChange={(e) => setSingleForm({ ...singleForm, studentName: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group flex-1">
                  <label className="field-label">Student ID / Roll No</label>
                  <input 
                    type="text" 
                    className="input-field mono" 
                    value={singleForm.studentId}
                    onChange={(e) => setSingleForm({ ...singleForm, studentId: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="field-label">Certificate Title</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={singleForm.certificateTitle}
                    onChange={(e) => setSingleForm({ ...singleForm, certificateTitle: e.target.value })}
                  />
                </div>

                <div className="form-group flex-1">
                  <label className="field-label">Achievement / Distinction</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={singleForm.achievement}
                    onChange={(e) => setSingleForm({ ...singleForm, achievement: e.target.value })}
                  />
                </div>
              </div>

              {singleError && (
                <div className="status-banner error-banner">
                  <AlertCircle size={18} />
                  <span>{singleError}</span>
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary forge-submit-btn"
                disabled={isIssuingSingle}
              >
                {isIssuingSingle ? (
                  <span>Minting to Blockchain...</span>
                ) : (
                  <>
                    <Sparkles size={17} />
                    <span>Generate & Register on Blockchain</span>
                  </>
                )}
              </button>
            </form>

            {/* Issued Confirmation Card */}
            {issuedSingleResult && (
              <div className="issued-success-banner">
                <div className="success-header">
                  <CheckCircle2 size={22} className="text-emerald" />
                  <div>
                    <h4>Certificate Minted & Anchored</h4>
                    <p className="mono">ID: {issuedSingleResult.certificateId}</p>
                  </div>
                </div>
                <div className="success-actions">
                  <a 
                    href={api.getCertificatePdfUrl(issuedSingleResult.id || issuedSingleResult.certificateId)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    <Download size={14} />
                    <span>Download PDF</span>
                  </a>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(issuedSingleResult.verificationUrl);
                      alert('Verification URL copied!');
                    }}
                  >
                    <span>Copy Verification URL</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Live Certificate Preview Column */}
          <div className="glass-panel live-preview-panel">
            <div className="preview-header">
              <span className="preview-label">LIVE CANVA PREVIEW CANVAS</span>
              <span className="badge badge-chain">VECTOR RENDER</span>
            </div>

            {/* Certificate Visualizer Frame */}
            <div className="certificate-mockup-frame">
              <div className="cert-border-outer">
                <div className="cert-border-inner">
                  <div className="cert-watermark-seal">
                    <Award size={48} />
                  </div>

                  <div className="cert-header">
                    <span className="cert-inst-name">{selectedEvent?.institutionName || 'INSTITUTE OF TECHNOLOGY'}</span>
                    <span className="cert-doc-title">{singleForm.certificateTitle.toUpperCase()}</span>
                  </div>

                  <div className="cert-recipient-block">
                    <span className="cert-awarded-text">THIS IS PROUDLY PRESENTED TO</span>
                    <h2 className="cert-recipient-name">{singleForm.studentName || 'Student Name'}</h2>
                    <span className="cert-student-id mono">{singleForm.studentId || 'ID-0000'}</span>
                  </div>

                  <div className="cert-body-block">
                    <p className="cert-body-text">
                      For outstanding performance and achievement as <strong>{singleForm.achievement || 'Participant'}</strong> in the <strong>{selectedEvent?.name || 'Academic Event'}</strong> organized by {selectedEvent?.organizingBody || 'College Department'}.
                    </p>
                  </div>

                  <div className="cert-footer-row">
                    <div className="cert-qr-mock">
                      <QrCode size={40} className="icon-cyan" />
                      <span className="mono cert-qr-caption">SCAN TO VERIFY</span>
                    </div>

                    <div className="cert-sig-box">
                      <div className="cert-sig-line" />
                      <span className="cert-sig-name">{selectedEvent?.signatoryName || 'Authorized Signatory'}</span>
                      <span className="cert-sig-title">{selectedEvent?.signatoryTitle || 'Dean of Engineering'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB-TAB 2: BULK CSV BATCH ISSUANCE --- */}
      {activeSubTab === 'bulk' && (
        <div className="bulk-engine-layout glass-panel">
          <div className="bulk-header-row">
            <div>
              <h3 className="card-heading">
                <FileSpreadsheet size={22} className="icon-cyan" />
                <span>Bulk Certificate Issuance Engine</span>
              </h3>
              <p className="card-sub">Upload CSV or XLSX to mint 1 to 200 certificates in a single batch with automated PDF generation and blockchain anchoring.</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={downloadSampleCsv}>
              <Download size={15} />
              <span>Download Demo CSV</span>
            </button>
          </div>

          <div className="bulk-config-row">
            <div className="form-group flex-1">
              <label className="field-label">Target Event</label>
              <select 
                className="input-field"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group flex-1">
              <label className="field-label">Target Template</label>
              <select 
                className="input-field"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                {templates.map(tm => (
                  <option key={tm.id} value={tm.id}>{tm.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* CSV/XLSX File Dropzone */}
          <div 
            className="csv-dropzone-box"
            onClick={() => document.getElementById('recipient-file-input').click()}
          >
            <input 
              type="file" 
              id="recipient-file-input"
              accept=".csv,.xlsx"
              style={{ display: 'none' }}
              onChange={(e) => handleCsvSelect(e.target.files[0])}
            />
            <UploadCloud size={36} className="icon-cyan" />
            <h4>{isPreviewingBulk ? 'Validating recipient file...' : (csvFile ? csvFile.name : 'Click to Upload Recipients CSV or XLSX')}</h4>
            <p>Required column: student_name. Optional: student_id, achievement, certificate_title</p>
          </div>

          {bulkError && (
            <div className="status-banner error-banner">
              <AlertCircle size={18} />
              <span>{bulkError}</span>
            </div>
          )}

          {/* Parsed Recipients Preview Table */}
          {parsedRows.length > 0 && (
            <div className="parsed-preview-section">
              <div className="preview-count-strip">
                <span>
                  {parsedRows.some((row) => row.invalid) ? 'Review recipient errors' : 'Validated'}
                  {' '}<strong>{parsedRows.length}</strong> Recipients for Blockchain Batch
                </span>
                <button 
                  className="btn btn-primary"
                  onClick={handleIssueBulk}
                  disabled={isIssuingBulk || isPreviewingBulk || parsedRows.some((row) => row.invalid)}
                >
                  {isIssuingBulk ? (
                    <span>Minting {parsedRows.length} Certificates On-Chain...</span>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Start Batch Issuance ({parsedRows.length})</span>
                    </>
                  )}
                </button>
              </div>

              <div className="table-responsive">
                <table className="custom-data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student Name</th>
                      <th>Student ID</th>
                      <th>Achievement</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row) => (
                      <tr key={row.row}>
                        <td className="mono">{row.row}</td>
                        <td>
                          <input
                            className="input-field"
                            value={row.name}
                            aria-label={`Student name for row ${row.row}`}
                            onChange={(e) => {
                              const name = e.target.value;
                              setBulkRowsEdited(true);
                              setParsedRows((rows) => validateBulkRows(rows.map((item) => item.row === row.row
                                ? { ...item, name }
                                : item)));
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="input-field mono"
                            value={row.id}
                            aria-label={`Student ID for row ${row.row}`}
                            onChange={(e) => {
                              setBulkRowsEdited(true);
                              setParsedRows((rows) => validateBulkRows(rows.map((item) => item.row === row.row
                                ? { ...item, id: e.target.value }
                                : item)));
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="input-field"
                            value={row.achievement}
                            aria-label={`Achievement for row ${row.row}`}
                            onChange={(e) => {
                              setBulkRowsEdited(true);
                              setParsedRows((rows) => rows.map((item) => item.row === row.row
                                ? { ...item, achievement: e.target.value }
                                : item));
                            }}
                          />
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className={`badge ${row.invalid ? 'badge-danger' : 'badge-pending'}`}>
                              {row.invalid ? 'INVALID' : 'READY'}
                            </span>
                            {row.error && <span className="text-red text-xs">{row.error}</span>}
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              title={`Remove row ${row.row}`}
                              onClick={() => {
                                setBulkRowsEdited(true);
                                setParsedRows((rows) => validateBulkRows(rows.filter((item) => item.row !== row.row)));
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Bulk Results Banner */}
          {bulkResult && (
            <div className="bulk-completed-box">
              <div className="completed-head">
                <CheckCircle2 size={24} className="text-emerald" />
                <div>
                  <h4>Batch Issuance Completed ({bulkResult.batch?.status})</h4>
                  <p>Accepted: {bulkResult.batch?.acceptedRows} | Rejected: {bulkResult.batch?.rejectedRows}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- SUB-TAB 3: CERTIFICATE REGISTRY VAULT --- */}
      {activeSubTab === 'vault' && (
        <div className="vault-layout glass-panel">
          <div className="vault-toolbar">
            <div className="search-wrap">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                className="input-field search-input" 
                placeholder="Search by student, ID, or certificate ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <Filter size={16} />
              <select 
                className="input-field filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="CONFIRMED">CONFIRMED (On-Chain)</option>
                <option value="REVOKED">REVOKED</option>
                <option value="PENDING">PENDING</option>
              </select>
              <button className="btn btn-secondary btn-sm" onClick={loadCertificates}>
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {/* Registry Table */}
          <div className="table-responsive">
            <table className="custom-data-table">
              <thead>
                <tr>
                  <th>Certificate ID</th>
                  <th>Recipient</th>
                  <th>Event</th>
                  <th>Document Hash</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCerts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-6 text-muted">
                      {vaultLoading ? 'Loading certificates...' : 'No matching certificates found.'}
                    </td>
                  </tr>
                ) : (
                  filteredCerts.map((cert) => (
                    <tr key={cert.id || cert.certificateId}>
                      <td className="mono highlight-id">{cert.certificateId}</td>
                      <td>
                        <div className="recipient-cell">
                          <span className="font-semibold">{cert.recipientName}</span>
                          <span className="mono text-muted text-xs">{cert.studentIdentifier}</span>
                        </div>
                      </td>
                      <td>{cert.event?.name || 'College Event'}</td>
                      <td className="mono text-xs">{formatAddressOrHash(cert.documentHash, 6, 4)}</td>
                      <td>
                        <span className={`badge badge-${cert.status?.toLowerCase()}`}>
                          {cert.status}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons-cell">
                          <a 
                            href={api.getCertificatePdfUrl(cert.id || cert.certificateId)}
                            target="_blank" 
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm action-btn"
                            title="Download PDF"
                          >
                            <Download size={13} />
                          </a>

                          {cert.status === 'CONFIRMED' && (
                            <button 
                              className="btn btn-danger btn-sm action-btn"
                              title="Revoke Certificate"
                              onClick={() => setRevokingCert(cert)}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- SUB-TAB 4: EVENT MANAGEMENT --- */}
      {activeSubTab === 'events' && (
        <div className="events-manager-layout glass-panel">
          <h3 className="card-heading">
            <Calendar size={22} className="icon-cyan" />
            <span>Create New Event</span>
          </h3>

          <form onSubmit={handleCreateEvent} className="events-form">
            <div className="form-row">
              <div className="form-group flex-2">
                <label className="field-label">Event Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={eventForm.name}
                  onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group flex-1">
                <label className="field-label">Event Date</label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={eventForm.eventDate}
                  onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label className="field-label">Organizing Body / Department</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={eventForm.organizingBody}
                  onChange={(e) => setEventForm({ ...eventForm, organizingBody: e.target.value })}
                  required
                />
              </div>

              <div className="form-group flex-1">
                <label className="field-label">Institution Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={eventForm.institutionName}
                  onChange={(e) => setEventForm({ ...eventForm, institutionName: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label className="field-label">Signatory Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={eventForm.signatoryName}
                  onChange={(e) => setEventForm({ ...eventForm, signatoryName: e.target.value })}
                />
              </div>

              <div className="form-group flex-1">
                <label className="field-label">Signatory Title</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={eventForm.signatoryTitle}
                  onChange={(e) => setEventForm({ ...eventForm, signatoryTitle: e.target.value })}
                />
              </div>
            </div>

            {eventSuccess && (
              <div className="status-banner success-banner">
                <CheckCircle2 size={18} />
                <span>{eventSuccess}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={isCreatingEvent}>
              {isCreatingEvent ? 'Creating Event...' : 'Create Event'}
            </button>
          </form>
        </div>
      )}

      {/* Revocation Confirmation Modal */}
      {revokingCert && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-card">
            <h3 className="modal-title text-red">Revoke Certificate</h3>
            <p className="modal-desc">
              Are you sure you want to revoke certificate <strong>{revokingCert.certificateId}</strong> issued to <strong>{revokingCert.recipientName}</strong>?
              This action writes an irreversible revocation record to the blockchain.
            </p>

            <div className="form-group my-4">
              <label className="field-label">Revocation Reason (Mandatory for Audit)</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="e.g. Plagiarism / Ineligibility / Duplicate"
                value={revocationReason}
                onChange={(e) => setRevocationReason(e.target.value)}
                required
              />
            </div>

            <div className="modal-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setRevokingCert(null)}
                disabled={isRevoking}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-danger"
                onClick={handleConfirmRevocation}
                disabled={isRevoking || !revocationReason.trim()}
              >
                {isRevoking ? 'Revoking on Chain...' : 'Confirm Revocation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
