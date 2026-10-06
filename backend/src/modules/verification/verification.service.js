'use strict';

const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const { sha256Hex, hashesEqual } = require('../../services/hashing.service');
const blockchainService = require('../blockchain/blockchain.service');

/**
 * Public ID-based verification.
 * 1. Checks off-chain database.
 * 2. Checks on-chain smart contract.
 * 3. Compares hash, timestamps, and revocation status.
 */
async function verifyCertificateById(certificateId) {
  // Query Database
  const dbCert = await prisma.certificate.findUnique({
    where: { certificateId },
    include: {
      event: {
        select: {
          name: true,
          eventDate: true,
          institutionName: true,
          organizingBody: true,
        },
      },
      issuedBy: {
        select: { name: true, designation: true },
      },
    },
  });

  if (!dbCert) {
    return {
      status: 'NOT_FOUND',
      message: 'Certificate ID does not exist in the system',
      certificateId,
      isVerified: false,
    };
  }

  // If status in DB is PENDING or PDF_GENERATED
  if (dbCert.status === 'PENDING' || dbCert.status === 'PDF_GENERATED') {
    return {
      status: 'PENDING',
      message: 'Certificate is currently being processed and not yet registered on blockchain',
      certificateId,
      isVerified: false,
    };
  }

  // If marked REVOKED in DB
  if (dbCert.status === 'REVOKED') {
    return {
      status: 'REVOKED',
      message: 'This certificate has been revoked by the issuing authority',
      certificateId,
      isVerified: false,
      details: {
        recipientName: dbCert.recipientName,
        eventName: dbCert.event.name,
        institutionName: dbCert.event.institutionName,
        revocationReason: dbCert.revocationReason,
        revokedAt: dbCert.revokedAt,
      },
    };
  }

  // Check on blockchain
  let chainData = null;
  try {
    chainData = await blockchainService.getCertificateFromChain(certificateId);
  } catch (err) {
    logger.warn('Failed to verify on blockchain directly', { certificateId, error: err.message });
    return {
      status: 'VERIFICATION_UNAVAILABLE',
      message: 'Blockchain network currently unreachable for live verification',
      certificateId,
      isVerified: false,
    };
  }

  if (!chainData.exists) {
    return {
      status: 'NOT_FOUND_ON_CHAIN',
      message: 'Certificate record was not found on the blockchain registry',
      certificateId,
      isVerified: false,
    };
  }

  if (chainData.revoked) {
    return {
      status: 'REVOKED',
      message: 'This certificate is marked revoked on the blockchain',
      certificateId,
      isVerified: false,
      details: {
        recipientName: dbCert.recipientName,
        eventName: dbCert.event.name,
        institutionName: dbCert.event.institutionName,
        revokedAt: new Date(chainData.revokedAt * 1000),
      },
    };
  }

  // Compare Hashes
  if (!hashesEqual(dbCert.documentHash, chainData.documentHash)) {
    return {
      status: 'HASH_MISMATCH',
      message: 'Critical error: Database certificate hash does not match registered blockchain hash',
      certificateId,
      isVerified: false,
    };
  }

  return {
    status: 'VERIFIED',
    message: 'Certificate is valid and cryptographically verified on blockchain',
    certificateId,
    isVerified: true,
    details: {
      recipientName: dbCert.recipientName,
      studentIdentifier: dbCert.studentIdentifier,
      certificateTitle: dbCert.certificateTitle,
      achievement: dbCert.achievement,
      eventName: dbCert.event.name,
      eventDate: dbCert.event.eventDate,
      institutionName: dbCert.event.institutionName,
      organizingBody: dbCert.event.organizingBody,
      issuerName: dbCert.issuedBy.name,
      issueDate: dbCert.issueDate,
      documentHash: chainData.documentHash,
      blockchain: {
        network: chainData.network,
        chainId: chainData.chainId,
        contractAddress: chainData.contractAddress,
        issuerAddress: chainData.issuer,
        registeredAt: new Date(chainData.issuedAt * 1000),
        txHash: dbCert.txHash,
        blockNumber: dbCert.blockNumber,
      },
    },
  };
}

/**
 * Public Document-based verification.
 * Computes SHA-256 of uploaded PDF buffer, looks up DB and blockchain, checks match.
 */
async function verifyDocument(pdfBuffer) {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw AppError.badRequest('PDF document buffer is required');
  }

  const computedHash = sha256Hex(pdfBuffer);

  // Search DB by documentHash
  const dbCert = await prisma.certificate.findUnique({
    where: { documentHash: computedHash },
    include: {
      event: true,
      issuedBy: { select: { name: true } },
    },
  });

  if (!dbCert) {
    return {
      status: 'NOT_FOUND',
      message: 'The uploaded PDF document hash does not match any registered certificate',
      computedHash,
      isVerified: false,
    };
  }

  // Query blockchain with cert ID
  const chainData = await blockchainService.getCertificateFromChain(dbCert.certificateId);

  if (!chainData.exists) {
    return {
      status: 'NOT_FOUND_ON_CHAIN',
      message: 'Certificate identified, but not registered on blockchain',
      certificateId: dbCert.certificateId,
      computedHash,
      isVerified: false,
    };
  }

  if (chainData.revoked) {
    return {
      status: 'REVOKED',
      message: 'Certificate found but has been revoked',
      certificateId: dbCert.certificateId,
      computedHash,
      isVerified: false,
    };
  }

  if (!hashesEqual(computedHash, chainData.documentHash)) {
    return {
      status: 'HASH_MISMATCH',
      message: 'Document has been tampered with: PDF hash does not match registered blockchain hash',
      certificateId: dbCert.certificateId,
      computedHash,
      chainHash: chainData.documentHash,
      isVerified: false,
    };
  }

  return {
    status: 'VERIFIED',
    message: 'Uploaded PDF is authentic, untampered, and verified against blockchain registry',
    certificateId: dbCert.certificateId,
    computedHash,
    isVerified: true,
    details: {
      recipientName: dbCert.recipientName,
      certificateTitle: dbCert.certificateTitle,
      achievement: dbCert.achievement,
      eventName: dbCert.event.name,
      institutionName: dbCert.event.institutionName,
      issueDate: dbCert.issueDate,
      blockchain: {
        network: chainData.network,
        contractAddress: chainData.contractAddress,
        registeredAt: new Date(chainData.issuedAt * 1000),
        txHash: dbCert.txHash,
      },
    },
  };
}

module.exports = {
  verifyCertificateById,
  verifyDocument,
};
