'use strict';

const { parse } = require('csv-parse');
const XLSX = require('xlsx');
const AppError = require('../../utils/AppError');

function normalizeRecord(record, rowNumber) {
  const normalized = {};
  for (const [key, value] of Object.entries(record)) {
    const cleanKey = String(key).trim().toLowerCase().replace(/[\s-]+/g, '_');
    normalized[cleanKey] = typeof value === 'string' ? value.trim() : value;
  }

  return {
    rowNumber,
    studentName: normalized.student_name || normalized.name || normalized.student || normalized.recipient_name,
    studentId: normalized.student_id || normalized.id || normalized.roll_no || normalized.prn || null,
    achievement: normalized.achievement || normalized.rank || normalized.position || normalized.grade || null,
    certificateTitle: normalized.certificate_title || normalized.title || null,
    issueDate: normalized.issue_date || normalized.date || null,
    raw: record,
  };
}

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

        records.push(normalizeRecord(record, rowNumber));
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

async function parseRecipientXlsx(buffer, maxRows = 200) {
  if (!buffer || buffer.length === 0) throw AppError.badRequest('XLSX file is empty');

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', dense: true, cellDates: true });
  } catch (err) {
    throw AppError.badRequest(`XLSX parse error: ${err.message}`);
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw AppError.badRequest('XLSX contains no worksheets');

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    defval: '',
    raw: false,
  });
  if (rows.length < 2) throw AppError.badRequest('XLSX contains no data rows');
  if (rows.length - 1 > maxRows) throw AppError.badRequest(`XLSX row limit exceeded (max ${maxRows} rows)`);

  const headers = rows[0].map((header) => String(header).trim());
  if (headers.every((header) => header.length === 0)) throw AppError.badRequest('XLSX header row is empty');

  return rows
    .slice(1)
    .filter((row) => row.some((value) => String(value).trim().length > 0))
    .map((row, index) => {
      const record = Object.fromEntries(headers.map((header, column) => [header, row[column] ?? '']));
      return normalizeRecord(record, index + 2);
    });
}

async function parseRecipientFile(buffer, filename, maxRows = 200) {
  if (/\.xlsx$/i.test(filename || '')) return parseRecipientXlsx(buffer, maxRows);
  return parseRecipientCsv(buffer, maxRows);
}

module.exports = { parseRecipientCsv, parseRecipientXlsx, parseRecipientFile };
