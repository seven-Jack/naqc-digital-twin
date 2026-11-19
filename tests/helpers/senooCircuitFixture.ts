import type { SenooCircuitAttempt, SenooCircuitBatch, SenooCircuitFrame, SenooCircuitSite, SenooCircuitStage } from '../../src/physics/senooCircuitBatch';

const targetSites = ['site-left', 'site-right'] as const;

function stage(status: SenooCircuitStage['status'], startS: number, endS: number, ref: string): SenooCircuitStage {
  return {
    status, startS: status === 'skipped' ? null : startS, endS: status === 'skipped' ? null : endS,
    sourceRef: status === 'skipped' ? null : ref, reason: status === 'executed' ? null : `engineering ${status}`,
  };
}

function frame(imageNo: 1 | 2, isBright: boolean, status: SenooCircuitFrame['status'], ref: string, siteId: string): SenooCircuitFrame {
  const valid = status === 'valid';
  const offset = imageNo === 1 ? 0 : 3e-6;
  return {
    imageNo, status, exposureId: valid ? `image-${imageNo}` : null, sourceRef: valid ? `${ref}/image-${imageNo}` : null,
    roiId: valid ? `engineering-roi-${siteId}` : null,
    count: valid ? (isBright ? 40 : 0) : null, actualThreshold: valid ? 40 : null, comparison: valid ? 'ge' : null,
    triggerS: valid ? 3e-6 + offset : null, startS: valid ? 4e-6 + offset : null,
    endS: valid ? 5e-6 + offset : null, countReadyS: valid ? 5.5e-6 + offset : null,
  };
}

type FixtureMark = '0' | '1' | 'loss' | 'ambiguous' | 'missing' | 'skipped';

function observation(siteId: string, mark: FixtureMark, ref: string): SenooCircuitSite {
  const skipped = mark === 'skipped';
  const instrumentDecision = mark === '0' ? 'm0' : mark === '1' ? 'm1' : mark === 'loss' ? 'no-atom'
    : mark === 'ambiguous' ? 'ambiguous' : null;
  return {
    siteId, instrumentDecision, frames: [
      frame(1, mark === '1' || mark === 'ambiguous', skipped ? 'skipped' : 'valid', ref, siteId),
      frame(2, mark === '0' || mark === 'ambiguous', skipped ? 'skipped' : mark === 'missing' ? 'missing' : 'valid', ref, siteId),
    ],
  };
}

export function circuitFixture(sourceKind: SenooCircuitBatch['sourceKind'] = 'synthetic'): SenooCircuitBatch {
  // The measured declaration is available only here to exercise a real-data code path with fake engineering inputs.
  const baseRef = `${sourceKind === 'synthetic' ? 'synthetic' : 'engineering-fixture'}://whole-circuit-test-only`;
  function attempt(index: number, marks: readonly FixtureMark[], transport: SenooCircuitStage['status'] = 'executed',
    gate: SenooCircuitStage['status'] = 'executed', readout: SenooCircuitStage['status'] = 'executed'): SenooCircuitAttempt {
    const attemptId = `trial-${index}`;
    const sourceRef = `${baseRef}/${attemptId}`;
    return {
      attemptId, sourceRef,
      initialOccupiedSiteIds: transport === 'skipped' ? [...targetSites] : [targetSites[0], 'reserve-site'],
      postTransportOccupiedSiteIds: transport === 'failed' ? [targetSites[0]] : [...targetSites],
      selection: {
        status: index === 8 ? 'excluded' : 'included', sourceRef: `${sourceRef}/screening`,
        reason: index === 8 ? 'engineering-only analysis exclusion' : null,
      },
      stages: {
        load: stage('executed', 0, 1e-6, `${sourceRef}/load`), transport: stage(transport, 1e-6, 2e-6, `${sourceRef}/transport`),
        gate: stage(gate, 2e-6, 3e-6, `${sourceRef}/gate`), readout: stage(readout, 3e-6, 9e-6, `${sourceRef}/readout`),
      },
      sites: targetSites.map((site, i) => observation(site, marks[i], sourceRef)),
    };
  }
  const attempts = [
    attempt(1, ['0', '0'], 'skipped'), attempt(2, ['1', '1']), attempt(3, ['loss', 'ambiguous']),
    attempt(4, ['missing', '0'], 'executed', 'executed', 'failed'),
    attempt(5, ['0', '1'], 'failed', 'skipped'),
    attempt(6, ['skipped', 'skipped'], 'executed', 'failed', 'skipped'),
    attempt(7, ['skipped', 'skipped'], 'executed', 'executed', 'skipped'), attempt(8, ['0', '1']),
  ];
  return {
    kind: 'senoo-circuit-batch', schemaVersion: 1, sourceKind, sourceRef: baseRef, isotope: 171, trapWavelengthM: 767e-9,
    apparatusVersion: 'engineering-apparatus', protocolVersion: 'engineering-protocol', workingPoint: 'engineering-workpoint',
    cameraConfigRef: `${baseRef}/camera`, roiMapVersion: `${baseRef}/roi`, countProcessingRef: `${baseRef}/processing`,
    outcomePolicy: 'engineering-outcome', screeningRuleRef: `${baseRef}/screening`, countUnit: 'counts',
    circuitSelectionRuleRef: `${baseRef}/circuit-mask-v1`,
    acquisitionRunId: `${baseRef}/run`, batchId: 'ENGINEERING-CIRCUIT-HOLDOUT', acquiredAtUtc: '2026-11-01T03:00:00Z',
    clockId: 'engineering-clock', timeOriginRef: `${baseRef}/t0`, circuitId: 'bell', circuitVersion: 'engineering-bell-v1',
    basis: 'ZZ', siteIds: targetSites, targetBitstrings: ['00', '11'], expectedAttempts: attempts.length, attempts,
  };
}
