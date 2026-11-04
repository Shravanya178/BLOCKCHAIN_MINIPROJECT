'use strict';

const prisma = require('../../config/prisma');
const config = require('../../config');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const storage = require('../../services/storage.service');
const { sha256Hex } = require('../../services/hashing.service');
const { renderCertificatePdf } = require('../../services/pdf.service');
const { buildVerificationUrl } = require('../../services/qr.service');
const blockchainService = require('../blockchain/blockchain.service');
const templatesService = require('../templates/templates.service');
const { generateUniqueCertificateId } = require('../../utils/certificateId');
const { toPrisma, meta } = require('../../utils/pagination');
const { isUuid } = require('../../validators/common');
const audit = require('../audit/audit.service');
const { validateParticipantFields } = require('./field-policy');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelay(attempts) {
  return Math.min(
    config.limits.retryMaxDelayMs,
    config.limits.retryBaseDelayMs * (2 ** Math.max(0, attempts - 1)),
  );
}

function resolveValidityDate(event, issueDate) {
  if (event.validityPolicy === 'PERMANENT') return null;

  let validUntil;
  if (event.validityPolicy === 'DAYS_AFTER_ISSUE') {
    validUntil = new Date(issueDate.getTime() + event.validityDays * 24 * 60 * 60 * 1000);
  } else {
    validUntil = new Date(event.validUntil);
    validUntil.setUTCHours(23, 59, 59, 0);
  }

  if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() <= Date.now()) {
    throw AppError.validation('Certificate validity policy resolves to a date in the past');
  }
  return validUntil;
}

/**
 * Ensures or creates a Recipient record.
 */
async function resolveRecipient({ fullName, studentIdentifier, email, department }) {
  if (studentIdentifier) {
    const existing = await prisma.recipient.findUnique({
      where: { studentIdentifier },
    });
    if (existing) {
      if (existing.fullName !== fullName) {
        // update name if changed
        return prisma.recipient.update({
          where: { id: existing.id },
          data: { fullName },
        });
      }
      return existing;
    }
  }

  return prisma.recipient.create({
    data: {
      fullName,
      studentIdentifier: studentIdentifier || null,
      email: email || null,
      department: department || null,
    },
  });
}

/**
 * Pipeline to generate certificate PDF, compute its SHA-256 hash, and store PDF.
 */
async function generateAndStorePdf({ certificate, event, template, issuerUser, department }) {
  const templateBackground = await templatesService.loadBackground(template);

  const verificationUrl = buildVerificationUrl(certificate.certificateId);

  const pdfBuffer = await renderCertificatePdf({
    template,
    background: templateBackground,
    data: {
      certificateId: certificate.certificateId,
      studentName: certificate.recipientName,
      studentId: certificate.studentIdentifier,
      teamName: certificate.teamName,
      projectTitle: certificate.projectTitle,
      position: certificate.position,
      eventName: event.name,
      eventDate: event.eventDate,
      eventEndDate: event.endDate,
      issueDate: certificate.issueDate,
      validUntil: certificate.validUntil,
      achievement: certificate.achievement,
      certificateTitle: certificate.certificateTitle,
      organizingBody: event.organizingBody,
      institutionName: event.institutionName,
      issuerName: issuerUser.name,
      signatoryName: event.signatoryName,
      signatoryDesignation: event.signatoryTitle,
      signatoryTitle: event.signatoryTitle,
      venue: event.venue,
      department,
      certificateType: event.certificateType,
      certificateDescription: certificate.achievement || certificate.certificateTitle,
    },
    verificationUrl,
  });

  const documentHash = sha256Hex(pdfBuffer);
  const targetKey = `certificates/${event.id}/${certificate.certificateId}.pdf`;

  const saved = await storage.save(targetKey, pdfBuffer);

  return {
    documentHash,
    storageKey: saved?.key || targetKey,
    fileSizeBytes: pdfBuffer.length,
    verificationUrl,
  };
}

/**
 * Issues a single certificate.
 */
async function issueSingleCertificate(actorUser, payload, ip, replacement = null) {
  const event = await prisma.event.findUnique({
    where: { id: payload.eventId },
    include: { issuer: true },
  });
  if (!event) throw AppError.notFound('Event not found');

  // Authorization check
  if (actorUser.role !== 'ADMIN' && event.createdById !== actorUser.id && event.issuerId !== actorUser.id) {
    throw AppError.forbidden('You are not authorized to issue certificates for this event');
  }

  const templateId = payload.templateId || event.defaultTemplateId;
  if (!templateId) {
    throw AppError.badRequest('No template selected and event has no default template');
  }
  const template = await templatesService.getUsableTemplate(templateId);
  const participant = validateParticipantFields(payload, event, template.layout);

  // Recipient
  const recipient = await resolveRecipient({
    fullName: participant.studentName,
    studentIdentifier: participant.studentId,
    email: participant.email,
    department: participant.department,
  });

  // Duplicate check
  if (!replacement) {
    const existingCert = await prisma.certificate.findFirst({
      where: {
        eventId: event.id,
        recipientId: recipient.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingCert) {
      throw AppError.conflict('Certificate already issued for this student in this event', {
        certificateId: existingCert.certificateId,
        status: existingCert.status,
      });
    }
  }

  const certificateId = await generateUniqueCertificateId();
  const issueDate = payload.issueDate ? new Date(`${payload.issueDate}T00:00:00.000Z`) : new Date();
  const validUntil = resolveValidityDate(event, issueDate);

  // Create certificate record in PENDING status
  let cert = await prisma.certificate.create({
    data: {
      certificateId,
      eventId: event.id,
      recipientId: recipient.id,
      templateId: template.id,
      issuedById: actorUser.id,
      recipientName: participant.studentName,
      studentIdentifier: participant.studentId,
      teamName: participant.teamName,
      projectTitle: participant.projectTitle,
      position: participant.position,
      certificateTitle: participant.certificateTitle || '',
      achievement: participant.achievement,
      issueDate,
      validUntil,
      status: 'PENDING',
      verificationUrl: buildVerificationUrl(certificateId),
      previousCertificateId: replacement?.id || null,
      reissueReason: replacement?.reason || null,
    },
  });

  try {
    // 1. Generate PDF and Hash
    const pdfResult = await generateAndStorePdf({
      certificate: cert,
      event,
      template,
      issuerUser: event.issuer,
      department: recipient.department,
    });

    cert = await prisma.certificate.update({
      where: { id: cert.id },
      data: {
        status: 'PDF_GENERATED',
        documentHash: pdfResult.documentHash,
        storageKey: pdfResult.storageKey,
        fileSizeBytes: pdfResult.fileSizeBytes,
        pdfGeneratedAt: new Date(),
      },
    });

    // 2. Submit to Blockchain
    cert = await prisma.certificate.update({
      where: { id: cert.id },
      data: { status: 'SUBMITTED_TO_BLOCKCHAIN', attempts: { increment: 1 } },
    });

    const txRecord = await prisma.blockchainTransaction.create({
      data: {
        certificateId: cert.id,
        type: 'REGISTER',
        status: 'SUBMITTED',
        chainId: config.blockchain.chainId,
        networkName: config.blockchain.network,
        contractAddress: blockchainService.resolveContractAddress() || 'UNKNOWN',
        submittedAt: new Date(),
      },
    });

    let chainResult;
    try {
      chainResult = await blockchainService.registerCertificateOnChain(
        cert.certificateId,
        cert.documentHash,
        cert.validUntil ? Math.floor(cert.validUntil.getTime() / 1000) : 0,
      );
    } catch (err) {
      await prisma.certificate.update({
        where: { id: cert.id },
        data: { status: 'FAILED', lastError: err.message },
      });
      await prisma.blockchainTransaction.update({
        where: { id: txRecord.id },
        data: { status: 'FAILED', errorMessage: err.message },
      });
      await audit.record({
        actorId: actorUser.id,
        action: 'CERTIFICATE_ISSUANCE_FAILED',
        entityType: 'Certificate',
        entityId: cert.id,
        metadata: { certificateId: cert.certificateId, error: err.message },
        ip,
      });
      throw err;
    }

    // 3. Mark Confirmed
    cert = await prisma.certificate.update({
      where: { id: cert.id },
      data: {
        status: 'CONFIRMED',
        chainId: config.blockchain.chainId,
        networkName: config.blockchain.network,
        contractAddress: chainResult.contractAddress,
        txHash: chainResult.txHash,
        blockNumber: chainResult.blockNumber,
        registeredAt: new Date(),
      },
    });

    await prisma.blockchainTransaction.update({
      where: { id: txRecord.id },
      data: {
        status: 'CONFIRMED',
        txHash: chainResult.txHash,
        blockNumber: chainResult.blockNumber,
        contractAddress: chainResult.contractAddress,
        gasUsed: chainResult.gasUsed,
        confirmedAt: new Date(),
      },
    });

    await audit.record({
      actorId: actorUser.id,
      action: 'CERTIFICATE_ISSUED',
      entityType: 'Certificate',
      entityId: cert.id,
      metadata: { certificateId: cert.certificateId, txHash: chainResult.txHash },
      ip,
    });

    return cert;
  } catch (err) {
    logger.error('Failed certificate issuance process', { certificateId: cert.certificateId, error: err.message });
    await prisma.certificate.update({
      where: { id: cert.id },
      data: {
        status: 'FAILED',
        lastError: err.message,
      },
    });
    throw err;
  }

}

/**
 * Issues a replacement certificate without changing the original record.
 */
async function reissueCertificate(actorUser, certificateId, reason, payload, ip) {
  const original = await prisma.certificate.findUnique({
    where: { certificateId },
    include: { event: true, recipient: true },
  });
  if (!original) throw AppError.notFound('Certificate not found');

  const isAdmin = actorUser.role === 'ADMIN';
  const isOwner = original.event.createdById === actorUser.id || original.event.issuerId === actorUser.id;
  if (!isAdmin && !(actorUser.role === 'TEACHER' && isOwner)) {
    throw AppError.forbidden('You are not authorized to reissue this certificate');
  }
  if (!['CONFIRMED', 'REVOKED'].includes(original.status)) {
    throw AppError.badRequest('Only a confirmed or revoked certificate can be reissued');
  }

  return issueSingleCertificate(
    actorUser,
    {
      eventId: original.eventId,
      templateId: payload.templateId || original.templateId,
      studentName: original.recipientName,
      studentId: original.studentIdentifier || undefined,
      teamName: payload.teamName ?? original.teamName,
      projectTitle: payload.projectTitle ?? original.projectTitle,
      position: payload.position ?? original.position,
      certificateTitle: payload.certificateTitle || original.certificateTitle,
      achievement: payload.achievement ?? original.achievement ?? undefined,
      issueDate: payload.issueDate,
    },
    ip,
    { id: original.id, reason },
  );
}

/**
 * Retries blockchain registration for a failed or PDF_GENERATED certificate.
 */
async function retryCertificateRegistration(actorUser, certificateId, ip) {
  const cert = await prisma.certificate.findUnique({
    where: { certificateId },
    include: { event: { include: { issuer: true } }, template: true, recipient: true },
  });
  if (!cert) throw AppError.notFound('Certificate not found');

  if (actorUser.role !== 'ADMIN' && cert.event.createdById !== actorUser.id && cert.event.issuerId !== actorUser.id) {
    throw AppError.forbidden('Not authorized to manage this certificate');
  }

  if (cert.status === 'CONFIRMED') {
    throw AppError.badRequest('Certificate is already confirmed on blockchain');
  }
  if (cert.status === 'REVOKED') {
    throw AppError.badRequest('Cannot retry a revoked certificate');
  }

  await sleep(retryDelay(cert.attempts));

  // If PDF was never generated, generate it first
  if (!cert.documentHash || !cert.storageKey) {
    const pdfResult = await generateAndStorePdf({
      certificate: cert,
      event: cert.event,
      template: cert.template,
      issuerUser: cert.event.issuer,
      department: cert.recipient?.department,
    });
    await prisma.certificate.update({
      where: { id: cert.id },
      data: {
        documentHash: pdfResult.documentHash,
        storageKey: pdfResult.storageKey,
        fileSizeBytes: pdfResult.fileSizeBytes,
        pdfGeneratedAt: new Date(),
        status: 'PDF_GENERATED',
      },
    });
    cert.documentHash = pdfResult.documentHash;
  }

  await prisma.certificate.update({
    where: { id: cert.id },
    data: { status: 'SUBMITTED_TO_BLOCKCHAIN', attempts: { increment: 1 } },
  });

  const txRecord = await prisma.blockchainTransaction.create({
    data: {
      certificateId: cert.id,
      type: 'REGISTER',
      status: 'SUBMITTED',
      chainId: config.blockchain.chainId,
      networkName: config.blockchain.network,
      contractAddress: blockchainService.resolveContractAddress() || 'UNKNOWN',
      submittedAt: new Date(),
    },
  });

  let chainResult;
  try {
    chainResult = await blockchainService.registerCertificateOnChain(
      cert.certificateId,
      cert.documentHash,
      cert.validUntil ? Math.floor(cert.validUntil.getTime() / 1000) : 0,
    );
  } catch (err) {
    await prisma.certificate.update({
      where: { id: cert.id },
      data: { status: 'FAILED', lastError: err.message },
    });
    await prisma.blockchainTransaction.update({
      where: { id: txRecord.id },
      data: { status: 'FAILED', errorMessage: err.message },
    });
    await audit.record({
      actorId: actorUser.id,
      action: 'CERTIFICATE_RETRY_FAILED',
      entityType: 'Certificate',
      entityId: cert.id,
      metadata: { certificateId: cert.certificateId, error: err.message },
      ip,
    });
    throw err;
  }

  const updated = await prisma.certificate.update({
    where: { id: cert.id },
    data: {
      status: 'CONFIRMED',
      chainId: config.blockchain.chainId,
      networkName: config.blockchain.network,
      contractAddress: chainResult.contractAddress,
      txHash: chainResult.txHash,
      blockNumber: chainResult.blockNumber,
      registeredAt: new Date(),
      lastError: null,
    },
  });

  await prisma.blockchainTransaction.update({
    where: { id: txRecord.id },
    data: {
      status: 'CONFIRMED',
      txHash: chainResult.txHash,
      blockNumber: chainResult.blockNumber,
      contractAddress: chainResult.contractAddress,
      confirmedAt: new Date(),
    },
  });

  await audit.record({
    actorId: actorUser.id,
    action: 'CERTIFICATE_RETRY_SUCCESS',
    entityType: 'Certificate',
    entityId: cert.id,
    metadata: { certificateId: cert.certificateId },
    ip,
  });

  return updated;
}

/**
 * Resumes failed certificate registrations belonging to a batch.
 * Successfully confirmed certificates are left untouched and failed rows remain
 * visible in the batch error list for subsequent retries.
 */
async function resumeBatchIssuance(actorUser, batchId, ip) {
  const batch = await prisma.issuanceBatch.findUnique({
    where: { id: batchId },
    include: { event: true, certificates: true },
  });
  if (!batch) throw AppError.notFound('Batch not found');
  if (actorUser.role !== 'ADMIN' && batch.createdById !== actorUser.id) {
    throw AppError.forbidden('Not authorized to resume this batch');
  }
  if (batch.status === 'PROCESSING') {
    throw AppError.conflict('Batch is already being processed');
  }

  const retryable = batch.certificates.filter((certificate) =>
    ['FAILED', 'PDF_GENERATED', 'SUBMITTED_TO_BLOCKCHAIN'].includes(certificate.status),
  );
  const existingErrors = Array.isArray(batch.rowErrors) ? batch.rowErrors : [];
  const retryErrors = [];
  for (const certificate of retryable) {
    try {
      await retryCertificateRegistration(actorUser, certificate.certificateId, ip);
    } catch (err) {
      retryErrors.push({
        certificateId: certificate.certificateId,
        studentName: certificate.recipientName,
        error: err.message,
      });
    }
  }

  const refreshed = await prisma.issuanceBatch.findUnique({
    where: { id: batch.id },
    include: { certificates: true },
  });
  const confirmed = refreshed.certificates.filter((certificate) => certificate.status === 'CONFIRMED').length;
  const rejected = Math.max(0, refreshed.totalRows - confirmed);
  const status = confirmed === refreshed.totalRows ? 'COMPLETED' : confirmed > 0 ? 'PARTIALLY_FAILED' : 'FAILED';
  const updated = await prisma.issuanceBatch.update({
    where: { id: batch.id },
    data: {
      acceptedRows: confirmed,
      rejectedRows: Math.max(0, rejected),
      rowErrors: [...existingErrors, ...retryErrors],
      status,
      completedAt: new Date(),
    },
    include: {
      event: { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
      certificates: true,
    },
  });

  await audit.record({
    actorId: actorUser.id,
    action: 'BATCH_ISSUANCE_RESUMED',
    entityType: 'IssuanceBatch',
    entityId: batch.id,
    metadata: { retried: retryable.length, confirmed, failed: retryErrors.length },
    ip,
  });
  return { batch: updated, certificates: updated.certificates, errors: retryErrors };
}

/**
 * Revokes an issued certificate.
 */
async function revokeCertificate(actorUser, certificateId, reason, ip) {
  const cert = await prisma.certificate.findUnique({
    where: { certificateId },
    include: { event: true },
  });
  if (!cert) throw AppError.notFound('Certificate not found');

  // Permission check
  const isAdmin = actorUser.role === 'ADMIN';
  const isTeacherWithPerm = actorUser.role === 'TEACHER' && actorUser.canRevoke && (cert.event.createdById === actorUser.id || cert.event.issuerId === actorUser.id);
  if (!isAdmin && !isTeacherWithPerm) {
    throw AppError.forbidden('You are not authorized to revoke certificates');
  }

  if (cert.status === 'REVOKED') {
    throw AppError.badRequest('Certificate is already revoked');
  }

  // Revoke on blockchain if it was registered
  let chainResult = null;
  if (cert.status === 'CONFIRMED') {
    chainResult = await blockchainService.revokeCertificateOnChain(cert.certificateId);

    await prisma.blockchainTransaction.create({
      data: {
        certificateId: cert.id,
        type: 'REVOKE',
        status: 'CONFIRMED',
        chainId: config.blockchain.chainId,
        networkName: config.blockchain.network,
        contractAddress: chainResult.contractAddress,
        txHash: chainResult.txHash,
        blockNumber: chainResult.blockNumber,
        submittedAt: new Date(),
        confirmedAt: new Date(),
      },
    });
  }

  const updated = await prisma.certificate.update({
    where: { id: cert.id },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revocationReason: reason || 'Revoked by authority',
      revokedById: actorUser.id,
      revocationTxHash: chainResult?.txHash || null,
    },
  });

  await audit.record({
    actorId: actorUser.id,
    action: 'CERTIFICATE_REVOKED',
    entityType: 'Certificate',
    entityId: cert.id,
    metadata: { certificateId: cert.certificateId, reason },
    ip,
  });

  return updated;
}

/**
 * Process a batch of certificates (bulk / CSV).
 */
async function processBatchIssuance(actorUser, { eventId, templateId, recipients, originalFilename, idempotencyKey }, ip) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { issuer: true },
  });
  if (!event) throw AppError.notFound('Event not found');

  if (actorUser.role !== 'ADMIN' && event.createdById !== actorUser.id && event.issuerId !== actorUser.id) {
    throw AppError.forbidden('Not authorized to issue certificates for this event');
  }

  if (idempotencyKey) {
    const existingBatch = await prisma.issuanceBatch.findUnique({
      where: { idempotencyKey: idempotencyKey.trim() },
      include: {
        event: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
        certificates: true,
      },
    });
    if (existingBatch) {
      if (existingBatch.createdById !== actorUser.id && actorUser.role !== 'ADMIN') {
        throw AppError.forbidden('This idempotency key belongs to another organizer');
      }
      return {
        batch: existingBatch,
        certificates: existingBatch.certificates.filter((certificate) => certificate.status === 'CONFIRMED'),
        errors: existingBatch.rowErrors,
        idempotentReplay: true,
      };
    }
  }

  const resolvedTemplateId = templateId || event.defaultTemplateId;
  if (!resolvedTemplateId) {
    throw AppError.badRequest('No template specified and event has no default template');
  }
  const template = await templatesService.getUsableTemplate(resolvedTemplateId);

  // Create Batch Record
  const batch = await prisma.issuanceBatch.create({
    data: {
      eventId: event.id,
      templateId: template.id,
      createdById: actorUser.id,
      source: originalFilename
        ? (originalFilename.toLowerCase().endsWith('.xlsx') ? 'XLSX' : 'CSV')
        : 'SINGLE',
      idempotencyKey: idempotencyKey ? idempotencyKey.trim() : null,
      originalFilename: originalFilename || null,
      totalRows: recipients.length,
      acceptedRows: 0,
      rejectedRows: 0,
      rowErrors: [],
      status: 'PROCESSING',
    },
  });

  const rowErrors = [];
  const successfulCertificates = [];

  for (let offset = 0; offset < recipients.length; offset += config.limits.batchChunkSize) {
    const chunk = recipients.slice(offset, offset + config.limits.batchChunkSize);
    for (const item of chunk) {
      const rowNum = item.rowNumber || null;
      try {
      const participant = validateParticipantFields(item, event, template.layout);

      const recipient = await resolveRecipient({
        fullName: participant.studentName,
        studentIdentifier: participant.studentId,
        email: participant.email,
        department: participant.department,
      });

      // Check duplicate
      const duplicate = await prisma.certificate.findFirst({
        where: {
          eventId: event.id,
          recipientId: recipient.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (duplicate) {
        throw new Error(`Already issued certificate (${duplicate.certificateId}) for this student in this event`);
      }

      const certificateId = await generateUniqueCertificateId();
      const issueDate = item.issueDate ? new Date(`${item.issueDate}T00:00:00.000Z`) : new Date();
      const validUntil = resolveValidityDate(event, issueDate);

      let cert = await prisma.certificate.create({
        data: {
          certificateId,
          eventId: event.id,
          recipientId: recipient.id,
          templateId: template.id,
          batchId: batch.id,
          issuedById: actorUser.id,
          recipientName: participant.studentName,
          studentIdentifier: participant.studentId,
          teamName: participant.teamName,
          projectTitle: participant.projectTitle,
          position: participant.position,
          certificateTitle: participant.certificateTitle || '',
          achievement: participant.achievement,
          issueDate,
          validUntil,
          status: 'PENDING',
          verificationUrl: buildVerificationUrl(certificateId),
          rowNumber: rowNum,
        },
      });

      // PDF & Hash
      const pdfResult = await generateAndStorePdf({
        certificate: cert,
        event,
        template,
        issuerUser: event.issuer,
        department: recipient.department,
      });

      cert = await prisma.certificate.update({
        where: { id: cert.id },
        data: {
          status: 'PDF_GENERATED',
          documentHash: pdfResult.documentHash,
          storageKey: pdfResult.storageKey,
          fileSizeBytes: pdfResult.fileSizeBytes,
          pdfGeneratedAt: new Date(),
        },
      });

      // Blockchain Registration
      const chainResult = await blockchainService.registerCertificateOnChain(
        cert.certificateId,
        cert.documentHash,
        cert.validUntil ? Math.floor(cert.validUntil.getTime() / 1000) : 0,
      );

      cert = await prisma.certificate.update({
        where: { id: cert.id },
        data: {
          status: 'CONFIRMED',
          chainId: config.blockchain.chainId,
          networkName: config.blockchain.network,
          contractAddress: chainResult.contractAddress,
          txHash: chainResult.txHash,
          blockNumber: chainResult.blockNumber,
          registeredAt: new Date(),
        },
      });

      await prisma.blockchainTransaction.create({
        data: {
          certificateId: cert.id,
          type: 'REGISTER',
          status: 'CONFIRMED',
          chainId: config.blockchain.chainId,
          networkName: config.blockchain.network,
          contractAddress: chainResult.contractAddress,
          txHash: chainResult.txHash,
          blockNumber: chainResult.blockNumber,
          gasUsed: chainResult.gasUsed,
          submittedAt: new Date(),
          confirmedAt: new Date(),
        },
      });

      successfulCertificates.push(cert);
      } catch (err) {
        rowErrors.push({
          rowNumber: rowNum,
          studentName: item.studentName,
          studentId: item.studentId,
          error: err.message,
        });
      }
    }
  }

  const finalStatus =
    rowErrors.length === 0
      ? 'COMPLETED'
      : successfulCertificates.length > 0
      ? 'PARTIALLY_FAILED'
      : 'FAILED';

  const updatedBatch = await prisma.issuanceBatch.update({
    where: { id: batch.id },
    data: {
      acceptedRows: successfulCertificates.length,
      rejectedRows: rowErrors.length,
      rowErrors,
      status: finalStatus,
      completedAt: new Date(),
    },
    include: {
      event: { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
  });

  await audit.record({
    actorId: actorUser.id,
    action: 'BATCH_ISSUANCE_COMPLETED',
    entityType: 'IssuanceBatch',
    entityId: batch.id,
    metadata: {
      total: recipients.length,
      accepted: successfulCertificates.length,
      rejected: rowErrors.length,
    },
    ip,
  });

  return {
    batch: updatedBatch,
    certificates: successfulCertificates,
    errors: rowErrors,
  };
}

module.exports = {
  issueSingleCertificate,
  reissueCertificate,
  retryCertificateRegistration,
  resumeBatchIssuance,
  revokeCertificate,
  processBatchIssuance,
  resolveRecipient,
};
