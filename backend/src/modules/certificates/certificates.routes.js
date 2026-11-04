'use strict';

const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { csvUpload } = require('../../middleware/upload');
const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const storage = require('../../services/storage.service');
const pinata = require('../../services/pinata.service');
const { paginationSchema, toPrisma, meta } = require('../../utils/pagination');
const { isUuid, dateOnly } = require('../../validators/common');
const { parseRecipientFile } = require('./csv.parser');
const service = require('./certificates.service');

const router = express.Router();

const optionalText = (max) => z.preprocess((value) => value === '' ? undefined : value, z.string().trim().max(max).optional());

const issueSingleSchema = z.object({
  eventId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  studentName: z.string().trim().min(2).max(150),
  studentId: optionalText(50),
  rollNumber: optionalText(50),
  email: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().email().max(254).optional()),
  department: optionalText(100),
  teamName: optionalText(150),
  projectTitle: optionalText(200),
  position: optionalText(100),
  certificateTitle: optionalText(150),
  achievement: optionalText(150),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required').optional(),
});

const revokeSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const reissueSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  templateId: z.string().uuid().optional(),
  certificateTitle: optionalText(150),
  achievement: optionalText(150),
  teamName: optionalText(150),
  projectTitle: optionalText(200),
  position: optionalText(100),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required').optional(),
});

const listCertsSchema = paginationSchema.extend({
  eventId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'PDF_GENERATED', 'SUBMITTED_TO_BLOCKCHAIN', 'CONFIRMED', 'FAILED', 'REVOKED']).optional(),
  search: z.string().trim().max(100).optional(),
  batchId: z.string().uuid().optional(),
});

/**
 * Public PDF download endpoint: allows direct downloading/viewing of finalized PDF.
 * Supports both Certificate ID (e.g. CERT-2026-AZZMDDUK) or database UUID.
 */
router.get(
  '/:certificateId/pdf',
  asyncHandler(async (req, res) => {
    const param = req.params.certificateId;
    const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);
    const cert = await prisma.certificate.findFirst({
      where: isGuid ? { id: param } : { certificateId: param },
      include: { event: true },
    });

    if (!cert) throw AppError.notFound('Certificate not found');

    if (!cert.storageKey) {
      throw AppError.badRequest('PDF has not been generated for this certificate yet');
    }

    const pdfBuffer = await storage.read(cert.storageKey);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cert.certificateId}.pdf"`);

    if (cert.storageKey?.startsWith('ipfs://')) {
      const cid = cert.storageKey.replace('ipfs://', '');
      res.setHeader('X-IPFS-CID', cid);
      res.setHeader('X-IPFS-Gateway-Url', pinata.getGatewayUrl(cid));
    }

    res.send(pdfBuffer);
  }),
);

// Protected routes require authentication
router.use(authenticate);

/**
 * List certificates with pagination and filters
 */
router.get(
  '/',
  validate(listCertsSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery;
    const where = {};
    if (q.eventId) where.eventId = q.eventId;
    if (q.status) where.status = q.status;
    if (q.batchId) where.batchId = q.batchId;
    if (q.search) {
      where.OR = [
        { recipientName: { contains: q.search, mode: 'insensitive' } },
        { certificateId: { contains: q.search, mode: 'insensitive' } },
        { studentIdentifier: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    // Role check: Teachers only see certificates for their events
    if (req.user.role !== 'ADMIN') {
      where.event = {
        OR: [{ createdById: req.user.id }, { issuerId: req.user.id }],
      };
    }

    const [items, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toPrisma(q),
        include: {
          event: { select: { id: true, name: true, eventDate: true } },
          template: { select: { id: true, name: true, key: true } },
          issuedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.certificate.count({ where }),
    ]);

    res.json({ success: true, data: items, meta: meta(q, total) });
  }),
);

/**
 * Get single certificate details
 */
router.get(
  '/:certificateId',
  asyncHandler(async (req, res) => {
    const cert = await prisma.certificate.findUnique({
      where: { certificateId: req.params.certificateId },
      include: {
        event: true,
        template: true,
        issuedBy: { select: { id: true, name: true, email: true } },
        revokedBy: { select: { id: true, name: true } },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!cert) throw AppError.notFound('Certificate not found');

    if (
      req.user.role !== 'ADMIN' &&
      cert.event.createdById !== req.user.id &&
      cert.event.issuerId !== req.user.id
    ) {
      throw AppError.forbidden('You do not have access to view this certificate');
    }

    const ipfsHash = cert.storageKey?.startsWith('ipfs://')
      ? cert.storageKey.replace('ipfs://', '')
      : null;
    const ipfsUrl = ipfsHash ? pinata.getGatewayUrl(ipfsHash) : null;

    res.json({
      success: true,
      data: {
        ...cert,
        ipfsHash,
        ipfsUrl,
      },
    });
  }),
);

/**
 * Issue single certificate
 */
router.post(
  '/',
  validate(issueSingleSchema),
  asyncHandler(async (req, res) => {
    const cert = await service.issueSingleCertificate(req.user, req.body, req.ip);
    res.status(201).json({ success: true, data: cert });
  }),
);

/**
 * Preview and normalize a recipient CSV/XLSX without issuing certificates.
 */
router.post(
  '/bulk/preview',
  csvUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw AppError.badRequest('Please upload a CSV or XLSX file');
    }

    const recipients = await parseRecipientFile(req.file.buffer, req.file.originalname);
    res.json({
      success: true,
      data: {
        filename: req.file.originalname,
        recipients,
      },
    });
  }),
);

/**
 * Bulk issue certificates via CSV upload or JSON list
 */
router.post(
  '/bulk',
  csvUpload,
  asyncHandler(async (req, res) => {
    const { eventId, templateId, idempotencyKey } = req.body;
    if (!eventId || !isUuid(eventId)) {
      throw AppError.badRequest('Valid eventId (UUID) is required in form fields');
    }

    let recipients = [];
    let originalFilename = null;

    if (req.file) {
      // Process uploaded CSV
      originalFilename = req.file.originalname;
      recipients = await parseRecipientFile(req.file.buffer, req.file.originalname);
    } else if (req.body.recipients) {
      // JSON array of recipients
      try {
        recipients = typeof req.body.recipients === 'string'
          ? JSON.parse(req.body.recipients)
          : req.body.recipients;
      } catch {
        throw AppError.badRequest('Invalid JSON for recipients');
      }
      originalFilename = typeof req.body.originalFilename === 'string'
        ? req.body.originalFilename
        : null;
      if (originalFilename && !/\.(csv|xlsx)$/i.test(originalFilename)) {
        throw AppError.badRequest('originalFilename must end with .csv or .xlsx');
      }
    } else {
      throw AppError.badRequest('Please upload a CSV file or provide recipients array');
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw AppError.badRequest('At least 1 recipient is required');
    }
    if (idempotencyKey && (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length > 100)) {
      throw AppError.badRequest('idempotencyKey must be at most 100 characters');
    }

    const result = await service.processBatchIssuance(
      req.user,
      {
        eventId,
        templateId: templateId && isUuid(templateId) ? templateId : null,
        recipients,
        originalFilename,
        idempotencyKey,
      },
      req.ip,
    );

    res.status(201).json({ success: true, data: result });
  }),
);

/**
 * Get batch status and results
 */
router.get(
  '/batches/:batchId',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.batchId)) throw AppError.notFound('Batch not found');
    const batch = await prisma.issuanceBatch.findUnique({
      where: { id: req.params.batchId },
      include: {
        event: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
        certificates: {
          select: {
            id: true,
            certificateId: true,
            recipientName: true,
            status: true,
            txHash: true,
            verificationUrl: true,
          },
        },
      },
    });

    if (!batch) throw AppError.notFound('Batch not found');
    res.json({ success: true, data: batch });
  }),
);

router.post(
  '/batches/:batchId/resume',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.batchId)) throw AppError.notFound('Batch not found');
    const result = await service.resumeBatchIssuance(req.user, req.params.batchId, req.ip);
    res.json({ success: true, data: result });
  }),
);

/**
 * Retry failed registration
 */
router.post(
  '/:certificateId/retry',
  asyncHandler(async (req, res) => {
    const cert = await service.retryCertificateRegistration(req.user, req.params.certificateId, req.ip);
    res.json({ success: true, data: cert });
  }),
);

/**
 * Revoke certificate
 */
router.post(
  '/:certificateId/revoke',
  validate(revokeSchema),
  asyncHandler(async (req, res) => {
    const cert = await service.revokeCertificate(req.user, req.params.certificateId, req.body.reason, req.ip);
    res.json({ success: true, data: cert });
  }),
);

/**
 * Issue a new certificate while preserving the original record and chain entry.
 */
router.post(
  '/:certificateId/reissue',
  validate(reissueSchema),
  asyncHandler(async (req, res) => {
    const cert = await service.reissueCertificate(
      req.user,
      req.params.certificateId,
      req.body.reason,
      req.body,
      req.ip,
    );
    res.status(201).json({ success: true, data: cert });
  }),
);

module.exports = router;
