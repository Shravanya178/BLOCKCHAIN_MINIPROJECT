'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-characters';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-characters';
process.env.BLOCKCHAIN_PRIVATE_KEY = `0x${'1'.repeat(64)}`;

const express = require('express');
const request = require('supertest');

jest.mock('../../src/modules/verification/verification.service', () => ({
  verifyCertificateById: jest.fn(),
  verifyDocument: jest.fn(),
}));

const service = require('../../src/modules/verification/verification.service');
const verificationRoutes = require('../../src/modules/verification/verification.routes');

const app = express();
app.use('/verify', verificationRoutes);

describe('Public verification routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 410 and an unsuccessful response for expired certificates', async () => {
    service.verifyCertificateById.mockResolvedValue({
      status: 'EXPIRED',
      message: 'This certificate has passed its validity date',
      certificateId: 'CERT-EXPIRED',
      isVerified: false,
    });

    const response = await request(app).get('/verify/CERT-EXPIRED');

    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      success: false,
      data: expect.objectContaining({
        status: 'EXPIRED',
        certificateId: 'CERT-EXPIRED',
      }),
    });
  });

  it('returns 200 only for verified certificates', async () => {
    service.verifyCertificateById.mockResolvedValue({
      status: 'VERIFIED',
      message: 'Certificate is valid',
      certificateId: 'CERT-VALID',
      isVerified: true,
    });

    const response = await request(app).get('/verify/CERT-VALID');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('VERIFIED');
  });

  it('returns 410 when an uploaded certificate PDF is expired', async () => {
    service.verifyDocument.mockResolvedValue({
      status: 'EXPIRED',
      message: 'Certificate has expired',
      certificateId: 'CERT-PDF-EXPIRED',
      isVerified: false,
    });

    const response = await request(app)
      .post('/verify/document')
      .attach('file', Buffer.from('%PDF-1.7 expired certificate'), 'certificate.pdf');

    expect(response.status).toBe(410);
    expect(response.body.success).toBe(false);
    expect(response.body.data.status).toBe('EXPIRED');
  });
});
