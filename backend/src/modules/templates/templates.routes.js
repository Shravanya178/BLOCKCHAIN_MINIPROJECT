'use strict';

const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const { imageUpload } = require('../../middleware/upload');
const service = require('./templates.service');
const { FIELD_NAMES, STANDARD_FONTS } = require('./layout.schema');

const router = express.Router();
router.use(authenticate);

const listSchema = z.object({
  category: z.enum(['PARTICIPATION', 'ACHIEVEMENT', 'WORKSHOP', 'TECHNICAL', 'OTHER']).optional(),
  includeInactive: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

router.get(
  '/',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.list(req.validatedQuery, req.user) });
  }),
);

// Reference info for the frontend layout editor.
router.get('/layout-spec', (_req, res) => {
  res.json({
    success: true,
    data: {
      coordinateSystem: 'Fractions (0..1) of page width/height, origin at top-left. x,y = top-left of the text box.',
      fields: FIELD_NAMES,
      fonts: STANDARD_FONTS,
      customFonts: 'Place .ttf/.otf files in backend/assets/fonts and reference them by file name.',
      placeholders: FIELD_NAMES.map((f) => `{{${f}}}`),
      requiredFields: ['studentName', 'certificateId'],
      background: 'PNG or JPEG exported from Canva (recommended: PNG, 2x size). Max 10 MB.',
    },
  });
});

router.get(
  '/:templateId',
  asyncHandler(async (req, res) => {
    const t = await service.getTemplateOrThrow(req.params.templateId);
    res.json({ success: true, data: service.publicTemplate(t) });
  }),
);

router.get(
  '/:templateId/background',
  asyncHandler(async (req, res) => {
    const t = await service.getTemplateOrThrow(req.params.templateId);
    const buf = await service.loadBackground(t);
    if (!buf) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Template has no background image' } });
    res.type(t.backgroundMimeType).send(buf);
  }),
);

router.get(
  '/:templateId/preview',
  asyncHandler(async (req, res) => {
    const pdf = await service.preview(req.params.templateId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="template-preview.pdf"');
    res.send(pdf);
  }),
);

router.post(
  '/',
  requireRole('ADMIN'),
  imageUpload,
  validate(service.createTemplateSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ success: true, data: await service.create(req.user, req.body, req.file, req.ip) });
  }),
);

router.patch(
  '/:templateId',
  requireRole('ADMIN'),
  imageUpload,
  validate(service.updateTemplateSchema),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.update(req.user, req.params.templateId, req.body, req.file, req.ip) });
  }),
);

module.exports = router;
