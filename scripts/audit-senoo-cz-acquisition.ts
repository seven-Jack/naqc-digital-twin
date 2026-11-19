import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { associateSenooCzBenchmarkWaveform, parseSenooCzBenchmark } from '../src/physics/senooCzBenchmark';
import { summarizeSenooCzBenchmark } from '../src/physics/senooCzBenchmarkStatistics';
import { auditSenooCzBenchmarkPilotSchedule, parseSenooCzBenchmarkPilotSchedule } from '../src/physics/senooCzPilotBenchmark';
import { auditSenooCzResponsePilotSchedule, parseSenooCzResponsePilotSchedule } from '../src/physics/senooCzPilotResponse';
import { parseSenooCzResponse, SENOO_CZ_RESPONSE_INPUTS } from '../src/physics/senooCzResponse';
import { matchSenooCzResponseWaveform } from '../src/physics/senooCzResponseComparison';
import { assessSenooCzWaveform, parseSenooCzWaveform } from '../src/physics/senooCzWaveform';

function readInput<T>(filename: string, parse: (text: string) => T) {
  const path = resolve(filename);
  try {
    const bytes = readFileSync(path);
    const record = parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const identity = { path, sha256: createHash('sha256').update(bytes).digest('hex') };
    return { identity, record };
  } catch (error) {
    throw new Error(`${path}：${error instanceof Error ? error.message : String(error)}`);
  }
}

function audit(
  waveformFile: string, responseFile: string, benchmarkFile: string,
  { responseSchedulePath, benchmarkSchedulePath }: { responseSchedulePath?: string; benchmarkSchedulePath?: string },
) {
  const waveform = readInput(waveformFile, parseSenooCzWaveform);
  const response = readInput(responseFile, parseSenooCzResponse);
  const benchmark = readInput(benchmarkFile, parseSenooCzBenchmark);
  const pulse = waveform.record;
  const responseRecord = response.record;
  const benchmarkRecord = benchmark.record;
  const responseSchedule = responseSchedulePath === undefined ? null : readInput(responseSchedulePath, parseSenooCzResponsePilotSchedule);
  const benchmarkSchedule = benchmarkSchedulePath === undefined ? null : readInput(benchmarkSchedulePath, parseSenooCzBenchmarkPilotSchedule);
  const digest = waveform.identity.sha256;
  const scope = pulse.sourceKind;
  const issues: string[] = [];
  const reviews: string[] = [];
  const waveformAssessment = assessSenooCzWaveform(pulse);
  if (scope === 'measured' && !waveformAssessment.readyForModelInput) issues.push('实测波形的模型输入待补。');
  if (!scope || scope !== responseRecord.sourceKind || scope !== benchmarkRecord.sourceKind) {
    issues.push('三份文件的来源声明须一致，合成、控制设定和实测各自归档。');
  }
  if (pulse.evolutionConvention === null) reviews.push('核对波形的相位与失谐参考框架后登记 evolutionConvention。');
  try {
    matchSenooCzResponseWaveform(responseRecord, pulse, digest);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  const benchmarkBinding = associateSenooCzBenchmarkWaveform(benchmarkRecord, pulse, digest);
  if (benchmarkRecord.waveformSha256 !== digest) {
    issues.push('gRB 文件的 waveformSha256 与实际波形字节不一致。');
  } else if (benchmarkBinding.status !== 'associated') {
    issues.push(benchmarkBinding.message);
  }
  if (benchmarkBinding.status === 'associated' && benchmarkBinding.sameOrderedPairs === 0) {
    reviews.push('gRB 样本中无位点顺序与波形一致的原子对，需另证对应工况。');
  }
  if (!responseRecord.phase || responseRecord.phase.phaseReference !== pulse.phaseReference) {
    reviews.push('缺少与波形同参考的独立条件相位。');
  }
  const responseRefs = new Set(responseRecord.attempts.map(attempt => attempt.sourceRef));
  const sharedAttemptRefs = [...new Set(benchmarkRecord.attempts.map(attempt => attempt.sourceRef))]
    .filter(ref => responseRefs.has(ref));
  if (responseRecord.acquisitionRunId === benchmarkRecord.acquisitionRunId || sharedAttemptRefs.length) {
    reviews.push('门响应与 gRB 共用运行或原始引用。核对尝试分配和样本依赖后再使用各自的区间。');
  }

  const identity = (input: typeof waveform | typeof response | typeof benchmark) => ({
    ...input.identity, sourceRef: input.record.sourceRef, acquisitionRunId: input.record.acquisitionRunId,
  });
  const responseCounts = SENOO_CZ_RESPONSE_INPUTS.map(input => {
    const attempts = responseRecord.attempts.filter(attempt => attempt.input === input);
    const accepted = attempts.filter(attempt => attempt.prep === 'accepted').length;
    return { input, started: attempts.length, accepted, rejected: attempts.length - accepted };
  });
  const responsePilot = responseSchedule ? auditSenooCzResponsePilotSchedule(responseSchedule.record, responseRecord) : null;
  const benchmarkPilot = benchmarkSchedule ? auditSenooCzBenchmarkPilotSchedule(benchmarkSchedule.record, benchmarkRecord) : null;
  for (const [label, report] of [['门响应', responsePilot], ['gRB 与丢失', benchmarkPilot]] as const) {
    const totals = report?.totals;
    if (totals && totals.missing + totals.conflicting + totals.unplanned > 0) {
      issues.push(`${label}先导排程有 ${totals.missing} 个未登记计划轮、${totals.conflicting} 个冲突计划轮、${totals.unplanned} 条未关联实际记录。`);
    }
  }
  return {
    kind: 'senoo-cz-acquisition-audit', schemaVersion: 1, scope,
    status: issues.length ? 'mismatch' as const : 'linked' as const,
    inputs: {
      waveform: identity(waveform), response: identity(response), benchmark: identity(benchmark),
      ...(responseSchedule && { responseSchedule: responseSchedule.identity }),
      ...(benchmarkSchedule && { benchmarkSchedule: benchmarkSchedule.identity }),
    },
    apparatusVersion: pulse.apparatusVersion, gateVersion: pulse.gateVersion, workingPoint: pulse.workingPoint,
    siteIds: pulse.siteIds, waveformAssessment,
    response: { rows: responseCounts, phase: responseRecord.phase, readoutCalibrationRef: responseRecord.readoutCalibrationRef },
    benchmark: {
      binding: benchmarkBinding, readoutCalibrationRef: benchmarkRecord.readoutCalibrationRef,
      statistics: benchmarkPilot?.batchStatistics ?? summarizeSenooCzBenchmark(benchmarkRecord),
    },
    ...(responsePilot || benchmarkPilot ? { scheduleAudit: { response: responsePilot, benchmark: benchmarkPilot } } : {}),
    sharedAttemptRefs, issues, reviews,
  };
}

const usage = '用法 node audit-senoo-cz-acquisition.mjs 波形.json 独立门响应.json gRB.json [--response-schedule 门响应排程.csv] [--benchmark-schedule gRB排程.csv]';
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'response-schedule': { type: 'string' }, 'benchmark-schedule': { type: 'string' }, help: { type: 'boolean' } },
  });
  if (values.help) {
    process.stdout.write(`${usage}\n`);
  } else if (positionals.length !== 3) {
    console.error(usage);
    process.exitCode = 2;
  } else {
    const report = audit(positionals[0], positionals[1], positionals[2], {
      responseSchedulePath: values['response-schedule'], benchmarkSchedulePath: values['benchmark-schedule'],
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status === 'mismatch') process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
