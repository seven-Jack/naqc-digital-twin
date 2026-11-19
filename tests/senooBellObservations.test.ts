import { describe, expect, it } from 'vitest';
import {
  createSenooBellObservationTemplate, parseSenooBellObservations, summarizeSenooBellObservations,
} from '../src/physics/senooBellObservations';
import type { SenooCircuitBatch } from '../src/physics/senooCircuitBatch';
import { bellObservationFixture } from './helpers/senooBellFixture';

function parse(raw: unknown) {
  return parseSenooBellObservations(JSON.stringify(raw));
}

function updatePlusBatch(fixture: ReturnType<typeof bellObservationFixture>, fields: Partial<SenooCircuitBatch>) {
  const plus = { ...fixture.settings.plus, batch: { ...fixture.settings.plus.batch, ...fields } };
  return { ...fixture, settings: { ...fixture.settings, plus } };
}

describe('Senoo Bell observation bundles', () => {
  it('exports the three v1 settings and requires exact phase, basis, and ensemble references', () => {
    const template = createSenooBellObservationTemplate();
    expect(template.settings).toEqual({
      population: { analysisPhaseRad: null, batch: null },
      plus: { analysisPhaseRad: Math.PI / 4, batch: null },
      minus: { analysisPhaseRad: -Math.PI / 4, batch: null },
    });
    const fixture = bellObservationFixture();
    const wrongPhase = { ...fixture.settings.plus, analysisPhaseRad: 0 };
    expect(() => parse({ ...fixture, settings: { ...fixture.settings, plus: wrongPhase } })).toThrow(/analysisPhaseRad/);
    expect(() => parse(updatePlusBatch(fixture, { basis: 'XY' }))).toThrow(/双位点 XX/);
    expect(() => parse({ ...fixture, ensembleRef: ' ' })).toThrow(/ensembleRef/);
    expect(() => parse({ ...fixture, confidenceLevel: 1 })).toThrow(/联合置信水平/);
    expect(() => parse({ ...fixture, extra: true })).toThrow(/额外字段/);
  });

  it('requires matching pre-analysis conditions and ordered sites across settings', () => {
    const fixture = bellObservationFixture();
    expect(() => parse(updatePlusBatch(fixture, { workingPoint: 'different' }))).toThrow(/workingPoint/);
    expect(() => parse(updatePlusBatch(fixture, { circuitSelectionRuleRef: 'synthetic://different' })))
      .toThrow(/circuitSelectionRuleRef/);
    expect(() => parse(updatePlusBatch(fixture, { siteIds: [...fixture.settings.plus.batch.siteIds].reverse() })))
      .toThrow(/位点顺序/);
  });

  it('checks independent attempts and original frames, including interleaved settings within one run', () => {
    const fixture = bellObservationFixture();
    const population = fixture.settings.population.batch;
    const plus = fixture.settings.plus.batch;
    expect(() => parse(updatePlusBatch(fixture, { acquisitionRunId: population.acquisitionRunId }))).toThrow(/同一采集运行的尝试/);
    expect(() => parse(updatePlusBatch(fixture, {
      acquisitionRunId: population.acquisitionRunId,
      attempts: plus.attempts.map(attempt => ({ ...attempt, attemptId: `interleaved-plus-${attempt.attemptId}` })),
    }))).not.toThrow();
    const [attempt, ...rest] = plus.attempts;
    expect(() => parse(updatePlusBatch(fixture, { attempts: [{ ...attempt, sourceRef: population.attempts[0].sourceRef }, ...rest] })))
      .toThrow(/共用原始尝试记录/);
    const [site, ...remainingSites] = attempt.sites;
    const [first, second] = site.frames;
    const shared = { ...first, status: 'invalid' as const, sourceRef: population.attempts[0].sites[0].frames[0].sourceRef };
    const updatedAttempt = { ...attempt, sites: [{ ...site, frames: [shared, second] as const }, ...remainingSites] };
    expect(() => parse(updatePlusBatch(fixture, { attempts: [updatedAttempt, ...rest] }))).toThrow(/共用原始帧/);
  });

  it('rejects synthetic evidence labels for measured bundles and waits for applicable measured readout', () => {
    const fixture = bellObservationFixture();
    const measured = JSON.stringify(fixture).replaceAll('"sourceKind":"synthetic"', '"sourceKind":"measured"')
      .replaceAll('synthetic://', 'lab://');
    const observations = parseSenooBellObservations(measured);
    const analysis = summarizeSenooBellObservations(observations, null, null);
    expect(analysis.estimate).toBeNull();
    expect(analysis.settings.every(setting => setting.metric === null && setting.counts.selectedValidReadout === null)).toBe(true);
    expect(() => parse({ ...observations, phaseReferenceRef: 'literature://unrelated-reference' })).toThrow(/phaseReferenceRef/);
    const plus = { ...observations.settings.plus, batch: { ...observations.settings.plus.batch, sourceKind: 'synthetic' } };
    expect(() => parse({ ...observations, settings: { ...observations.settings, plus } })).toThrow(/sourceKind/);
  });
});

describe('Senoo Bell overlap', () => {
  it.each([
    ['target', 0.5, 1], ['mixture', 0, 0.5], ['opposite', -0.5, 0],
  ] as const)('uses the signed phase for the %s case with independent conditional denominators', (state, imaginary, overlap) => {
    const result = summarizeSenooBellObservations(parse(bellObservationFixture(state)), null, null);
    expect(result.sourceKind).toBe('synthetic');
    expect(result.estimate).toMatchObject({ population: 1, coherenceImag: imaginary, overlap });
    expect(result.settings.map(setting => setting.setting)).toEqual(['population', 'plus', 'minus']);
    expect(result.settings.map(setting => setting.metric?.denominator)).toEqual([4, 6, 8]);
    expect(result.settings.map(setting => setting.counts.attempted)).toEqual([6, 8, 10]);
    expect(result.settings.map(setting => setting.counts.validReadout)).toEqual([5, 7, 9]);
  });

  it('uses the three simultaneous Hoeffding bounds with signed projection', () => {
    const result = summarizeSenooBellObservations(parse(bellObservationFixture()), null, null);
    const [population, plus, minus] = result.settings.map(setting => setting.metric!);
    const log = Math.log(120);
    expect(population.lower).toBeCloseTo(1 - Math.sqrt(log / 8));
    expect(plus.upper).toBeCloseTo(-1 + 2 * Math.sqrt(log / 12));
    expect(minus.lower).toBeCloseTo(1 - 2 * Math.sqrt(log / 16));
    expect(result.estimate?.lower).toBeCloseTo(population.lower! / 2 + (minus.lower! - plus.upper!) / 4);
    expect(result.estimate?.upper).toBeCloseTo(1);
  });

  it('retains zero denominators and withholds the overlap until each setting can be judged', () => {
    const fixture = bellObservationFixture();
    const attempts = fixture.settings.plus.batch.attempts.map(attempt => ({
      ...attempt, selection: { ...attempt.selection, status: 'excluded' as const, reason: 'engineering fixture exclusion' },
    }));
    const result = summarizeSenooBellObservations(parse(updatePlusBatch(fixture, { attempts })), null, null);
    expect(result.settings[1].metric).toEqual({ numerator: 0, denominator: 0, value: null, lower: null, upper: null });
    expect(result.estimate).toBeNull();
  });

  it('retains a raw linear result when the three conditional samples disagree with a physical state', () => {
    const fixture = bellObservationFixture('opposite');
    const odd = bellObservationFixture().settings.plus.batch.attempts[0];
    const original = fixture.settings.population;
    const population = { ...original, batch: { ...original.batch, attempts: original.batch.attempts.map(attempt => ({
      ...attempt, sites: attempt.sites.map((site, index) => ({
        ...site, frames: site.frames.map((frame, frameIndex) => frame.status === 'valid'
          ? { ...frame, count: odd.sites[index].frames[frameIndex].count } : frame),
      })),
    })) } };
    const observations = parse({ ...fixture, settings: { ...fixture.settings, population } });
    const result = summarizeSenooBellObservations(observations, null, null);
    expect(result.estimate).toMatchObject({ population: 0, coherenceImag: -0.5, overlap: -0.5, lower: -0.5 });
  });
});
