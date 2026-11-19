import { describe, expect, it } from 'vitest';
import { buildSenooMeasurementTimeline, senooMeasurementReplayFrame } from '../src/physics/senooMeasurementReplay';
import { validateSenooMeasurements } from '../src/physics/senooMeasurements';
import { freshSheets } from './helpers/senooMeasurementFixture';

const { records, events } = validateSenooMeasurements(freshSheets());

describe('Senoo measurement timeline', () => {
  it('projects camera, illumination, counts and original verdict at their own recorded times', () => {
    const timeline = buildSenooMeasurementTimeline(records[0], events);
    const frame = (positionUs: number) => senooMeasurementReplayFrame(timeline, positionUs);
    expect(timeline.timesUs).toEqual([
      1040, 1060, 1100, 1110, 1115, 1121, 1124, 1130, 1138, 1153, 1180, 1190, 1210,
      1222, 1230, 1240, 1242, 1248, 1252, 1260, 1268, 1283, 1310, 1325, 1340,
    ]);
    expect(timeline.hasUntimedOutcome).toBe(false);
    expect(frame(1040)).toMatchObject({ preparation: null, activeChannels: [] });
    expect(frame(1060).preparation).toBe('pass');
    expect(frame(1100).activeChannels).toEqual(['clock']);
    expect(frame(1115).activeChannels).toEqual(['tweezer']);
    expect(frame(1130).activeChannels).toEqual(['camera']);
    const firstLight = frame(1138);
    expect(firstLight).toMatchObject({
      activeChannels: ['fluorescence', 'camera'],
      frames: [{ imageNo: 1, state: 'exposing', count: null }, { imageNo: 2, state: 'pending', count: null }],
      decisionState: 'pending',
    });
    expect(frame(1153).activeChannels).toEqual(['camera']);
    expect(frame(1180)).toMatchObject({ activeChannels: [], frames: [{ state: 'waiting-count', count: null }, {}] });
    expect(frame(1190).frames[0]).toMatchObject({ state: 'available', count: 74 });
    expect(frame(1210).activeChannels).toEqual(['raman']);
    expect(frame(1268).activeChannels).toEqual(['fluorescence', 'camera']);
    expect(frame(1325)).toMatchObject({
      frames: [{ state: 'available', count: 74 }, { state: 'available', count: 12 }],
      decisionState: 'pending',
    });
    expect(frame(1340)).toMatchObject({ decisionState: 'recorded', decision: 'm1' });
    expect(frame(1138)).toEqual(firstLight);
    const zero = buildSenooMeasurementTimeline(records[1], events);
    expect(senooMeasurementReplayFrame(zero, 1190).frames[0]).toMatchObject({ state: 'available', count: 0 });
  });

  it('keeps untimed missing and skipped rows separate from the last recorded time', () => {
    const missing = buildSenooMeasurementTimeline(records[3], events);
    expect(missing.timesUs.at(-1)).toBe(2190);
    expect(missing.hasUntimedOutcome).toBe(true);
    expect(senooMeasurementReplayFrame(missing, 2190)).toMatchObject({
      activeChannels: [], frames: [{ state: 'available', count: 18 }, { state: 'pending', count: null }],
      decisionState: 'pending',
    });
    expect(senooMeasurementReplayFrame(missing, null)).toMatchObject({
      activeChannels: [], frames: [{ state: 'available', count: 18 }, { state: 'missing', count: null }],
      decision: 'not_available', decisionState: 'not_available',
    });
    expect(senooMeasurementReplayFrame(missing, 2138)).toMatchObject({
      activeChannels: ['fluorescence', 'camera'], frames: [{ state: 'exposing', count: null }, { state: 'pending' }],
    });

    const skipped = buildSenooMeasurementTimeline(records[4], events);
    expect(skipped.timesUs).toEqual([3040, 3060]);
    expect(skipped.hasUntimedOutcome).toBe(true);
    expect(senooMeasurementReplayFrame(skipped, 3060)).toMatchObject({
      preparation: 'fail', activeChannels: [], frames: [{ state: 'pending' }, { state: 'pending' }],
    });
    expect(senooMeasurementReplayFrame(skipped, null)).toMatchObject({
      preparation: 'fail', activeEvents: [], activeChannels: [],
      frames: [{ state: 'skipped', count: null }, { state: 'skipped', count: null }], decisionState: 'not_available',
    });
    expect(senooMeasurementReplayFrame(skipped, 3040)).toMatchObject({
      preparation: null, activeEvents: [{ eventType: 'prep_erasure' }], activeChannels: [],
    });
  });

  it('honors event scope and leaves uncertain interval edges and count readiness unprojected', () => {
    const site = { ...records[0], frames: records[0].frames.map(frame =>
      frame.imageNo === 1 ? { ...frame, startUs: null, countReadyUs: null } : frame) };
    const light = events.find(event => event.batchId === site.batchId && event.attemptId === site.attemptId
      && event.eventId === 'LIGHT1')!;
    const timeline = buildSenooMeasurementTimeline(site, [
      { ...light, siteId: '02', eventId: 'other-site' },
      { ...light, attemptId: '0002', eventId: 'other-attempt' },
      { ...light, batchId: 'SYN-VAL', eventId: 'other-batch' },
      { ...light, siteId: '01', endUs: null },
    ]);
    expect(timeline.events.map(event => event.eventId)).toEqual(['LIGHT1']);
    expect(senooMeasurementReplayFrame(timeline, 1140)).toMatchObject({
      activeEvents: [], activeChannels: [], frames: [{ state: 'pending', count: null, sourceRef: null }, {}],
    });
    expect(senooMeasurementReplayFrame(timeline, 1340)).toMatchObject({
      frames: [{ state: 'waiting-count', count: null, sourceRef: null }, { state: 'available' }],
      decision: 'm1', decisionState: 'recorded',
    });
    expect(senooMeasurementReplayFrame(timeline, null).frames[0]).toMatchObject({
      state: 'available', count: 74, sourceRef: 'synthetic://SYN-CAL/0001/image-1',
    });
  });
});
