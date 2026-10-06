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
const { paginationSchema, toPrisma, meta } = require('../../utils/pagination');
const { isUuid, dateOnly } = require('../../validators/common');
const { parseRecipientCsv } = require('./csv.parser');
const service = require('./certificates.service');

const router = express.Router();

const issueSingleSchema = z.object({
  eventId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  studentName: z.string().trim().min(2).max(150),
  studentId: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(254).optional(),
  department: z.string().trim().max(100).optional(),
  certificateTitle: z.string().trim().max(150).optional(),
  achievement: z.string().trim().max(150).optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required').optional(),
});

const revokeSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const listCertsSchema = paginationSchema.extend({
  eventId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'PDF_GENERATED', 'SUBMITTED_TO_BLOCKCHAIN', 'CONFIRMED', 'FAILED', 'REVOKED']).optional(),
  search: z.string().trim().max(100).optional(),
  batchId: z.string().uuid().optional(),
});

// All certificates routes require authentication
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

    res.json({ success: true, data: cert });
  }),
);

/**
 * Download generated certificate PDF
 */
router.get(
  '/:certificateId/pdf',
  asyncHandler(async (req, res) => {
    const cert = await prisma.certificate.findUnique({
      where: { certificateId: req.params.certificateId },
      include: { event: true },
    });

    if (!cert) throw AppError.notFound('Certificate not found');

    if (!cert.storageKey) {
      throw AppError.badRequest('PDF has not been generated for this certificate yet');
    }

    const pdfBuffer = await storage.read(cert.storageKey);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cert.certificateId}.pdf"`);
    res.send(pdfBuffer);
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
      recipients = await parseRecipientCsv(req.file.buffer);
    } else if (req.body.recipients) {
      // JSON array of recipients
      try {
        recipients = typeof req.body.recipients === 'string'
          ? JSON.parse(req.body.recipients)
          : req.body.recipients;
      } catch {
        throw AppError.badRequest('Invalid JSON for recipients');
      }
    } else {
      throw AppError.badRequest('Please upload a CSV file or provide recipients array');
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw AppError.badRequest('At least 1 recipient is required');
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

module.exports = router;
