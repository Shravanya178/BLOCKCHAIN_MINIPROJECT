'use strict';

const QRCode = require('qrcode');
const config = require('../config');

/** Stable public verification URL. Contains only the public certificate ID. */
function buildVerificationUrl(certificateId) {
  return `${config.verificationUrlBase}/${encodeURIComponent(certificateId)}`;
}

/** PNG QR code (Buffer) for the given URL. */
async function generateQrPng(url, { dark = '#000000', light = '#FFFFFF', width = 600 } = {}) {
  return QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width,
    color: { dark, light },
  });
}

module.exports = { buildVerificationUrl, generateQrPng };
