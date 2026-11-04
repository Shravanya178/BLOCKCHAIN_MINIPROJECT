const { createEventSchema, updateEventSchema } = require('../../src/modules/events/events.schemas');

const baseEvent = {
  name: 'VESIT Technical Workshop',
  eventDate: '2026-11-10',
  organizingBody: 'Computer Engineering Department',
  category: 'TECHNICAL_WORKSHOPS',
  certificateType: 'PARTICIPATION',
};

describe('Event domain validation', () => {
  it('accepts a permanent event policy by default', () => {
    const result = createEventSchema.parse(baseEvent);

    expect(result.validityPolicy).toBe('PERMANENT');
  });

  it('requires validityDays for days-after-issue policies', () => {
    const result = createEventSchema.safeParse({
      ...baseEvent,
      validityPolicy: 'DAYS_AFTER_ISSUE',
    });

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(['validityDays']);
  });

  it('accepts a fixed validity date', () => {
    const result = createEventSchema.parse({
      ...baseEvent,
      validityPolicy: 'UNTIL_DATE',
      validUntil: '2027-11-10',
    });

    expect(result.category).toBe('TECHNICAL_WORKSHOPS');
    expect(result.certificateType).toBe('PARTICIPATION');
  });

  it('rejects unsupported category and certificate type values', () => {
    const result = updateEventSchema.safeParse({
      category: 'UNSUPPORTED',
      certificateType: 'UNSUPPORTED',
    });

    expect(result.success).toBe(false);
    expect(result.error.issues).toHaveLength(2);
  });
});
