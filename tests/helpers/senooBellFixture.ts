import type { SenooCircuitAttempt, SenooCircuitBatch, SenooCircuitFrame, SenooCircuitSite, SenooCircuitStage } from '../../src/physics/senooCircuitBatch';
import { circuitFixture } from './senooCircuitFixture';

type BellFixtureState = 'target' | 'mixture' | 'opposite';
type BellSetting = 'population' | 'plus' | 'minus';
type PairBits = '00' | '01' | '10' | '11';

function renameSite(site: SenooCircuitSite, sourceRef: string): SenooCircuitSite {
  const [first, second] = site.frames;
  return {
    ...site,
    frames: [
      { ...first, sourceRef: first.sourceRef && `${sourceRef}/image-1` },
      { ...second, sourceRef: second.sourceRef && `${sourceRef}/image-2` },
    ],
  };
}

function renameAttempt(attempt: SenooCircuitAttempt, index: number, batchRef: string): SenooCircuitAttempt {
  const attemptId = `trial-${index + 1}`;
  const sourceRef = `${batchRef}/${attemptId}`;
  const { load, transport, gate, readout } = attempt.stages;
  return {
    ...attempt, attemptId, sourceRef,
    selection: { ...attempt.selection, sourceRef: `${sourceRef}/screening` },
    stages: {
      load: { ...load, sourceRef: load.sourceRef && `${sourceRef}/load` },
      transport: { ...transport, sourceRef: transport.sourceRef && `${sourceRef}/transport` },
      gate: { ...gate, sourceRef: gate.sourceRef && `${sourceRef}/gate` },
      readout: { ...readout, sourceRef: readout.sourceRef && `${sourceRef}/readout` },
    },
    sites: attempt.sites.map(site => renameSite(site, sourceRef)),
  };
}

function settingBits(state: BellFixtureState, setting: BellSetting): PairBits[] {
  if (setting === 'population') return ['00', '11', '00', '11'];
  const count = setting === 'plus' ? 6 : 8;
  const even: PairBits[] = ['00', '11'];
  const odd: PairBits[] = ['01', '10'];
  const patterns = state === 'mixture' ? ['00', '01', '10', '11'] as const
    : (state === 'target') === (setting === 'plus') ? odd : even;
  return Array.from({ length: count }, (_, index) => patterns[index % patterns.length]);
}

function settingBatch(base: SenooCircuitBatch, state: BellFixtureState, setting: BellSetting): SenooCircuitBatch {
  const sourceRef = `synthetic://bell-observations-test-only/${state}/${setting}`;
  const basis = setting === 'population' ? 'ZZ' : 'XX';
  const [zero, one, , missing] = base.attempts;
  const excluded = base.attempts[7];
  const chosen = settingBits(state, setting).map(bits => ({
    ...one,
    sites: base.siteIds.map((_, index) => (bits[index] === '0' ? zero : one).sites[index]),
  }));
  const attempts = [...chosen, missing, excluded].map((trial, index) => renameAttempt(trial, index, sourceRef));
  return {
    ...base,
    sourceRef,
    acquisitionRunId: `${sourceRef}/run`,
    batchId: `ENGINEERING-BELL-${state}-${setting}`,
    timeOriginRef: `${sourceRef}/t0`,
    circuitId: 'engineering-metastable-bell',
    circuitVersion: 'engineering-metastable-bell-v1',
    basis,
    targetBitstrings: setting === 'population' ? ['00', '11'] : [],
    expectedAttempts: attempts.length,
    attempts,
  };
}

export function bellObservationFixture(state: BellFixtureState = 'target') {
  const base = circuitFixture();
  return {
    kind: 'senoo-bell-observations' as const,
    schemaVersion: 1 as const,
    ensembleRef: 'synthetic://bell-observations-test-only/shared-ensemble',
    phaseReferenceRef: 'synthetic://bell-observations-test-only/standard-pauli-reference',
    independenceRef: 'synthetic://bell-observations-test-only/independent-settings',
    confidenceLevel: 0.95,
    settings: {
      population: { analysisPhaseRad: null, batch: settingBatch(base, state, 'population') },
      plus: { analysisPhaseRad: Math.PI / 4, batch: settingBatch(base, state, 'plus') },
      minus: { analysisPhaseRad: -Math.PI / 4, batch: settingBatch(base, state, 'minus') },
    },
  };
}

export function interleavedAttempt(attempt: SenooCircuitAttempt, attemptId: string, order: number): SenooCircuitAttempt {
  const shift = (value: number | null) => value === null ? null : value + order * 1e-3;
  const shiftStage = (stage: SenooCircuitStage) => ({ ...stage, startS: shift(stage.startS), endS: shift(stage.endS) });
  const shiftFrame = (frame: SenooCircuitFrame) => ({
    ...frame, triggerS: shift(frame.triggerS), startS: shift(frame.startS), endS: shift(frame.endS),
    countReadyS: shift(frame.countReadyS),
  });
  return {
    ...attempt, attemptId,
    stages: {
      load: shiftStage(attempt.stages.load),
      transport: shiftStage(attempt.stages.transport),
      gate: shiftStage(attempt.stages.gate),
      readout: shiftStage(attempt.stages.readout),
    },
    sites: attempt.sites.map(site => ({
      ...site, frames: [shiftFrame(site.frames[0]), shiftFrame(site.frames[1])],
    })),
  };
}
