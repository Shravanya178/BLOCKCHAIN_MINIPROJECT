'use strict';

const { z } = require('zod');
const { dateOnly } = require('../../validators/common');
const { paginationSchema } = require('../../utils/pagination');

const text = (max) => z.string().trim().min(1).max(max);

const baseFields = {
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  eventDate: dateOnly,
  endDate: dateOnly.optional(),
  venue: text(200).optional(),
  organizingBody: z.string().trim().min(2).max(200),
  institutionName: text(200).optional(),
  signatoryName: text(120).optional(),
  signatoryTitle: text(120).optional(),
  issuerId: z.string().uuid().optional(),
  defaultTemplateId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED']).optional(),
};

const createEventSchema = z
  .object(baseFields)
  .refine((v) => !v.endDate || v.endDate >= v.eventDate, { message: 'endDate cannot be before eventDate', path: ['endDate'] });

const updateEventSchema = z
  .object({
    ...baseFields,
    description: z.string().trim().max(2000).nullable(),
    endDate: dateOnly.nullable(),
    venue: text(200).nullable(),
    signatoryName: text(120).nullable(),
    signatoryTitle: text(120).nullable(),
    defaultTemplateId: z.string().uuid().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

const listEventsSchema = paginationSchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  search: z.string().trim().max(100).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  mine: z.enum(['true', 'false']).optional(),
});

module.exports = { createEventSchema, updateEventSchema, listEventsSchema };
