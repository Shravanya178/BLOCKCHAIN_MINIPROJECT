'use strict';

const { z } = require('zod');
const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const storage = require('../../services/storage.service');
const { sha256Hex } = require('../../services/hashing.service');
const { renderCertificatePdf } = require('../../services/pdf.service');
const { buildVerificationUrl } = require('../../services/qr.service');
const { magic } = require('../../middleware/upload');
const { isUuid } = require('../../validators/common');
const { layoutSchema } = require('./layout.schema');
const audit = require('../audit/audit.service');
const config = require('../../config');

const CATEGORIES = ['PARTICIPATION', 'ACHIEVEMENT', 'WORKSHOP', 'TECHNICAL', 'OTHER'];

// Multipart forms send everything as strings; accept JSON strings for layout.
const jsonField = (schema) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v);
    } catch {
      return { __invalidJson: true };
    }
  }, schema);
const boolField = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());

const createTemplateSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,59}$/, 'key must be 3-60 chars: lowercase letters, digits, hyphens'),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional(),
  category: z.enum(CATEGORIES),
  orientation: z.enum(['landscape', 'portrait']).default('landscape'),
  layout: jsonField(layoutSchema),
});

const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(500).nullable(),
    category: z.enum(CATEGORIES),
    orientation: z.enum(['landscape', 'portrait']),
    layout: jsonField(layoutSchema),
    isActive: boolField,
    removeBackground: boolField,
  })
  .partial();

const publicTemplate = (t) => ({
  id: t.id,
  key: t.key,
  name: t.name,
  description: t.description,
  category: t.category,
  orientation: t.orientation,
  hasBackground: Boolean(t.backgroundKey),
  backgroundUrl: t.backgroundKey ? `${config.apiPrefix}/templates/${t.id}/background` : null,
  previewUrl: `${config.apiPrefix}/templates/${t.id}/preview`,
  layout: t.layout,
  isActive: t.isActive,
  version: t.version,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

function validateBackground(file) {
  if (!file) return null;
  const ok = (file.mimetype === 'image/png' && magic.isPng(file.buffer)) || (file.mimetype === 'image/jpeg' && magic.isJpeg(file.buffer));
  if (!ok) throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'File content is not a valid PNG/JPEG image');
  return file;
}

async function storeBackground(key, version, file) {
  const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
  const storageKey = `templates/${key}-v${version}.${ext}`;
  await storage.save(storageKey, file.buffer);
  return { backgroundKey: storageKey, backgroundMimeType: file.mimetype, backgroundSha256: sha256Hex(file.buffer) };
}

async function getTemplateOrThrow(templateId) {
  if (!isUuid(templateId)) throw AppError.notFound('Template not found');
  const t = await prisma.certificateTemplate.findUnique({ where: { id: templateId } });
  if (!t) throw AppError.notFound('Template not found');
  return t;
}

/** Template usable for issuance: exists, active, and its stored layout is still valid. */
async function getUsableTemplate(templateId) {
  const t = await getTemplateOrThrow(templateId);
  if (!t.isActive) throw AppError.validation('Selected template is inactive');
  const parsed = layoutSchema.safeParse(t.layout);
  if (!parsed.success) throw AppError.validation('Selected template has an invalid layout');
  return { ...t, layout: parsed.data };
}

async function loadBackground(template) {
  return template.backgroundKey ? storage.read(template.backgroundKey) : null;
}

async function list({ category, includeInactive }, user) {
  const where = {};
  if (category) where.category = category;
  if (!(includeInactive && user.role === 'ADMIN')) where.isActive = true;
  const items = await prisma.certificateTemplate.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  return items.map(publicTemplate);
}

async function create(user, body, file, ip) {
  validateBackground(file);
  if (await prisma.certificateTemplate.findUnique({ where: { key: body.key } })) {
    throw AppError.conflict('A template with this key already exists');
  }
  const bg = file ? await storeBackground(body.key, 1, file) : {};
  const t = await prisma.certificateTemplate.create({ data: { ...body, ...bg, createdById: user.id } });
  await audit.record({ actorId: user.id, action: 'TEMPLATE_CREATED', entityType: 'CertificateTemplate', entityId: t.id, metadata: { key: t.key, hasBackground: Boolean(file) }, ip });
  return publicTemplate(t);
}

async function update(user, templateId, body, file, ip) {
  validateBackground(file);
  const existing = await getTemplateOrThrow(templateId);
  const { removeBackground, ...rest } = body;
  if (Object.keys(rest).length === 0 && !file && !removeBackground) throw AppError.validation('Nothing to update');

  const designChanged = Boolean(file || removeBackground || rest.layout || rest.orientation);
  const version = designChanged ? existing.version + 1 : existing.version;
  const data = { ...rest, version };
  if (file) Object.assign(data, await storeBackground(existing.key, version, file));
  else if (removeBackground) Object.assign(data, { backgroundKey: null, backgroundMimeType: null, backgroundSha256: null });

  // Previously issued certificates are unaffected: their PDFs are stored and hashed already.
  const t = await prisma.certificateTemplate.update({ where: { id: existing.id }, data });
  await audit.record({
    actorId: user.id,
    action: 'TEMPLATE_UPDATED',
    entityType: 'CertificateTemplate',
    entityId: t.id,
    metadata: { fields: Object.keys(body), backgroundReplaced: Boolean(file), version },
    ip,
  });
  return publicTemplate(t);
}

/** Renders a sample PDF so the team can align a Canva background with the layout. */
async function preview(templateId) {
  const t = await getTemplateOrThrow(templateId);
  const parsed = layoutSchema.safeParse(t.layout);
  if (!parsed.success) throw AppError.validation('Template layout is invalid', parsed.error.issues);
  const certificateId = 'CERT-PREVIEW-0000';
  return renderCertificatePdf({
    template: { ...t, layout: parsed.data },
    background: await loadBackground(t),
    verificationUrl: buildVerificationUrl(certificateId),
    data: {
      certificateId,
      studentName: 'Aaradhya Venkataraman Subramaniam',
      studentId: '2023CS0042',
      eventName: 'National Level Hackathon - CodeStorm 2026',
      eventDate: new Date(),
      issueDate: new Date(),
      achievement: 'First Prize',
      certificateTitle: t.name,
      organizingBody: 'Department of Computer Engineering',
      institutionName: config.institutionName,
      issuerName: 'Prof. A. Sharma',
      signatoryName: 'Dr. R. Kulkarni',
      signatoryTitle: 'Principal',
      venue: 'Main Auditorium',
    },
  });
}

module.exports = {
  createTemplateSchema,
  updateTemplateSchema,
  list,
  create,
  update,
  preview,
  getTemplateOrThrow,
  getUsableTemplate,
  loadBackground,
  publicTemplate,
};
