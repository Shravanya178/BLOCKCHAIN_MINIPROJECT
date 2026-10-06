'use strict';

const multer = require('multer');
const config = require('../config');
const AppError = require('../utils/AppError');

// Files are kept in memory: CSVs are small and PDFs are only hashed, never stored.
const storage = multer.memoryStorage();

const csvUpload = multer({
  storage,
  limits: { fileSize: config.limits.csvBytes, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => {
    const okName = /\.csv$/i.test(file.originalname);
    const okType = ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'].includes(file.mimetype);
    if (!okName || !okType) return cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only .csv files are accepted'));
    return cb(null, true);
  },
}).single('file');

const pdfUpload = multer({
  storage,
  limits: { fileSize: config.limits.pdfUploadBytes, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (!/\.pdf$/i.test(file.originalname) && file.mimetype !== 'application/pdf') {
      return cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only PDF files are accepted'));
    }
    return cb(null, true);
  },
}).single('file');

// Canva exports (PNG/JPEG) used as certificate template backgrounds.
const imageUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/png', 'image/jpeg'].includes(file.mimetype)) {
      return cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Template background must be a PNG or JPEG exported from Canva'));
    }
    return cb(null, true);
  },
}).single('background');

/** Checks file signatures so a renamed file cannot masquerade as an image/PDF. */
const magic = {
  isPng: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  isJpeg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  isPdf: (b) => b.length > 5 && b.subarray(0, 5).toString('latin1') === '%PDF-',
};

module.exports = { csvUpload, pdfUpload, imageUpload, magic };
