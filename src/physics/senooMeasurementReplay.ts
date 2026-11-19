import type { SenooMeasurementReport } from './senooMeasurements';

type Site = SenooMeasurementReport['records'][number];
type Exposure = Site['frames'][number];
type Event = SenooMeasurementReport['events'][number];
export type SenooMeasurementFrameState =
  | 'pending' | 'exposing' | 'waiting-count' | 'available' | 'missing' | 'skipped' | 'invalid' | 'unknown';

const eventChannels: Partial<Record<Event['eventType'], string>> = {
  clock_pi: 'clock',
  raman_pi: 'raman',
  illumination_399: 'fluorescence',
  trap_ramp: 'tweezer',
};

function activeAt(positionUs: number | null, startUs: number | null, endUs: number | null) {
  return positionUs !== null && startUs !== null && endUs !== null && positionUs >= startUs && positionUs < endUs;
}

function reached(positionUs: number | null, readyUs: number | null) {
  return positionUs === null || (readyUs !== null && positionUs >= readyUs);
}

export function buildSenooMeasurementTimeline(pair: Site, events: readonly Event[]) {
  const linked = events.filter(event => event.batchId === pair.batchId && event.attemptId === pair.attemptId
    && (event.siteId === null || event.siteId === pair.siteId));
  const preparations = linked.filter(event => event.eventType === 'prep_erasure');
  const preparationReadyUs = preparations.reduce<number | null>((latest, event) => {
    const endUs = event.endUs;
    return endUs === null ? latest : Math.max(latest ?? endUs, endUs);
  }, null);
  const preparationBound = preparations.every(event => event.endUs !== null) ? preparationReadyUs : null;
  const times = [
    ...linked.flatMap(event => [event.startUs, event.endUs]),
    ...pair.frames.filter(frame => frame.status !== 'skipped')
      .flatMap(frame => [frame.triggerUs, frame.startUs, frame.endUs, frame.countReadyUs]),
    pair.decisionReadyUs,
  ];
  const timesUs = [...new Set(times.filter(time => time !== null))].sort((a, b) => a - b);
  const hasUntimedOutcome = pair.decisionReadyUs === null || pair.frames.some(frame =>
    frame.status === 'skipped' || frame.countReadyUs === null)
    || (preparationBound === null && (pair.prepErasureStatus === 'pass' || pair.prepErasureStatus === 'fail'));
  return { pair, events: linked, timesUs, hasUntimedOutcome, preparationReadyUs: preparationBound };
}

function projectExposure(frame: Exposure, positionUs: number | null) {
  const exposing = frame.status !== 'skipped' && activeAt(positionUs, frame.startUs, frame.endUs);
  const available = reached(positionUs, frame.status === 'skipped' ? null : frame.countReadyUs);
  let state: SenooMeasurementFrameState = 'pending';
  if (available) {
    state = frame.status === 'valid' ? 'available' : frame.status;
  } else if (exposing) {
    state = 'exposing';
  } else if (positionUs !== null && frame.status !== 'skipped' && frame.endUs !== null && positionUs >= frame.endUs) {
    state = 'waiting-count';
  }
  return {
    imageNo: frame.imageNo, status: available ? frame.status : null, state, exposing,
    count: state === 'available' ? frame.decisionCount : null,
    sourceRef: available ? frame.sourceRef : null,
    exposureId: available || exposing ? frame.exposureId : null,
    issue: available ? frame.issue : null,
  };
}

export function senooMeasurementReplayFrame(timeline: ReturnType<typeof buildSenooMeasurementTimeline>, positionUs: number | null) {
  const { pair, events, preparationReadyUs } = timeline;
  const activeEvents = events.filter(event => activeAt(positionUs, event.startUs, event.endUs));
  const frames = pair.frames.map(frame => projectExposure(frame, positionUs));
  const channels = new Set<string>();
  for (const event of activeEvents) {
    const channel = eventChannels[event.eventType];
    if (channel) channels.add(channel);
  }
  if (frames.some(frame => frame.exposing)) channels.add('camera');
  const decision = reached(positionUs, pair.decisionReadyUs) ? pair.instrumentDecision : null;
  const decisionState = !reached(positionUs, pair.decisionReadyUs) ? 'pending'
    : decision === null || decision === 'not_available' ? 'not_available' : 'recorded';
  return {
    positionUs, activeChannels: [...channels], activeEvents, frames, decision, decisionState,
    preparation: reached(positionUs, preparationReadyUs) ? pair.prepErasureStatus : null,
  };
}
