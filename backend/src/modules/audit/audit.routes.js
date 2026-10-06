'use strict';

const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const { paginationSchema } = require('../../utils/pagination');
const auditService = require('./audit.service');

const router = express.Router();

const querySchema = paginationSchema.extend({
  action: z.string().max(100).optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.string().max(100).optional(),
  actorId: z.string().uuid().optional(),
});

router.get(
  '/',
  authenticate,
  requireRole('ADMIN'),
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { items, meta } = await auditService.list(req.validatedQuery);
    res.json({ success: true, data: items, meta });
  }),
);

module.exports = router;
