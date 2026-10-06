'use strict';

const { z } = require('zod');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/** YYYY-MM-DD calendar date -> Date at UTC midnight (stored in @db.Date columns). */
const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Invalid calendar date')
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

const formatDateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

module.exports = { isUuid, dateOnly, formatDateOnly, UUID_RE };
