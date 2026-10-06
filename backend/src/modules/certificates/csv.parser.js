'use strict';

const { parse } = require('csv-parse');
const AppError = require('../../utils/AppError');

/**
 * Parses a recipient CSV buffer.
 * Expected columns (case-insensitive, underscores or spaces allowed):
 * - student_name / name / student (required)
 * - student_id / id / roll_no (optional)
 * - achievement / rank / position (optional)
 * - certificate_title (optional)
 * - date / issue_date (optional, YYYY-MM-DD)
 */
async function parseRecipientCsv(buffer, maxRows = 200) {
  if (!buffer || buffer.length === 0) {
    throw AppError.badRequest('CSV file is empty');
  }

  return new Promise((resolve, reject) => {
    const records = [];
    let rowNumber = 1; // row 1 is header

    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true, // handle UTF-8 BOM
    });

    parser.on('readable', () => {
      let record;
      while ((record = parser.read()) !== null) {
        rowNumber++;
        if (records.length >= maxRows) {
          parser.destroy(AppError.badRequest(`CSV row limit exceeded (max ${maxRows} rows)`));
          return;
        }

        // Normalize keys
        const normalized = {};
        for (const [key, value] of Object.entries(record)) {
          const cleanKey = key.trim().toLowerCase().replace(/[\s-]+/g, '_');
          normalized[cleanKey] = typeof value === 'string' ? value.trim() : value;
        }

        const studentName = normalized.student_name || normalized.name || normalized.student || normalized.recipient_name;
        const studentId = normalized.student_id || normalized.id || normalized.roll_no || normalized.prn || null;
        const achievement = normalized.achievement || normalized.rank || normalized.position || normalized.grade || null;
        const certificateTitle = normalized.certificate_title || normalized.title || null;
        const issueDate = normalized.issue_date || normalized.date || null;

        records.push({
          rowNumber,
          studentName,
          studentId,
          achievement,
          certificateTitle,
          issueDate,
          raw: record,
        });
      }
    });

    parser.on('error', (err) => {
      reject(err instanceof AppError ? err : AppError.badRequest(`CSV parse error: ${err.message}`));
    });

    parser.on('end', () => {
      if (records.length === 0) {
        return reject(AppError.badRequest('CSV contains no data rows'));
      }
      resolve(records);
    });

    parser.write(buffer);
    parser.end();
  });
}

module.exports = { parseRecipientCsv };
