'use strict';

/**
 * Starter templates seeded for development. They have NO background image, so
 * the renderer draws a plain border plus the heading texts below. Once the team
 * exports designs from Canva, upload the PNG via PATCH /templates/:id and
 * adjust the coordinates (headings usually come from the Canva design itself,
 * so `customTexts` can then be emptied).
 */

const baseFields = {
  institutionName: { x: 0.1, y: 0.1, width: 0.8, fontSize: 18, font: 'Times-Bold', color: '#1F3A5F', uppercase: true, characterSpacing: 1.5 },
  organizingBody: { x: 0.1, y: 0.15, width: 0.8, fontSize: 11, font: 'Helvetica', color: '#555555' },
  studentName: { x: 0.12, y: 0.43, width: 0.76, fontSize: 36, minFontSize: 16, maxLines: 2, font: 'Times-BoldItalic', color: '#1F3A5F' },
  issuerName: { x: 0.1, y: 0.8, width: 0.25, fontSize: 11, font: 'Helvetica-Bold', color: '#222222' },
  signatoryName: { x: 0.65, y: 0.8, width: 0.25, fontSize: 11, font: 'Helvetica-Bold', color: '#222222' },
  signatoryTitle: { x: 0.65, y: 0.83, width: 0.25, fontSize: 9, font: 'Helvetica', color: '#555555' },
  certificateId: { x: 0.1, y: 0.905, width: 0.5, fontSize: 8.5, font: 'Courier-Bold', color: '#333333', align: 'left', prefix: 'Certificate ID: ' },
  issueDate: { x: 0.1, y: 0.928, width: 0.5, fontSize: 8, font: 'Helvetica', color: '#555555', align: 'left', prefix: 'Issued on: ' },
};

const qrCode = { x: 0.455, y: 0.72, size: 0.09, dark: '#1F3A5F', light: '#FFFFFF' };

const issuerCaption = { text: 'Event Coordinator', x: 0.1, y: 0.83, width: 0.25, fontSize: 9, font: 'Helvetica', color: '#555555' };
const scanCaption = { text: 'Scan to verify', x: 0.4, y: 0.88, width: 0.2, fontSize: 7.5, font: 'Helvetica', color: '#555555' };

const heading = (title, subtitle) => [
  { text: title, x: 0.1, y: 0.21, width: 0.8, fontSize: 38, font: 'Times-Bold', color: '#B8912F', characterSpacing: 2 },
  { text: subtitle, x: 0.1, y: 0.3, width: 0.8, fontSize: 14, font: 'Helvetica-Bold', color: '#1F3A5F', uppercase: true, characterSpacing: 3 },
  { text: 'This certificate is proudly presented to', x: 0.1, y: 0.37, width: 0.8, fontSize: 12, font: 'Times-Italic', color: '#555555' },
];

const body = (text) => ({ text, x: 0.15, y: 0.57, width: 0.7, fontSize: 13, minFontSize: 9, maxLines: 3, font: 'Helvetica', color: '#333333' });

const layout = (customTexts) => ({ fields: baseFields, customTexts: [...customTexts, issuerCaption, scanCaption], qrCode, dateFormat: 'DD MMM YYYY' });

module.exports = [
  {
    key: 'participation-default',
    name: 'Participation Certificate',
    description: 'Generic certificate of participation (replace background with a Canva export).',
    category: 'PARTICIPATION',
    layout: layout([...heading('CERTIFICATE', 'of Participation'), body('for actively participating in {{eventName}} organized by {{organizingBody}} on {{eventDate}}.')]),
  },
  {
    key: 'achievement-default',
    name: 'Winner / Achievement Certificate',
    description: 'For winners and position holders. Uses the achievement text (e.g. "First Prize").',
    category: 'ACHIEVEMENT',
    layout: layout([...heading('CERTIFICATE', 'of Achievement'), body('for securing {{achievement}} in {{eventName}} organized by {{organizingBody}} on {{eventDate}}.')]),
  },
  {
    key: 'workshop-default',
    name: 'Workshop Completion Certificate',
    description: 'For successful completion of a workshop or training programme.',
    category: 'WORKSHOP',
    layout: layout([...heading('CERTIFICATE', 'of Completion'), body('for successfully completing the workshop "{{eventName}}" conducted by {{organizingBody}} on {{eventDate}}.')]),
  },
  {
    key: 'technical-default',
    name: 'Technical Event Certificate',
    description: 'For hackathons, coding contests and technical fests.',
    category: 'TECHNICAL',
    layout: layout([...heading('CERTIFICATE', 'of Excellence'), body('for participating in the technical event {{eventName}} organized by {{organizingBody}} on {{eventDate}}. {{achievement}}')]),
  },
];
