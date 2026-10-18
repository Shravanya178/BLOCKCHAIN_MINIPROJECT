'use strict';

const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { verifyLimiter } = require('../../middleware/rateLimiters');
const { pdfUpload } = require('../../middleware/upload');
const AppError = require('../../utils/AppError');
const service = require('./verification.service');

const router = express.Router();

/**
 * Public endpoint: verify certificate by unique Certificate ID
 * No authentication required
 */
router.get(
  '/:certificateId',
  verifyLimiter,
  asyncHandler(async (req, res) => {
    const { certificateId } = req.params;
    const result = await service.verifyCertificateById(certificateId);

    const httpStatus =
      result.status === 'VERIFIED'
        ? 200
        : result.status === 'NOT_FOUND' || result.status === 'NOT_FOUND_ON_CHAIN'
        ? 404
        : result.status === 'REVOKED'
        ? 410 // Gone / Revoked
        : result.status === 'VERIFICATION_UNAVAILABLE'
        ? 503
        : 400;

    res.status(httpStatus).json({
      success: result.isVerified,
      data: result,
    });
  }),
);

/**
 * Public endpoint: verify authenticity of an uploaded certificate PDF
 * Checks if the computed SHA-256 hash matches the registered hash on blockchain
 */
router.post(
  '/document',
  verifyLimiter,
  pdfUpload,
  asyncHandler(async (req, res) => {
    if (!req.file || !req.file.buffer) {
      throw AppError.badRequest('Please upload a certificate PDF file under form field "file"');
    }

    const result = await service.verifyDocument(req.file.buffer);

    const httpStatus =
      result.status === 'VERIFIED'
        ? 200
        : result.status === 'NOT_FOUND'
        ? 404
        : result.status === 'REVOKED'
        ? 410
        : result.status === 'HASH_MISMATCH'
        ? 422
        : 400;

    res.status(httpStatus).json({
      success: result.isVerified,
      data: result,
    });
  }),
);

module.exports = router;
