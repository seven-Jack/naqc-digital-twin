import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import type { validateSenooMeasurements } from '../../src/physics/senooMeasurements';

type Sheets = Parameters<typeof validateSenooMeasurements>[0];

const fixture = unzipSync(readFileSync(new URL('../fixtures/senoo-readout-synthetic.xlsx', import.meta.url)));

// The fixture uses literal strings and numbers in columns A–S. The browser
// import scenario separately exercises the general workbook decoder.
function fixtureRows(part: number) {
  const xml = new TextDecoder().decode(fixture[`xl/worksheets/sheet${part}.xml`]);
  return [...xml.matchAll(/<x:row r="\d+">([\s\S]*?)<\/x:row>/g)].map(([, body]) => {
    const row: unknown[] = [];
    for (const [, letter, kind, value] of body.matchAll(/<x:c r="([A-S])\d+"[^>]* t="(str|n)"><x:v>([^<]*)<\/x:v><\/x:c>/g)) {
      row[letter.charCodeAt(0) - 'A'.charCodeAt(0)] = kind === 'n' ? Number(value) : value;
    }
    return row;
  });
}

export function freshSheets(): Sheets {
  return {
    '批次配置': fixtureRows(2),
    '尝试与位点': fixtureRows(3),
    '曝光记录': fixtureRows(4),
    '事件时标': fixtureRows(5),
  };
}

export function setCell(sheets: Sheets, sheet: keyof Sheets, row: number, field: string, value: unknown) {
  const column = sheets[sheet][0].indexOf(field);
  if (column < 0 || !sheets[sheet][row - 1]) throw new Error(`Unknown fixture cell ${sheet}!${field} row ${row}`);
  sheets[sheet][row - 1][column] = value;
}
