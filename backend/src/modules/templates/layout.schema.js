'use strict';

const { z } = require('zod');

/**
 * Layout = where dynamic data is overlaid on a Canva-exported background.
 * All coordinates are FRACTIONS of the page (0..1) measured from the top-left,
 * so the same layout works regardless of the export resolution.
 *   x, y   -> top-left corner of the text box
 *   width  -> width of the text box (text is aligned inside it)
 *   fontSize is in PDF points (1/72 inch) for an A4-width page.
 */

const STANDARD_FONTS = [
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
];

// Built-in fonts, or a .ttf/.otf file name placed in backend/assets/fonts/
const fontName = z.union([
  z.enum(STANDARD_FONTS),
  z.string().regex(/^[A-Za-z0-9_\-]+\.(ttf|otf)$/, 'Custom fonts must be a .ttf/.otf file name in assets/fonts'),
]);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be #RRGGBB');
const frac = z.number().min(0).max(1);

const textField = z.object({
  x: frac,
  y: frac,
  width: frac.refine((v) => v > 0, 'width must be > 0'),
  fontSize: z.number().min(4).max(120),
  minFontSize: z.number().min(4).max(120).optional(),
  font: fontName.default('Helvetica'),
  color: hexColor.default('#111111'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  maxLines: z.number().int().min(1).max(4).default(1),
  uppercase: z.boolean().default(false),
  characterSpacing: z.number().min(0).max(10).default(0),
  prefix: z.string().max(80).default(''),
  suffix: z.string().max(80).default(''),
});

/** Free text with {{placeholders}}, e.g. "for participating in {{eventName}}". */
const customText = textField.extend({ text: z.string().min(1).max(500) });

const FIELD_NAMES = [
  'studentName', 'studentId', 'eventName', 'eventDate', 'issueDate', 'achievement',
  'certificateTitle', 'organizingBody', 'institutionName', 'issuerName',
  'signatoryName', 'signatoryTitle', 'venue', 'certificateId', 'verificationUrl',
];

const layoutSchema = z
  .object({
    fields: z.object(Object.fromEntries(FIELD_NAMES.map((f) => [f, textField.optional()]))).strict(),
    customTexts: z.array(customText).max(10).default([]),
    qrCode: z.object({
      x: frac,
      y: frac,
      size: frac.refine((v) => v >= 0.04 && v <= 0.5, 'size must be between 0.04 and 0.5 of page width'),
      dark: hexColor.default('#000000'),
      light: hexColor.default('#FFFFFF'),
    }),
    dateFormat: z.enum(['DD MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MMMM D, YYYY']).default('DD MMM YYYY'),
  })
  .strict()
  .refine((l) => l.fields.studentName, { message: 'layout.fields.studentName is required', path: ['fields', 'studentName'] })
  .refine((l) => l.fields.certificateId, { message: 'layout.fields.certificateId is required (the ID links the PDF to the blockchain record)', path: ['fields', 'certificateId'] });

module.exports = { layoutSchema, FIELD_NAMES, STANDARD_FONTS };
