const XLSX = require('xlsx');
const { parseRecipientCsv, parseRecipientXlsx } = require('../../src/modules/certificates/csv.parser');

describe('Participant spreadsheet parsing', () => {
  it('parses CSV aliases into the issuance shape', async () => {
    const records = await parseRecipientCsv(
      Buffer.from('name,roll no,position\nShravanya Andhale,CS-001,Winner\n'),
    );

    expect(records).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        studentName: 'Shravanya Andhale',
        studentId: 'CS-001',
        achievement: 'Winner',
      }),
    ]);
  });

  it('parses the first XLSX worksheet using the same normalized shape', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['student_name', 'student_id', 'certificate_title'],
      ['Arnav Chaudhary', 'CS-002', 'Participation'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const records = await parseRecipientXlsx(buffer);

    expect(records).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        studentName: 'Arnav Chaudhary',
        studentId: 'CS-002',
        certificateTitle: 'Participation',
      }),
    ]);
  });

  it('rejects an XLSX workbook without data rows', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['student_name']]), 'Participants');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    await expect(parseRecipientXlsx(buffer)).rejects.toThrow('XLSX contains no data rows');
  });
});
