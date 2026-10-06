'use strict';

const express = require('express');
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const { paginationSchema, toPrisma, meta } = require('../../utils/pagination');
const { hashPassword, publicUser } = require('../auth/auth.service');
const audit = require('../audit/audit.service');

const router = express.Router();

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(2).max(120),
  password,
  role: z.enum(['ADMIN', 'TEACHER']).default('TEACHER'),
  designation: z.string().trim().max(120).optional(),
  canCreateEvents: z.boolean().default(true),
  canRevoke: z.boolean().default(false),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    password,
    role: z.enum(['ADMIN', 'TEACHER']),
    designation: z.string().trim().max(120).nullable(),
    canCreateEvents: z.boolean(),
    canRevoke: z.boolean(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

const listSchema = paginationSchema.extend({
  role: z.enum(['ADMIN', 'TEACHER']).optional(),
  search: z.string().trim().max(100).optional(),
});

router.use(authenticate, requireRole('ADMIN'));

router.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { password: plain, ...rest } = req.body;
    const exists = await prisma.user.findUnique({ where: { email: rest.email } });
    if (exists) throw AppError.conflict('A user with this email already exists');
    const user = await prisma.user.create({ data: { ...rest, passwordHash: await hashPassword(plain) } });
    await audit.record({ actorId: req.user.id, action: 'USER_CREATED', entityType: 'User', entityId: user.id, metadata: { role: user.role }, ip: req.ip });
    res.status(201).json({ success: true, data: publicUser(user) });
  }),
);

router.get(
  '/',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery;
    const where = {};
    if (q.role) where.role = q.role;
    if (q.search) where.OR = [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }];
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, ...toPrisma(q) }),
      prisma.user.count({ where }),
    ]);
    res.json({ success: true, data: users.map(publicUser), meta: meta(q, total) });
  }),
);

router.get(
  '/:userId',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } }).catch(() => null);
    if (!user) throw AppError.notFound('User not found');
    res.json({ success: true, data: publicUser(user) });
  }),
);

router.patch(
  '/:userId',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.findUnique({ where: { id: req.params.userId } }).catch(() => null);
    if (!existing) throw AppError.notFound('User not found');
    if (existing.id === req.user.id && (req.body.isActive === false || req.body.role === 'TEACHER')) {
      throw AppError.badRequest('You cannot deactivate or demote your own account');
    }
    const { password: plain, ...rest } = req.body;
    const data = { ...rest };
    if (plain) data.passwordHash = await hashPassword(plain);
    const user = await prisma.user.update({ where: { id: existing.id }, data });
    if (plain || rest.isActive === false) {
      await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit.record({
      actorId: req.user.id,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: user.id,
      metadata: { fields: Object.keys(req.body).map((k) => (k === 'password' ? 'password(changed)' : k)) },
      ip: req.ip,
    });
    res.json({ success: true, data: publicUser(user) });
  }),
);

module.exports = router;
