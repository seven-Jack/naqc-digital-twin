import { unzipSync, type Unzipped } from 'fflate';

export const SENOO_DATA_SHEETS = ['批次配置', '尝试与位点', '曝光记录', '事件时标'] as const;
export type SenooDataSheet = typeof SENOO_DATA_SHEETS[number];
const calPilotScheduleSheet = 'CAL 先导排程';

const workbookPart = 'xl/workbook.xml';
const workbookRelsPart = 'xl/_rels/workbook.xml.rels';
const packageRelsNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
const namespaces = [
  {
    spreadsheet: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    relations: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  },
  {
    spreadsheet: 'http://purl.oclc.org/ooxml/spreadsheetml/main',
    relations: 'http://purl.oclc.org/ooxml/officeDocument/relationships',
  },
];
const mib = 1024 * 1024;
const maxWorkbookBytes = 24 * mib;
const maxPartBytes = 64 * mib;
const maxExcelRow = 1048576;
const maxExcelColumn = 16384;
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;

function extractParts(bytes: Uint8Array, names: readonly string[], limit: number): Unzipped {
  const requested = new Set(names);
  const seen = new Set<string>();
  let expandedBytes = 0;
  let failure: string | undefined;
  try {
    return unzipSync(bytes, {
      filter({ name, originalSize }) {
        if (!requested.has(name)) return false;
        if (seen.has(name)) {
          failure = `工作簿包含重复文件 ${name}。`;
          throw new Error(failure);
        }
        seen.add(name);
        expandedBytes += originalSize;
        if (expandedBytes > limit) {
          failure = '工作簿内容解压后过大。请按批次拆分工作簿后导入。';
          throw new Error(failure);
        }
        return true;
      },
    });
  } catch {
    throw new Error(failure ?? '无法读取工作簿。请使用有效且未加密的 .xlsx 文件。');
  }
}

function parsePart(parts: Unzipped, name: string, rootName: string, namespace?: string) {
  if (!Object.hasOwn(parts, name)) throw new Error(`工作簿缺少内部文件 ${name}。`);
  const part = parts[name];
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(part);
  if (/<!DOCTYPE/i.test(xml)) throw new Error(`工作簿内部文件 ${name} 包含不支持的 XML 声明。`);
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  if (document.getElementsByTagName('parsererror').length
    || root.localName !== rootName || (namespace && root.namespaceURI !== namespace)) {
    throw new Error(`工作簿内部文件 ${name} 无效。`);
  }
  return root;
}

function resolvePart(target: string) {
  // Resolve a relationship inside the archive only. Nothing here issues a network request.
  const base = new URL(workbookPart, 'https://workbook.invalid/');
  const resolved = new URL(target, base);
  if (!target || resolved.origin !== base.origin || resolved.search || resolved.hash) {
    throw new Error('工作簿引用了无效的内部文件。');
  }
  const path = decodeURI(resolved.pathname.slice(1));
  if (!path.endsWith('.xml')) throw new Error('工作簿引用了无效的 XML 文件。');
  return path;
}

function children(element: Element, localName: string) {
  return Array.from(element.children).filter(child =>
    child.localName === localName && child.namespaceURI === element.namespaceURI);
}

function richText(element: Element) {
  return Array.from(element.children).map(child => {
    if (child.namespaceURI !== element.namespaceURI) return '';
    if (child.localName === 't') return child.textContent ?? '';
    if (child.localName === 'r') return children(child, 't').map(t => t.textContent ?? '').join('');
    return '';
  }).join('');
}

function readCell(element: Element, strings: readonly string[], location: string): unknown {
  if (children(element, 'f').length) {
    throw new Error(`${location} 含有公式。请在导入副本中粘贴为值。`);
  }
  const kind = element.getAttribute('t') ?? 'n';
  if (kind === 'inlineStr') {
    const inline = children(element, 'is')[0];
    return inline ? richText(inline) : null;
  }
  const value = children(element, 'v')[0]?.textContent;
  if (value === null || value === undefined || value === '') return null;
  switch (kind) {
    case 's': {
      const index = Number(value);
      if (/^\d+$/.test(value) && Number.isSafeInteger(index) && index < strings.length) return strings[index];
      break;
    }
    case 'n':
      if (decimal.test(value) && Number.isFinite(Number(value))) return Number(value);
      break;
    case 'b':
      if (value === '0' || value === '1') return value === '1';
      break;
    case 'str':
    case 'd':
      return value;
    case 'e':
      throw new Error(`${location} 含有 Excel 错误值 ${value}。`);
  }
  throw new Error(`${location} 的单元格值无法读取。`);
}

function columnIndex(cellReference: string, rowNumber: number, sheet: string): number {
  const address = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(cellReference);
  if (address && Number(address[2]) === rowNumber) {
    const columnNumber = Array.from(address[1]).reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
    if (columnNumber <= maxExcelColumn) return columnNumber - 1;
  }
  throw new Error(`${sheet} 的单元格地址 ${cellReference} 无效。`);
}

function readSheet(root: Element, sheet: string, strings: readonly string[]) {
  const data = children(root, 'sheetData')[0];
  if (!data) throw new Error(`工作表「${sheet}」缺少单元格数据。`);
  const rows: unknown[][] = [];
  let previousRow = 0;
  for (const node of children(data, 'row')) {
    const rowNumber = node.hasAttribute('r') ? Number(node.getAttribute('r')) : previousRow + 1;
    if (!Number.isInteger(rowNumber) || rowNumber <= previousRow || rowNumber > maxExcelRow) {
      throw new Error(`工作表「${sheet}」包含无效或重复的行号。`);
    }
    previousRow = rowNumber;
    const row: unknown[] = [];
    let previousColumn = -1;
    for (const cell of node.children) {
      if (cell.localName !== 'c' || cell.namespaceURI !== node.namespaceURI) continue;
      const reference = cell.getAttribute('r');
      const column = reference ? columnIndex(reference, rowNumber, sheet) : previousColumn + 1;
      if (column <= previousColumn || column >= maxExcelColumn) {
        throw new Error(`工作表「${sheet}」第 ${rowNumber} 行的列地址重复或无效。`);
      }
      previousColumn = column;
      if (!cell.firstElementChild) continue;
      const location = `工作表「${sheet}」${reference ?? `第 ${rowNumber} 行第 ${column + 1} 列`}`;
      const value = readCell(cell, strings, location);
      if (value !== null) row[column] = value;
    }
    if (row.length) rows[rowNumber - 1] = Array.from(row, value => value ?? null);
  }
  // Keep worksheet row numbers through blank separators, skipping styled-only trailing rows.
  const empty: unknown[] = [];
  return Array.from(rows, row => row ?? empty);
}

async function readWorkbookSheets<SheetName extends string>(file: Blob, sheetNames: readonly SheetName[]) {
  if (file.size === 0 || file.size > maxWorkbookBytes) {
    throw new Error('请选择非空的 .xlsx 工作簿，文件上限为 24 MiB。较大的工作簿可按批次拆分。');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = extractParts(bytes, [workbookPart, workbookRelsPart], mib);
  const workbook = parsePart(metadata, workbookPart, 'workbook');
  const dialect = namespaces.find(namespace => namespace.spreadsheet === workbook.namespaceURI);
  if (!dialect) throw new Error('工作簿格式无法识别。');
  const relations = parsePart(metadata, workbookRelsPart, 'Relationships', packageRelsNs);
  const internal = children(relations, 'Relationship').filter(node => node.getAttribute('TargetMode') !== 'External');
  const sheetList = children(workbook, 'sheets')[0];
  const workbookSheets = sheetList ? children(sheetList, 'sheet') : [];
  const partsBySheet = sheetNames.map(sheet => {
    const entries = workbookSheets.filter(node => node.getAttribute('name') === sheet);
    if (entries.length !== 1) throw new Error(`工作簿需包含唯一的「${sheet}」工作表。`);
    const id = entries[0].getAttributeNS(dialect.relations, 'id');
    const relation = internal.find(node => id && node.getAttribute('Id') === id
      && node.getAttribute('Type') === `${dialect.relations}/worksheet`);
    if (!relation) throw new Error(`工作表「${sheet}」缺少内部数据引用。`);
    return resolvePart(relation.getAttribute('Target') ?? '');
  });
  const shared = internal.find(node => node.getAttribute('Type') === `${dialect.relations}/sharedStrings`);
  const sharedPart = shared ? resolvePart(shared.getAttribute('Target') ?? '') : null;
  const parts = extractParts(bytes, sharedPart ? [...partsBySheet, sharedPart] : partsBySheet, maxPartBytes);
  const strings = sharedPart ? children(parsePart(parts, sharedPart, 'sst', dialect.spreadsheet), 'si').map(richText) : [];
  const result = {} as Record<SheetName, unknown[][]>;
  sheetNames.forEach((sheet, i) => {
    result[sheet] = readSheet(parsePart(parts, partsBySheet[i], 'worksheet', dialect.spreadsheet), sheet, strings);
  });
  const digest = await globalThis.crypto?.subtle?.digest('SHA-256', bytes);
  const sha256 = digest ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') : null;
  return { sheets: result, sha256 };
}

export function readSenooMeasurementWorkbook(file: Blob) {
  return readWorkbookSheets(file, SENOO_DATA_SHEETS);
}

export async function readSenooCalPilotScheduleWorkbook(file: Blob) {
  const { sheets, sha256 } = await readWorkbookSheets(file, [calPilotScheduleSheet]);
  return { rows: sheets[calPilotScheduleSheet], sha256 };
}
