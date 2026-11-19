import { readAcquisitionCsvCells } from './acquisitionCsv';

export interface CzPilotPlanRow {
  readonly plannedId: string;
  readonly plannedBlock: number;
  readonly slotInBlock: number;
  readonly plannedValue: string;
  readonly fields: readonly string[];
}

export interface CzPilotMapping {
  readonly runId: string;
  readonly attemptId: string;
  readonly pairId?: string;
  readonly sourceRef: string;
}

export interface CzPilotDifference {
  readonly code: string;
  readonly field?: string;
  readonly expected?: string | number | null;
  readonly observed?: string | number | null;
  readonly detail?: string;
}

export function parseCzPilotRows(
  text: string, header: readonly string[], layout: readonly (readonly string[])[], prefix: string,
): CzPilotPlanRow[] {
  const [first, ...lines] = text.replace(/^\uFEFF/, '').trimEnd().split(/\r\n|\n|\r/);
  const columns = readAcquisitionCsvCells(first, `${prefix} 排程表头`);
  if (columns.length !== header.length || header.some((column, index) => columns[index] !== column)) {
    throw new Error(`${prefix} 先导排程 CSV 表头与已发模板不一致。`);
  }
  const rows: CzPilotPlanRow[] = [];
  for (const [block, settings] of layout.entries()) {
    for (const [slot, plannedValue] of settings.entries()) {
      const index = rows.length;
      const plannedId = `${prefix}-${String(index + 1).padStart(3, '0')}`;
      const line = lines[index];
      if (line === undefined) throw new Error(`${prefix} 排程缺少计划轮 ${plannedId}。`);
      const cells = readAcquisitionCsvCells(line, plannedId);
      const [id, blockText, slotText, value, ...fields] = cells;
      const plannedBlock = block + 1;
      const slotInBlock = slot + 1;
      if (cells.length !== header.length || id !== plannedId || blockText !== String(plannedBlock)
        || slotText !== String(slotInBlock) || value !== plannedValue) {
        throw new Error(`${prefix} 排程第 ${index + 2} 行的计划轮号、区块、组别或列数与 ${plannedId} 不符。`);
      }
      rows.push({ plannedId, plannedBlock, slotInBlock, plannedValue, fields: fields.map(field => field.trim()) });
    }
  }
  if (lines.length > rows.length) throw new Error(`${prefix} 排程第 ${rows.length + 2} 行为计划外记录。`);
  return rows;
}

function mappingKey({ runId, attemptId, pairId }: CzPilotMapping) {
  return runId && attemptId && pairId !== '' ? JSON.stringify([runId, attemptId, pairId ?? null]) : null;
}

type AuditPlan = Pick<CzPilotPlanRow, 'plannedId'> & { readonly actual: CzPilotMapping | null };
type RowStatus = 'matched' | 'missing' | 'conflict';

export function auditCzPilotRows<P extends AuditPlan, R>(
  plans: readonly P[],
  records: readonly R[],
  { runId, identify, compare }: {
    runId: string;
    identify: (record: R) => Omit<CzPilotMapping, 'runId'>;
    compare: (plan: P, record: R) => readonly CzPilotDifference[];
  },
) {
  const indexed = new Map(records.map(record => {
    const identity = { runId, ...identify(record) };
    return [mappingKey(identity), { identity, record }] as const;
  }));
  const owners = new Map<string, string[]>();
  for (const { plannedId, actual } of plans) {
    const key = actual && mappingKey(actual);
    if (!key) continue;
    const plannedIds = owners.get(key) ?? [];
    plannedIds.push(plannedId);
    owners.set(key, plannedIds);
  }
  const referenced = new Set<string>();
  const rows = plans.map(plan => {
    const issues: CzPilotDifference[] = [];
    const { actual } = plan;
    let record: R | null = null;
    const key = actual && mappingKey(actual);
    if (!actual) {
      issues.push({ code: 'missing-mapping', detail: '计划轮缺少实际轮次登记。' });
    } else if (!key) {
      issues.push({ code: 'incomplete-mapping', detail: '实际运行、轮号或原子对 ID 的映射不完整。' });
    } else {
      const plannedIds = owners.get(key)!;
      if (plannedIds.length > 1) {
        issues.push({ code: 'duplicate-mapping', detail: `同一实际记录关联多个计划轮 ${plannedIds.join('、')}。` });
      }
      if (actual.runId !== runId) {
        issues.push({ code: 'run-mismatch', field: 'actual_run_id', expected: runId, observed: actual.runId });
      } else {
        const found = indexed.get(key);
        if (!found) {
          issues.push({ code: 'missing-record', detail: '实际轮次或原子对在批次 JSON 中无对应记录。' });
        } else {
          referenced.add(key);
          record = found.record;
          if (actual.sourceRef !== found.identity.sourceRef) {
            issues.push({
              code: 'source-mismatch', field: 'actual_log_ref', expected: found.identity.sourceRef, observed: actual.sourceRef || null,
            });
          }
          issues.push(...compare(plan, found.record));
        }
      }
    }
    const status: RowStatus = !actual ? 'missing' : issues.length ? 'conflict' : 'matched';
    return { plan, record, status, issues };
  });
  const unplanned = [...indexed].filter(([key]) => key === null || !referenced.has(key)).map(([, entry]) => entry);
  return {
    rows, unplanned,
    totals: {
      planned: plans.length, mapped: plans.filter(row => row.actual !== null).length, recorded: records.length,
      matched: rows.filter(row => row.status === 'matched').length, missing: rows.filter(row => row.status === 'missing').length,
      conflicting: rows.filter(row => row.status === 'conflict').length, unplanned: unplanned.length,
    },
  };
}
