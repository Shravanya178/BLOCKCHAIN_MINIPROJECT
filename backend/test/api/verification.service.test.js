'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-characters';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-characters';
process.env.BLOCKCHAIN_PRIVATE_KEY = `0x${'1'.repeat(64)}`;

jest.mock('../../src/config/prisma', () => ({
  certificate: { findUnique: jest.fn() },
}));

jest.mock('../../src/modules/blockchain/blockchain.service', () => ({
  getCertificateFromChain: jest.fn(),
}));

const prisma = require('../../src/config/prisma');
const blockchainService = require('../../src/modules/blockchain/blockchain.service');
const { verifyDocument } = require('../../src/modules/verification/verification.service');
const { sha256Hex } = require('../../src/services/hashing.service');

const pdf = Buffer.from('%PDF-1.7 certificate');
const baseCertificate = {
  certificateId: 'CERT-VERIFY-001',
  recipientName: 'Student One',
  certificateTitle: 'Participation',
  achievement: 'Participant',
  issueDate: new Date('2026-11-04T00:00:00.000Z'),
  txHash: '0xtransaction',
  storageKey: null,
  event: { name: 'Workshop', institutionName: 'VESIT' },
  issuedBy: { name: 'Issuer' },
};

describe('Verification service document checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns NOT_FOUND when the uploaded bytes have no matching database hash', async () => {
    prisma.certificate.findUnique.mockResolvedValue(null);

    const result = await verifyDocument(pdf);

    expect(result.status).toBe('NOT_FOUND');
    expect(result.isVerified).toBe(false);
    expect(prisma.certificate.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { documentHash: sha256Hex(pdf) } }),
    );
  });

  it('returns HASH_MISMATCH when blockchain hash differs from the uploaded PDF', async () => {
    prisma.certificate.findUnique.mockResolvedValue(baseCertificate);
    blockchainService.getCertificateFromChain.mockResolvedValue({
      exists: true,
      revoked: false,
      validUntil: 0,
      documentHash: `0x${'f'.repeat(64)}`,
    });

    const result = await verifyDocument(pdf);

    expect(result.status).toBe('HASH_MISMATCH');
    expect(result.certificateId).toBe(baseCertificate.certificateId);
    expect(result.isVerified).toBe(false);
  });

  it('checks expiry before accepting a matching document hash', async () => {
    prisma.certificate.findUnique.mockResolvedValue(baseCertificate);
    blockchainService.getCertificateFromChain.mockResolvedValue({
      exists: true,
      revoked: false,
      validUntil: Math.floor(Date.now() / 1000) - 1,
      documentHash: sha256Hex(pdf),
    });

    const result = await verifyDocument(pdf);

    expect(result.status).toBe('EXPIRED');
    expect(result.isVerified).toBe(false);
  });

  it('returns VERIFIED for an authentic PDF whose blockchain hash matches', async () => {
    prisma.certificate.findUnique.mockResolvedValue(baseCertificate);
    blockchainService.getCertificateFromChain.mockResolvedValue({
      exists: true,
      revoked: false,
      validUntil: 0,
      documentHash: sha256Hex(pdf),
      network: 'localhost',
      contractAddress: '0x0000000000000000000000000000000000000001',
      issuedAt: Math.floor(Date.now() / 1000),
    });

    const result = await verifyDocument(pdf);

    expect(result.status).toBe('VERIFIED');
    expect(result.isVerified).toBe(true);
    expect(result.details.recipientName).toBe('Student One');
  });
});
