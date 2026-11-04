'use strict';

const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate, requireRole } = require('../../middleware/auth');
const service = require('./dashboard.service');

const router = express.Router();

router.get(
  '/stats',
  authenticate,
  requireRole('ADMIN', 'TEACHER'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.getStats(req.user) });
  }),
);

module.exports = router;
