'use strict';

const multer = require('multer');
const { Prisma } = require('@prisma/client');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function notFound(req, _res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl.split('?')[0]} not found`));
}

/**
 * Converts every error into the standard envelope:
 *   { success: false, error: { code, message, details? } }
 * Internal errors never leak stack traces or database details.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let error = err;

  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    error = new AppError(status, err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR', err.message);
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      error = AppError.conflict('A record with the same unique value already exists', { fields: err.meta?.target });
    } else if (err.code === 'P2025') {
      error = AppError.notFound();
    } else if (err.code === 'P2023') {
      // Malformed UUID or similar inconsistent identifier.
      error = AppError.notFound();
    } else if (err.code === 'P2003') {
      error = AppError.badRequest('Referenced record does not exist');
    }
  } else if (err instanceof Prisma.PrismaClientInitializationError) {
    error = AppError.unavailable('Database is unavailable');
  } else if (err.type === 'entity.too.large') {
    error = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else if (err.type === 'entity.parse.failed') {
    error = AppError.badRequest('Malformed JSON body');
  }

  if (!(error instanceof AppError)) {
    logger.error('Unhandled error', { err, method: req.method, path: req.originalUrl.split('?')[0] });
    error = new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }

  const body = { success: false, error: { code: error.code, message: error.message } };
  if (error.details !== undefined) body.error.details = error.details;
  res.status(error.status).json(body);
}

module.exports = { notFound, errorHandler };
