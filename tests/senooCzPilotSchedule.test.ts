import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSenooCzBenchmarkTemplate, parseSenooCzBenchmark } from '../src/physics/senooCzBenchmark';
import { auditSenooCzBenchmarkPilotSchedule, parseSenooCzBenchmarkPilotSchedule } from '../src/physics/senooCzPilotBenchmark';
import { auditSenooCzResponsePilotSchedule, parseSenooCzResponsePilotSchedule } from '../src/physics/senooCzPilotResponse';
import { createSenooCzResponseTemplate, parseSenooCzResponse } from '../src/physics/senooCzResponse';

const responseFilename = 'Senoo_CZ_独立门响应先导排程.csv';
const benchmarkFilename = 'Senoo_CZ_gRB_丢失先导排程.csv';
const common = {
  sourceKind: 'synthetic', waveformSha256: 'ab'.repeat(32), apparatusVersion: 'synthetic-cz-v1',
  gateVersion: 'synthetic-cz-only', workingPoint: 'synthetic-cz-pilot', confidenceLevel: 0.95,
  readoutCalibrationRef: 'synthetic://cz-pilot/readout', independenceRef: 'synthetic://cz-pilot/analysis-blocks',
};
const siteIds = ['L0', 'R0'];

function readPlan(filename: string) {
  const template = readFileSync(new URL(`../references/templates/${filename}`, import.meta.url), 'utf8');
  const [header, ...lines] = template.trimEnd().split(/\r?\n/);
  return { header, rows: lines.map(line => line.split(',')) };
}

function toCsv(header: string, rows: readonly string[][]) {
  const csvCell = (value: string) => /[,"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return `\uFEFF${[header, ...rows.map(row => row.map(csvCell).join(','))].join('\r\n')}\r\n`;
}

function responseFixture() {
  const { header, rows } = readPlan(responseFilename);
  const acquisitionRunId = 'SYNTHETIC-RESPONSE-PILOT';
  const sourceRef = 'synthetic://cz-response-pilot';
  const attempts = rows.map((row, index) => {
    const [plannedId, block, , input] = row;
    const prep = block === '1' ? 'rejected' : 'accepted';
    const outcome = prep === 'rejected' ? null : block === '2' ? 'ambiguous' : block === '3' ? 'unavailable'
      : block === '4' ? 'first-site-loss' : 'returned';
    const attemptId = `trial-${plannedId}`;
    const log = index === 0 ? `${sourceRef}/同日,归档/"帧".json` : `${sourceRef}/${attemptId}`;
    row.splice(4, 6, acquisitionRunId, attemptId, input, prep, outcome ?? '', log);
    return { attemptId, input, prep, outcome, sourceRef: log };
  });
  const data = {
    ...createSenooCzResponseTemplate(), ...common, sourceRef, acquisitionRunId, siteIds, clockId: 'synthetic-clock',
    timeOriginRef: `${sourceRef}/trigger`, screeningRef: `${sourceRef}/prep`, observationProtocolRef: `${sourceRef}/protocol`,
    attempts, expectedAttempts: attempts.length,
  };
  return {
    rows, data,
    review: () => auditSenooCzResponsePilotSchedule(
      parseSenooCzResponsePilotSchedule(toCsv(header, rows)), parseSenooCzResponse(JSON.stringify(data)),
    ),
  };
}

function benchmarkFixture() {
  const { header, rows } = readPlan(benchmarkFilename);
  const acquisitionRunId = 'SYNTHETIC-GRB-PILOT';
  const sourceRef = 'synthetic://cz-grb-pilot';
  const sequences = rows.map(([plannedId, , , depth], index) => ({
    sequenceId: `seq-${plannedId}`, seed: String(index + 1).padStart(6, '0'), depth: Number(depth), target: '00',
    sourceRef: `${sourceRef}/compiled/${plannedId}`,
  }));
  const attempts = rows.map((row, index) => {
    const [plannedId, block] = row;
    const attemptId = `shot-${plannedId}`;
    const pairId = 'pair-LR';
    const blockId = `shared-device-block-${block}`;
    const { sequenceId, seed, target } = sequences[index];
    const log = `${sourceRef}/${attemptId}/${pairId}`;
    row.splice(4, 8, sequenceId, seed, target, acquisitionRunId, attemptId, pairId, blockId, log);
    return {
      attemptId, pairId, blockId, siteIds, sequenceId, sourceRef: log, survivalRef: `${log}/survival`,
      masks: { prep: block !== '4', decay: block === '1' || block === '3', loss: block === '1' || block === '4' },
      bitstring: block === '2' || block === '3' ? null : target,
      survival: block === '2' ? ['lost', 'unknown'] : block === '3' ? ['lost', 'lost'] : ['present', 'present'],
    };
  });
  const data = {
    ...createSenooCzBenchmarkTemplate(), ...common, sourceRef, acquisitionRunId, expectedAttempts: attempts.length, mode: 'non-echo',
    protocolRef: `${sourceRef}/protocol`, maskRef: `${sourceRef}/masks`, survivalProtocolRef: `${sourceRef}/survival`,
    sequences, attempts,
  };
  return {
    rows, data,
    review: () => auditSenooCzBenchmarkPilotSchedule(
      parseSenooCzBenchmarkPilotSchedule(toCsv(header, rows)), parseSenooCzBenchmark(JSON.stringify(data)),
    ),
  };
}

describe('CZ response pilot reconciliation', () => {
  it('reconciles all 48 responses and preserves their exact textual IDs and outcome denominators', () => {
    const { review, data } = responseFixture();
    const result = review();
    expect(result.totals).toEqual({ planned: 48, mapped: 48, matched: 48, missing: 0, conflicting: 0, recorded: 48, unplanned: 0 });
    expect(result.rows[0]).toMatchObject({
      plan: { plannedId: 'CZR-001' }, status: 'matched', issues: [],
      record: { input: '00', prep: 'rejected', outcome: null, sourceRef: data.attempts[0].sourceRef },
    });
    const counts = { started: 12, accepted: 11, rejected: 1, unresolvedTerminal: 2, physicalLoss: 1, comparisonUnresolved: 3 };
    expect(result.groups).toMatchObject(['00', '01', '10', '11'].map(input => ({
      input, planned: 12, matched: counts, fullBatch: counts,
    })));
  });

  it('requires the issued planned slots and keeps the two-bit preparation as text', () => {
    const { header, rows } = readPlan(responseFilename);
    expect(parseSenooCzResponsePilotSchedule(toCsv(header, rows))).toHaveLength(48);
    const lostId = rows[7][0];
    expect(() => parseSenooCzResponsePilotSchedule(toCsv(header, rows.filter(row => row[0] !== lostId)))).toThrow();
    rows[0][3] = '0';
    expect(() => parseSenooCzResponsePilotSchedule(toCsv(header, rows))).toThrow(/CZR-001/);
  });

  it('reports blank mappings, missing JSON records and unplanned recorded activities separately', () => {
    const { review, rows, data } = responseFixture();
    const unplanned = data.attempts[0];
    rows[0].fill('', 4);
    data.attempts.splice(1, 1);
    data.expectedAttempts = data.attempts.length;
    const result = review();
    expect(result.totals).toMatchObject({ matched: 46, missing: 1, conflicting: 1, recorded: 47, unplanned: 1 });
    expect(result.rows[0]).toMatchObject({ plan: { plannedId: 'CZR-001' }, status: 'missing', record: null });
    expect(result.rows[1]).toMatchObject({ plan: { plannedId: 'CZR-002' }, status: 'conflict', record: null });
    expect(result.unplanned).toMatchObject([{ identity: { attemptId: unplanned.attemptId, runId: data.acquisitionRunId }, record: unplanned }]);
  });

  it('excludes both competing plans for a duplicated physical attempt without losing the actual source', () => {
    const { review, rows, data } = responseFixture();
    rows[1].splice(4, 6, ...rows[0].slice(4));
    const result = review();
    expect(result.totals).toMatchObject({ matched: 46, conflicting: 2, unplanned: 1 });
    for (const index of [0, 1]) {
      expect(result.rows[index]).toMatchObject({ status: 'conflict', record: { attemptId: data.attempts[0].attemptId } });
      expect(result.rows[index].issues.some(({ code }) => code.includes('duplicate'))).toBe(true);
    }
    expect(result.unplanned[0].record.attemptId).toBe(data.attempts[1].attemptId);
  });

  it('distinguishes an executed input mismatch from disagreement in the transcribed screening, outcome and source', () => {
    const { review, rows, data } = responseFixture();
    data.attempts[0].input = '11';
    rows[0][6] = '11';
    rows[0][7] = 'accepted';
    rows[0][8] = 'returned';
    rows[0][9] = 'synthetic://different-source';
    const result = review();
    const issue = result.rows[0];
    expect(issue).toMatchObject({ plan: { plannedId: 'CZR-001' }, status: 'conflict', record: { input: '11', prep: 'rejected' } });
    expect(issue.issues.map(({ field }) => field)).toEqual(expect.arrayContaining([
      'planned_input', 'actual_prep', 'actual_outcome', 'actual_log_ref',
    ]));
    expect(result.groups.find(group => group.input === '11')).toMatchObject({
      fullBatch: { started: 13 }, matched: { started: 12 },
    });
  });
});

describe('CZ gRB pilot reconciliation', () => {
  it('retains compiled leading zeros and recomputes all mask and loss denominators for the 24 matched rounds', () => {
    const { review } = benchmarkFixture();
    const result = review();
    expect(result.totals).toEqual({ planned: 24, mapped: 24, matched: 24, missing: 0, conflicting: 0, recorded: 24, unplanned: 0 });
    expect(result.rows[0]).toMatchObject({
      plan: { plannedId: 'CZB-001', seed: '000001', targetBitstring: '00' }, status: 'matched',
      sequence: { seed: '000001', target: '00' }, record: { pairId: 'pair-LR', siteIds },
    });
    expect(result.batchStatistics).toEqual(result.matchedStatistics);
    const rates = {
      prep: { hits: 1, denominator: 3 }, decay: { hits: 1, denominator: 2 }, loss: { hits: 2, denominator: 2 },
      siteLoss: { hits: 3, denominator: 6, unresolved: 1 }, pairLoss: { hits: 1, denominator: 3, unresolved: 1 },
    };
    expect(result.matchedStatistics.rows).toMatchObject([0, 4, 8, 12, 16, 20].map(depth => ({ depth, started: 4, rates })));
  });

  it('reports conflicting compiled parameters and keeps full-batch statistics separate from the exact-match cohort', () => {
    const { review, rows, data } = benchmarkFixture();
    data.sequences[0].depth = 4;
    rows[0][4] = data.sequences[1].sequenceId;
    rows[0][5] = '1';
    rows[0][6] = '11';
    rows[0][10] = 'wrong-analysis-block';
    rows[0][11] = 'synthetic://different-source';
    const result = review();
    expect(result.totals).toMatchObject({ matched: 23, conflicting: 1, unplanned: 0 });
    const audit = result.rows[0];
    expect(audit).toMatchObject({ plan: { plannedId: 'CZB-001' }, status: 'conflict', sequence: { depth: 4 } });
    expect(audit.issues.map(({ field }) => field)).toEqual(expect.arrayContaining([
      'planned_depth', 'sequence_id', 'seed', 'target_bitstring', 'actual_analysis_block_id', 'actual_log_ref',
    ]));
    expect(result.batchStatistics.rows.find(row => row.depth === 4)).toMatchObject({
      started: 5, rates: { prep: { denominator: 4 }, siteLoss: { denominator: 8 } },
    });
    expect(result.matchedStatistics.rows.find(row => row.depth === 4)).toMatchObject({
      started: 4, rates: { prep: { denominator: 3 }, siteLoss: { denominator: 6 } },
    });
  });

  it('keeps a second atom pair in the same physical attempt separately identifiable as an unplanned record', () => {
    const { review, data } = benchmarkFixture();
    const first = data.attempts[0];
    const pairId = 'pair-unplanned';
    data.attempts.push({ ...first, pairId, siteIds: ['L1', 'R1'], sourceRef: `${first.sourceRef}/other-pair` });
    data.expectedAttempts = data.attempts.length;
    const result = review();
    expect(result.totals).toMatchObject({ matched: 24, conflicting: 0, unplanned: 1, recorded: 25 });
    expect(result.unplanned).toMatchObject([{ identity: { attemptId: first.attemptId, pairId } }]);
    expect(result.batchStatistics.rows[0].rates.siteLoss.denominator).toBe(8);
    expect(result.matchedStatistics.rows[0].rates.siteLoss.denominator).toBe(6);
  });
});
