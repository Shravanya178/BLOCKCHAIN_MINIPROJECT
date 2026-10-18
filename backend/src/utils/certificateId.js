'use strict';

const crypto = require('crypto');
const prisma = require('../config/prisma');

/**
 * Generates a clean, unique certificate ID suitable for blockchain registration and public QR URLs.
 * Format: CERT-<YEAR>-<RANDOM8> (e.g. CERT-2026-A8K9M3P2)
 */
async function generateUniqueCertificateId(year = new Date().getFullYear()) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude confusing chars like 0, O, 1, I
  let attempts = 0;

  while (attempts < 10) {
    let rand = '';
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      rand += chars[bytes[i] % chars.length];
    }
    const certificateId = `CERT-${year}-${rand}`;

    const exists = await prisma.certificate.findUnique({
      where: { certificateId },
      select: { id: true },
    });

    if (!exists) {
      return certificateId;
    }
    attempts++;
  }

  // Fallback with timestamp
  return `CERT-${year}-${Date.now().toString(36).toUpperCase()}`;
}

module.exports = { generateUniqueCertificateId };
