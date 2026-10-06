const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/prisma');

jest.setTimeout(60000);

describe('Full End-to-End API Integration', () => {
  let adminToken;
  let teacherToken;
  let eventId;
  let templateId;
  let issuedCertId;
  let certPdfBuffer;

  beforeAll(async () => {
    // 1. Login as Admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@college.edu', password: 'Admin@12345' });
    expect(adminLoginRes.status).toBe(200);
    expect(adminLoginRes.body.success).toBe(true);
    adminToken = adminLoginRes.body.data.accessToken;

    // 2. Login as Teacher
    const teacherLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@college.edu', password: 'Teacher@12345' });
    expect(teacherLoginRes.status).toBe(200);
    teacherToken = teacherLoginRes.body.data.accessToken;

    // Fetch existing seeded template
    const templatesRes = await request(app)
      .get('/api/v1/templates')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(templatesRes.status).toBe(200);
    expect(templatesRes.body.data.length).toBeGreaterThan(0);
    templateId = templatesRes.body.data[0].id;

    // Fetch existing seeded demo event
    const eventsRes = await request(app)
      .get('/api/v1/events')
      .set('Authorization', `Bearer ${teacherToken}`);
    if (eventsRes.body.data && eventsRes.body.data.length > 0) {
      eventId = eventsRes.body.data[0].id;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Health and Ready check', () => {
    it('GET /ready reports database and blockchain up', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.checks.database).toBe('up');
      expect(res.body.checks.blockchainRpc).toBe('up');
    });
  });

  describe('2. Event Creation and Management', () => {
    it('Teacher creates a college event', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          name: 'TechBlitz 2026 CodeFest',
          description: 'Inter-collegiate coding and algorithm challenge',
          eventDate: '2026-04-10',
          organizingBody: 'Computer Science Department',
          institutionName: 'Institute of Engineering and Technology',
          signatoryName: 'Prof. A. K. Sen',
          signatoryTitle: 'Head of Department',
          defaultTemplateId: templateId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('TechBlitz 2026 CodeFest');
      eventId = res.body.data.id;
    });
  });

  describe('3. Single Certificate Issuance & Blockchain Registration', () => {
    const studentUniqueId = `TEST-STUDENT-${Date.now()}`;
    const studentUniqueName = `Shravanya Andhale ${Date.now().toString().slice(-4)}`;

    it('Teacher issues a certificate and registers hash on blockchain', async () => {
      const res = await request(app)
        .post('/api/v1/certificates')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          eventId,
          templateId,
          studentName: studentUniqueName,
          studentId: studentUniqueId,
          achievement: 'First Place Winner',
          certificateTitle: 'Certificate of Excellence',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const cert = res.body.data;
      expect(cert.status).toBe('CONFIRMED');
      expect(cert.documentHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(cert.txHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(cert.blockNumber).toBeGreaterThan(0);
      issuedCertId = cert.certificateId;
    }, 90000);

    it('Downloads generated certificate PDF', async () => {
      const res = await request(app)
        .get(`/api/v1/certificates/${issuedCertId}/pdf`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.body.length).toBeGreaterThan(1000);
      certPdfBuffer = res.body;
    });

    it('Rejects duplicate issuance for same student in same event', async () => {
      const res = await request(app)
        .post('/api/v1/certificates')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          eventId,
          templateId,
          studentName: studentUniqueName,
          studentId: studentUniqueId,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('4. Public Verification (No Auth)', () => {
    it('Verifies certificate by ID and confirms blockchain match', async () => {
      const res = await request(app).get(`/api/v1/verify/${issuedCertId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('VERIFIED');
      expect(res.body.data.details.recipientName).toBeDefined();
      expect(res.body.data.details.blockchain.txHash).toBeDefined();
    });

    it('Verifies genuine uploaded PDF document (matches hash)', async () => {
      const res = await request(app)
        .post('/api/v1/verify/document')
        .attach('file', certPdfBuffer, `${issuedCertId}.pdf`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('VERIFIED');
    });

    it('Fails verification for tampered PDF document (hash mismatch)', async () => {
      // Tamper with the PDF buffer by modifying bytes
      const tamperedBuffer = Buffer.from(certPdfBuffer);
      tamperedBuffer[tamperedBuffer.length - 15] = (tamperedBuffer[tamperedBuffer.length - 15] + 1) % 255;

      const res = await request(app)
        .post('/api/v1/verify/document')
        .attach('file', tamperedBuffer, 'tampered.pdf');

      // The altered PDF hash is not in DB or doesn't match
      expect(res.status).toBe(404);
      expect(res.body.data.status).toBe('NOT_FOUND');
    });

    it('Returns 404 for unknown certificate ID', async () => {
      const res = await request(app).get('/api/v1/verify/CERT-9999-DOESNOTEXIST');
      expect(res.status).toBe(404);
      expect(res.body.data.status).toBe('NOT_FOUND');
    });
  });

  describe('5. Bulk Issuance of 12 Students (College Demonstration Workflow)', () => {
    it('Successfully processes bulk recipients in one batch with blockchain registration', async () => {
      const runId = Date.now().toString().slice(-5);
      // 10 students for demo
      const recipients = [
        { student_name: 'Arnav Chaudhary', student_id: `CS-${runId}-001`, achievement: 'Special Mention' },
        { student_name: 'Karuna Jeswani', student_id: `CS-${runId}-002`, achievement: 'Runner Up' },
        { student_name: 'Nikhil Kadam', student_id: `CS-${runId}-003`, achievement: 'Finalist' },
        { student_name: 'Rohan Sharma', student_id: `CS-${runId}-004`, achievement: 'Participant' },
        { student_name: 'Sneha Patil', student_id: `CS-${runId}-005`, achievement: 'Participant' },
        { student_name: 'Aditya Deshmukh', student_id: `CS-${runId}-006`, achievement: 'Participant' },
        { student_name: 'Pooja Iyer', student_id: `CS-${runId}-007`, achievement: 'Participant' },
        { student_name: 'Manish Verma', student_id: `CS-${runId}-008`, achievement: 'Participant' },
        { student_name: 'Tanvi Joshi', student_id: `CS-${runId}-009`, achievement: 'Participant' },
        { student_name: 'Rahul Nair', student_id: `CS-${runId}-010`, achievement: 'Participant' },
      ];

      // Convert to CSV string
      const csvLines = [
        'student_name,student_id,achievement',
        ...recipients.map((r) => `"${r.student_name}","${r.student_id}","${r.achievement}"`),
      ];
      const csvBuffer = Buffer.from(csvLines.join('\n'), 'utf8');

      const res = await request(app)
        .post('/api/v1/certificates/bulk')
        .set('Authorization', `Bearer ${teacherToken}`)
        .field('eventId', eventId)
        .field('templateId', templateId)
        .attach('file', csvBuffer, 'recipients_demo.csv');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.batch.status).toBe('COMPLETED');
      expect(res.body.data.batch.acceptedRows).toBe(10);
      expect(res.body.data.batch.rejectedRows).toBe(0);
      expect(res.body.data.certificates.length).toBe(10);

      // Verify each one has blockchain tx
      for (const cert of res.body.data.certificates) {
        expect(cert.status).toBe('CONFIRMED');
        expect(cert.documentHash).toBeDefined();
      }
    }, 180000);
  });

  describe('6. Revocation Workflow', () => {
    it('Admin revokes an issued certificate and subsequent verification returns REVOKED', async () => {
      const revokeRes = await request(app)
        .post(`/api/v1/certificates/${issuedCertId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Disqualified due to eligibility criteria' });

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);
      expect(revokeRes.body.data.status).toBe('REVOKED');

      // Subsequent public verification
      const verifyRes = await request(app).get(`/api/v1/verify/${issuedCertId}`);
      expect(verifyRes.status).toBe(410); // Gone / Revoked
      expect(verifyRes.body.data.status).toBe('REVOKED');
      expect(verifyRes.body.data.isVerified).toBe(false);
    });
  });
});
