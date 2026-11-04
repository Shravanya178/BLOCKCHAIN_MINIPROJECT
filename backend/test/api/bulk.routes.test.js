'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-characters';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-characters';
process.env.BLOCKCHAIN_PRIVATE_KEY = `0x${'1'.repeat(64)}`;

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'user-id', role: 'ADMIN' };
    next();
  },
}));

jest.mock('../../src/modules/certificates/certificates.service', () => ({
  processBatchIssuance: jest.fn().mockResolvedValue({
    batch: { status: 'COMPLETED', acceptedRows: 1, rejectedRows: 0 },
    certificates: [],
  }),
  issueSingleCertificate: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const router = require('../../src/modules/certificates/certificates.routes');
const certificateService = require('../../src/modules/certificates/certificates.service');

const app = express();
app.use(express.json());
app.use('/certificates', router);

describe('Bulk certificate routes', () => {
  beforeEach(() => {
    certificateService.processBatchIssuance.mockClear();
  });

  it('previews and normalizes uploaded CSV recipients', async () => {
    const response = await request(app)
      .post('/certificates/bulk/preview')
      .attach(
        'file',
        Buffer.from('name,roll no,position\nStudent One,CS-001,Winner\n'),
        'recipients.csv',
      );

    expect(response.status).toBe(200);
    expect(response.body.data.filename).toBe('recipients.csv');
    expect(response.body.data.recipients[0]).toMatchObject({
      rowNumber: 2,
      studentName: 'Student One',
      studentId: 'CS-001',
      achievement: 'Winner',
    });
  });

  it('passes corrected JSON recipients to batch issuance', async () => {
    const recipients = [{
      rowNumber: 2,
      studentName: 'Corrected Student',
      studentId: 'CS-002',
      achievement: 'Participant',
    }];

    const response = await request(app)
      .post('/certificates/bulk')
      .field('eventId', '11111111-1111-4111-8111-111111111111')
      .field('recipients', JSON.stringify(recipients))
      .field('originalFilename', 'corrected.xlsx');

    expect(response.status).toBe(201);
    expect(certificateService.processBatchIssuance).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-id', role: 'ADMIN' }),
      expect.objectContaining({
        eventId: '11111111-1111-4111-8111-111111111111',
        recipients,
        originalFilename: 'corrected.xlsx',
      }),
      expect.any(String),
    );
  });

  it('rejects invalid corrected filename metadata', async () => {
    const response = await request(app)
      .post('/certificates/bulk')
      .field('eventId', '11111111-1111-4111-8111-111111111111')
      .field('recipients', JSON.stringify([{ studentName: 'Student' }]))
      .field('originalFilename', 'corrected.txt');

    expect(response.status).toBe(400);
    expect(certificateService.processBatchIssuance).not.toHaveBeenCalled();
  });
});
