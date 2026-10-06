'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { generateQrPng } = require('./qr.service');
const { STANDARD_FONTS } = require('../modules/templates/layout.schema');

const FONTS_DIR = path.resolve(__dirname, '../../assets/fonts');
const A4 = { landscape: [841.89, 595.28], portrait: [595.28, 841.89] };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDate(value, fmt = 'DD MMM YYYY') {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const month = MONTHS[d.getUTCMonth()];
  switch (fmt) {
    case 'DD/MM/YYYY': return `${dd}/${mm}/${yyyy}`;
    case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
    case 'MMMM D, YYYY': return `${month} ${d.getUTCDate()}, ${yyyy}`;
    default: return `${dd} ${month.slice(0, 3)} ${yyyy}`;
  }
}

/** Converts raw certificate data into display strings used by fields and {{placeholders}}. */
function buildValues(data, verificationUrl, dateFormat) {
  return {
    studentName: data.studentName,
    studentId: data.studentId || '',
    eventName: data.eventName,
    eventDate: formatDate(data.eventDate, dateFormat),
    issueDate: formatDate(data.issueDate, dateFormat),
    achievement: data.achievement || '',
    certificateTitle: data.certificateTitle || '',
    organizingBody: data.organizingBody || '',
    institutionName: data.institutionName || '',
    issuerName: data.issuerName || '',
    signatoryName: data.signatoryName || '',
    signatoryTitle: data.signatoryTitle || '',
    venue: data.venue || '',
    certificateId: data.certificateId,
    verificationUrl,
  };
}

const fillPlaceholders = (text, values) =>
  text.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (_, key) => (values[key] !== undefined ? String(values[key]) : ''));

function resolveFont(doc, font, registered) {
  if (STANDARD_FONTS.includes(font)) return font;
  const file = path.join(FONTS_DIR, path.basename(font));
  if (!fs.existsSync(file)) return 'Helvetica';
  if (!registered.has(font)) {
    doc.registerFont(font, file);
    registered.add(font);
  }
  return font;
}

/**
 * Draws text inside its box, shrinking the font (down to minFontSize) so long
 * names/titles fit within `maxLines`; anything still too long is ellipsized.
 * The text never flows onto a new page.
 */
function drawText(doc, spec, rawText, page, registered) {
  if (!rawText) return;
  let text = `${spec.prefix || ''}${rawText}${spec.suffix || ''}`;
  if (spec.uppercase) text = text.toUpperCase();

  const x = spec.x * page.width;
  const y = spec.y * page.height;
  const width = Math.min(spec.width * page.width, page.width - x);
  const maxLines = spec.maxLines || 1;
  const minSize = spec.minFontSize || Math.max(5, spec.fontSize * 0.45);
  const opts = { width, align: spec.align || 'center', characterSpacing: spec.characterSpacing || 0, lineGap: 0 };

  doc.font(resolveFont(doc, spec.font || 'Helvetica', registered));
  let size = spec.fontSize;
  for (; size > minSize; size -= 0.5) {
    doc.fontSize(size);
    if (doc.heightOfString(text, opts) <= doc.currentLineHeight(true) * maxLines + 0.5) break;
  }
  doc.fontSize(Math.max(size, minSize));
  const boxHeight = Math.min(doc.currentLineHeight(true) * maxLines + 1, page.height - y);
  doc.fillColor(spec.color || '#111111').text(text, x, y, { ...opts, height: boxHeight, ellipsis: true });
}

/** Simple bordered page used only when a template has no Canva background yet. */
function drawFallbackBackground(doc, page) {
  doc.rect(0, 0, page.width, page.height).fill('#FFFFFF');
  doc.lineWidth(6).strokeColor('#1F3A5F').rect(18, 18, page.width - 36, page.height - 36).stroke();
  doc.lineWidth(1.2).strokeColor('#B8912F').rect(30, 30, page.width - 60, page.height - 60).stroke();
}

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/**
 * Renders the final personalized certificate PDF.
 * @param {object} p
 * @param {object} p.template   CertificateTemplate row (layout already validated)
 * @param {Buffer|null} p.background  Canva PNG/JPEG export, or null for fallback
 * @param {object} p.data       certificate values (studentName, eventName, certificateId, ...)
 * @param {string} p.verificationUrl
 * @returns {Promise<Buffer>} exact PDF bytes (these are what get hashed)
 */
async function renderCertificatePdf({ template, background, data, verificationUrl }) {
  const layout = template.layout;
  const values = buildValues(data, verificationUrl, layout.dateFormat);

  const doc = new PDFDocument({
    autoFirstPage: false,
    margin: 0,
    info: {
      Title: `Certificate ${data.certificateId}`,
      Author: data.institutionName || 'Certificate Registry',
      Subject: data.eventName,
      Keywords: `certificate-id:${data.certificateId}`,
      Creator: 'Blockchain Certificate Registry',
      CreationDate: new Date(),
    },
  });

  let page;
  let image = null;
  if (background) {
    image = doc.openImage(background);
    // Keep the Canva aspect ratio so fractional coordinates map exactly.
    const landscape = image.width >= image.height;
    const width = landscape ? A4.landscape[0] : A4.portrait[0];
    page = { width, height: (width * image.height) / image.width };
  } else {
    const [width, height] = A4[template.orientation === 'portrait' ? 'portrait' : 'landscape'];
    page = { width, height };
  }

  doc.addPage({ size: [page.width, page.height], margin: 0 });
  if (image) doc.image(image, 0, 0, { width: page.width, height: page.height });
  else drawFallbackBackground(doc, page);

  const registered = new Set();
  for (const [name, spec] of Object.entries(layout.fields || {})) {
    if (spec) drawText(doc, spec, values[name], page, registered);
  }
  for (const block of layout.customTexts || []) {
    drawText(doc, block, fillPlaceholders(block.text, values), page, registered);
  }

  const qr = layout.qrCode;
  const qrSize = qr.size * page.width;
  const qrPng = await generateQrPng(verificationUrl, { dark: qr.dark, light: qr.light });
  doc.image(qrPng, qr.x * page.width, qr.y * page.height, { width: qrSize, height: qrSize });

  return toBuffer(doc);
}

module.exports = { renderCertificatePdf, formatDate, fillPlaceholders, buildValues };
