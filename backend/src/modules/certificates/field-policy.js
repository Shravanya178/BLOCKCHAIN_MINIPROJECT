'use strict';

const PARTICIPANT_FIELDS = ['studentName', 'studentId', 'teamName', 'projectTitle', 'position'];

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function defaultFieldPolicy(event) {
  const hidden = [];
  if (event?.category === 'FACULTY_DEVELOPMENT') hidden.push('studentId', 'teamName');
  if (event?.certificateType === 'PARTICIPATION') hidden.push('teamName', 'projectTitle');
  return { required: ['studentName'], optional: PARTICIPANT_FIELDS.filter((field) => !hidden.includes(field)), hidden };
}

function getFieldPolicy(event, layout) {
  const configured = layout?.fieldPolicy;
  if (!configured) return defaultFieldPolicy(event);
  const profile = configured.byCertificateType?.[event?.certificateType]
    || configured.byEventCategory?.[event?.category];
  if (profile) {
    return {
      required: profile.required?.length ? profile.required : (configured.required || ['studentName']),
      optional: profile.optional?.length ? profile.optional : (configured.optional || []),
      hidden: profile.hidden || configured.hidden || [],
    };
  }
  return {
    required: configured.required || ['studentName'],
    optional: configured.optional || [],
    hidden: configured.hidden || [],
  };
}

function normalizeParticipant(item) {
  return {
    ...item,
    studentName: clean(item.studentName),
    studentId: clean(item.studentId || item.rollNumber),
    teamName: clean(item.teamName),
    projectTitle: clean(item.projectTitle),
    position: clean(item.position),
    achievement: clean(item.achievement),
    certificateTitle: clean(item.certificateTitle),
    email: clean(item.email),
    department: clean(item.department),
    issueDate: clean(item.issueDate),
  };
}

function validateParticipantFields(item, event, layout) {
  const participant = normalizeParticipant(item);
  const policy = getFieldPolicy(event, layout);
  const missing = policy.required.filter((field) => !clean(participant[field]));
  if (missing.length > 0) {
    throw new Error(`Required certificate field(s) missing: ${missing.join(', ')}`);
  }
  return participant;
}

module.exports = {
  PARTICIPANT_FIELDS,
  clean,
  getFieldPolicy,
  normalizeParticipant,
  validateParticipantFields,
};
