'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { PDFDocument: PdfLibDocument, StandardFonts, rgb } = require('pdf-lib');
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
  const duration = data.duration || (
    data.eventEndDate && data.eventDate
      ? `${formatDate(data.eventDate, dateFormat)} - ${formatDate(data.eventEndDate, dateFormat)}`
      : ''
  );
  const certificateType = String(data.certificateType || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const certificateTypeLabel = ['Participation', 'Completion'].includes(certificateType)
    ? `Certificate of ${certificateType}`
    : certificateType;
  const validUntil = data.validUntil === null
    ? 'Permanent'
    : formatDate(data.validUntil, dateFormat);
  return {
    studentName: data.studentName,
    studentId: data.studentId || '',
    eventName: data.eventName,
    eventDate: formatDate(data.eventDate, dateFormat),
    duration,
    issueDate: formatDate(data.issueDate, dateFormat),
    validUntil,
    achievement: data.achievement || '',
    certificateTitle: data.certificateTitle || '',
    organizingBody: data.organizingBody || '',
    institutionName: data.institutionName || '',
    issuerName: data.issuerName || '',
    signatoryName: data.signatoryName || '',
    signatoryDesignation: data.signatoryDesignation || data.signatoryTitle || '',
    signatoryTitle: data.signatoryTitle || '',
    venue: data.venue || '',
    department: data.department || '',
    certificateType: certificateTypeLabel,
    teamName: data.teamName || '',
    projectTitle: data.projectTitle || '',
    position: data.position || '',
    certificateId: data.certificateId,
    verificationUrl,
    qrCode: verificationUrl,
    signatureImage: data.signatureImage || '',
    institutionLogo: data.institutionLogo || '',
    // Supplied PDF/custom layouts may use snake_case names. Keep these
    // aliases explicit so no raw placeholder can reach the final PDF.
    recipient_name: data.studentName || '',
    certificate_description: data.certificateDescription || data.achievement || data.certificateTitle || '',
    event_name: data.eventName || '',
    event_date: formatDate(data.eventDate, dateFormat),
    issuer_name: data.issuerName || data.signatoryName || '',
    issuer_designation: data.issuerDesignation || data.signatoryDesignation || data.signatoryTitle || '',
    signature: data.signature || data.signatureImage || data.signatoryName || '',
    qr_code: verificationUrl,
    certificate_id: data.certificateId || '',
  };
}

const fillPlaceholders = (text, values) => {
  let missingValue = false;
  const replaced = text.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_, key) => {
    const value = values[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      missingValue = true;
      return '';
    }
    return String(value);
  });
  return missingValue ? '' : replaced;
};

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

function pdfLibColor(hex) {
  return rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
}

function pdfLibFont(font) {
  const map = {
    Helvetica: StandardFonts.Helvetica,
    'Helvetica-Bold': StandardFonts.HelveticaBold,
    'Helvetica-Oblique': StandardFonts.HelveticaOblique,
    'Helvetica-BoldOblique': StandardFonts.HelveticaBoldOblique,
    'Times-Roman': StandardFonts.TimesRoman,
    'Times-Bold': StandardFonts.TimesRomanBold,
    'Times-Italic': StandardFonts.TimesRomanItalic,
    'Times-BoldItalic': StandardFonts.TimesRomanBoldItalic,
    Courier: StandardFonts.Courier,
    'Courier-Bold': StandardFonts.CourierBold,
    'Courier-Oblique': StandardFonts.CourierOblique,
    'Courier-BoldOblique': StandardFonts.CourierBoldOblique,
  };
  return map[font] || StandardFonts.Helvetica;
}

function drawPdfLibText(page, spec, rawText, values, fonts) {
  if (!rawText) return;
  let text = `${spec.prefix || ''}${rawText}${spec.suffix || ''}`;
  if (spec.uppercase) text = text.toUpperCase();
  const { width, height } = page.getSize();
  const font = fonts[pdfLibFont(spec.font || 'Helvetica')];
  const maxWidth = spec.width * width;
  const minSize = spec.minFontSize || Math.max(5, spec.fontSize * 0.55);
  let size = spec.fontSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  const maxLines = spec.maxLines || 1;
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[maxLines - 1] = `${last}...`;
  }

  const boxX = spec.x * width;
  const lineHeight = size * 1.15;
  lines.forEach((value, index) => {
    const lineWidth = font.widthOfTextAtSize(value, size);
    let x = boxX;
    if (spec.align === 'center') x += (maxWidth - lineWidth) / 2;
    else if (spec.align === 'right') x += maxWidth - lineWidth;
    page.drawText(value, {
      x,
      y: height - (spec.y * height) - size - (index * lineHeight),
      size,
      maxWidth,
      font,
      color: pdfLibColor(spec.color || '#111111'),
    });
  });
}

function drawRedactRegions(page, regions) {
  const { width, height } = page.getSize();
  for (const region of regions || []) {
    page.drawRectangle({
      x: region.x * width,
      y: height - (region.y * height) - (region.height * height),
      width: region.width * width,
      height: region.height * height,
      color: pdfLibColor(region.color || '#FFFFFF'),
    });
  }
}

async function renderPdfTemplate({ template, background, data, verificationUrl }) {
  const sourceDoc = await PdfLibDocument.load(background);
  const output = await PdfLibDocument.create();
  const sourcePages = await output.copyPages(sourceDoc, sourceDoc.getPageIndices());
  sourcePages.forEach((page) => output.addPage(page));
  const page = output.getPages()[0];
  const layout = template.layout;
  const values = buildValues(data, verificationUrl, layout.dateFormat);
  drawRedactRegions(page, layout.redactRegions);
  const fonts = {};
  for (const spec of Object.values(layout.fields || {})) {
    if (spec) fonts[pdfLibFont(spec.font || 'Helvetica')] = await output.embedFont(pdfLibFont(spec.font || 'Helvetica'));
  }
  for (const spec of layout.customTexts || []) {
    fonts[pdfLibFont(spec.font || 'Helvetica')] = await output.embedFont(pdfLibFont(spec.font || 'Helvetica'));
  }
  for (const [name, spec] of Object.entries(layout.fields || {})) {
    if (spec && !(layout.fieldPolicy?.hidden || []).includes(name)) drawPdfLibText(page, spec, values[name], values, fonts);
  }
  for (const block of layout.customTexts || []) {
    drawPdfLibText(page, block, fillPlaceholders(block.text, values), values, fonts);
  }
  const qr = layout.qrCode;
  const qrPng = await generateQrPng(verificationUrl, { dark: qr.dark, light: qr.light });
  const qrImage = await output.embedPng(qrPng);
  const { width, height } = page.getSize();
  const qrSize = qr.size * width;
  page.drawImage(qrImage, { x: qr.x * width, y: height - (qr.y * height) - qrSize, width: qrSize, height: qrSize });
  return Buffer.from(await output.save());
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
  if (template.backgroundMimeType === 'application/pdf') {
    return renderPdfTemplate({ template, background, data, verificationUrl });
  }
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

  for (const region of layout.redactRegions || []) {
    doc.fillColor(region.color || '#FFFFFF').rect(
      region.x * page.width,
      region.y * page.height,
      region.width * page.width,
      region.height * page.height,
    ).fill();
  }

  const registered = new Set();
  for (const [name, spec] of Object.entries(layout.fields || {})) {
    if (spec && !(layout.fieldPolicy?.hidden || []).includes(name)) drawText(doc, spec, values[name], page, registered);
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
