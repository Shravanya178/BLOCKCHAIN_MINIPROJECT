'use strict';

const { z } = require('zod');
const { dateOnly } = require('../../validators/common');
const { paginationSchema } = require('../../utils/pagination');

const text = (max) => z.string().trim().min(1).max(max);
const eventCategories = [
  'TECHNICAL_WORKSHOPS',
  'HACKATHONS',
  'SYMPOSIUMS',
  'SEMINARS',
  'FACULTY_DEVELOPMENT',
  'CULTURAL',
  'SPORTS',
  'CLUBS_VOLUNTEERING',
  'SOCIAL_OUTREACH',
  'ENTREPRENEURSHIP',
  'CAREER_DEVELOPMENT',
  'ACADEMIC_RECOGNITION',
];
const certificateTypes = [
  'PARTICIPATION',
  'COMPLETION',
  'EXCELLENCE',
  'WINNER',
  'RUNNER_UP',
  'FINALIST',
  'BEST_PAPER',
  'PAPER_PRESENTATION',
  'POSTER_PRESENTATION',
  'RESOURCE_PERSON',
  'SPEAKER',
  'MENTOR',
  'COORDINATOR',
  'ORGANIZING_COMMITTEE',
  'BEST_PERFORMER',
  'CORE_TEAM_MEMBER',
  'VOLUNTEER_APPRECIATION',
  'LEADERSHIP_CONTRIBUTION',
  'INNOVATION_AWARD',
  'PROJECT_SHOWCASE',
  'INDUSTRY_VISIT',
  'MERIT',
  'ACHIEVEMENT',
  'RESEARCH_CONTRIBUTION',
  'OUTSTANDING_CONTRIBUTION',
];
const validityPolicies = ['PERMANENT', 'DAYS_AFTER_ISSUE', 'UNTIL_DATE'];

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
  category: z.enum(eventCategories).optional(),
  certificateType: z.enum(certificateTypes).optional(),
  validityPolicy: z.enum(validityPolicies).default('PERMANENT'),
  validityDays: z.number().int().positive().max(3650).optional(),
  validUntil: dateOnly.optional(),
  issuerId: z.string().uuid().optional(),
  defaultTemplateId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED']).optional(),
};

const createEventSchema = z
  .object(baseFields)
  .refine((v) => !v.endDate || v.endDate >= v.eventDate, { message: 'endDate cannot be before eventDate', path: ['endDate'] })
  .refine((v) => v.validityPolicy !== 'DAYS_AFTER_ISSUE' || v.validityDays !== undefined, {
    message: 'validityDays is required when validityPolicy is DAYS_AFTER_ISSUE',
    path: ['validityDays'],
  })
  .refine((v) => v.validityPolicy !== 'UNTIL_DATE' || v.validUntil !== undefined, {
    message: 'validUntil is required when validityPolicy is UNTIL_DATE',
    path: ['validUntil'],
  });

const updateEventSchema = z
  .object({
    ...baseFields,
    description: z.string().trim().max(2000).nullable(),
    endDate: dateOnly.nullable(),
    venue: text(200).nullable(),
    signatoryName: text(120).nullable(),
    signatoryTitle: text(120).nullable(),
    category: z.enum(eventCategories),
    certificateType: z.enum(certificateTypes),
    validityPolicy: z.enum(validityPolicies),
    validityDays: z.number().int().positive().max(3650).nullable(),
    validUntil: dateOnly.nullable(),
    defaultTemplateId: z.string().uuid().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required')
  .refine((v) => v.validityPolicy !== 'DAYS_AFTER_ISSUE' || v.validityDays !== undefined, {
    message: 'validityDays is required when validityPolicy is DAYS_AFTER_ISSUE',
    path: ['validityDays'],
  })
  .refine((v) => v.validityPolicy !== 'UNTIL_DATE' || v.validUntil !== undefined, {
    message: 'validUntil is required when validityPolicy is UNTIL_DATE',
    path: ['validUntil'],
  });

const listEventsSchema = paginationSchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  search: z.string().trim().max(100).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  mine: z.enum(['true', 'false']).optional(),
});

module.exports = { createEventSchema, updateEventSchema, listEventsSchema };
