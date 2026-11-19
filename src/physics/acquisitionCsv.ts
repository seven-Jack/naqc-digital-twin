/** Read one CSV record with quoted commas and escaped quotes. Schedule fields occupy one line. */
export function readAcquisitionCsvCells(line: string, path: string) {
  const pattern = /"((?:[^"]|"")*)"|([^,"]*)/y;
  const cells: string[] = [];
  for (let start = 0; start <= line.length; start = pattern.lastIndex + 1) {
    pattern.lastIndex = start;
    const field = pattern.exec(line);
    if (!field || (pattern.lastIndex < line.length && line[pattern.lastIndex] !== ',')) {
      throw new Error(`${path} 的 CSV 引号或分隔符无效。`);
    }
    cells.push(field[1] === undefined ? field[2] : field[1].replaceAll('""', '"'));
    if (pattern.lastIndex === line.length) return cells;
  }
  return cells;
}
