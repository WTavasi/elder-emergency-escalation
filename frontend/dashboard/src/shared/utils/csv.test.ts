import { describe, expect, it } from 'vitest';
import { csvCell, stamp, toCsv } from './csv';

describe('csv', () => {
  it('quotes a cell with a comma, a quote or a line break', () => {
    expect(csvCell('Kilimani, Nairobi')).toBe('"Kilimani, Nairobi"');
    expect(csvCell('She said "help"')).toBe('"She said ""help"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('defuses a cell a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+254700000010')).toBe("'+254700000010");
    expect(csvCell('-5')).toBe("'-5");
  });

  it('leaves an empty cell for nothing', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(0)).toBe('0');
  });

  it('writes a header row and one line per row, for Excel', () => {
    const csv = toCsv(
      [{ name: 'Grace', tier: 1 }],
      [
        { header: 'Elder', value: (row) => row.name },
        { header: 'Tier', value: (row) => row.tier },
      ],
    );
    expect(csv).toBe('\uFEFFElder,Tier\r\nGrace,1\r\n');
  });

  it('stamps a file with the local date', () => {
    expect(stamp(new Date(2026, 9, 4))).toBe('2026-10-04');
  });
});
