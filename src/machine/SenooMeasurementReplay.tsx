import { Activity, Clock3, SkipBack, SkipForward } from 'lucide-react';
import { useId, useMemo, type CSSProperties } from 'react';
import { buildSenooMeasurementTimeline, senooMeasurementReplayFrame } from '../physics/senooMeasurementReplay';
import { summarizeSenooMeasurementSites, type SenooMeasurementReport } from '../physics/senooMeasurements';
import { SenooOpticalScene } from '../scene/SenooOpticalScene';
import { decisionLabels, eventLabels, groupLabels, preparationLabels, selectionLabels, sourceLabels } from './senooMeasurementLabels';
import './senoo-measurement-replay.css';

type Pair = SenooMeasurementReport['records'][number];
type Batch = SenooMeasurementReport['batches'][number];
type TimingEvent = SenooMeasurementReport['events'][number];
type PlaybackFrame = ReturnType<typeof senooMeasurementReplayFrame>['frames'][number];
type Denominators = ReturnType<typeof summarizeSenooMeasurementSites>;

const frameLabels: Record<PlaybackFrame['state'], string> = {
  pending: '尚无帧结果', exposing: '曝光中', 'waiting-count': '等待计数',
  available: '有效', missing: '缺帧', skipped: '跳过', invalid: '无效', unknown: '状态未知',
};
const denominatorColumns = [
  ['attemptedSites', '尝试位点'], ['prepPassed', '制备通过'], ['validPairs', '有效配对'], ['included', '统计纳入'],
] as const satisfies readonly (readonly [keyof Denominators, string])[];

interface Props {
  pair: Pair;
  batch: Batch;
  records: readonly Pair[];
  events: readonly TimingEvent[];
  positionUs: number | null | undefined;
  onSeek: (positionUs: number | null) => void;
}

function FrameCard({ frame, unit }: { frame: PlaybackFrame; unit: string | null }) {
  return <section className="smr-frame" data-testid={`senoo-measurement-replay-frame-${frame.imageNo}`}
    data-state={frame.state}>
    <h4>Image {frame.imageNo}<span>{frameLabels[frame.state]}</span></h4>
    {frame.count !== null && <div className="smr-count"><code>{frame.count}</code>{unit && <span>{` ${unit}`}</span>}</div>}
    {frame.state === 'available' && frame.count === null && <p>判决计数未记录</p>}
    {frame.exposureId && <code className="smr-frame-id">{frame.exposureId}</code>}
    {frame.issue && <p>{frame.issue}</p>}
  </section>;
}

export function SenooMeasurementReplay({ pair, batch, records, events, positionUs, onSeek }: Props) {
  const titleId = useId();
  const timeline = useMemo(() => buildSenooMeasurementTimeline(pair, events), [pair, events]);
  const attemptTotals = useMemo(() => summarizeSenooMeasurementSites(
    records.filter(record => record.attemptId === pair.attemptId),
  ), [records, pair.attemptId]);
  const { timesUs, hasUntimedOutcome } = timeline;
  const start = timesUs[0];
  const end = timesUs[timesUs.length - 1];
  const frame = senooMeasurementReplayFrame(timeline, positionUs === undefined ? start ?? null : positionUs);
  const time = frame.positionUs;
  const progress = time === null || start === end ? 100 : 100 * (time - start) / (end - start);
  const previous = time === null ? end : timesUs.filter(checkpoint => checkpoint < time).at(-1);
  const next = time === null ? undefined : timesUs.find(checkpoint => checkpoint > time);
  const hasNext = time !== null && (next !== undefined || hasUntimedOutcome);
  const timeLabel = time === null ? '时标未记录' : `${time} µs`;
  const decision = frame.decisionState === 'pending' ? '尚无判决'
    : frame.decisionState === 'not_available' ? '未产生判决' : decisionLabels[frame.decision!] ?? frame.decision;

  return <section className="md-panel smr-panel" aria-labelledby={titleId} data-testid="senoo-measurement-replay"
    data-attempt-id={pair.attemptId} data-site-id={pair.siteId} data-position-us={time ?? ''}
    data-source-kind={batch.sourceKind}>
    <div className="md-panel-header">
      <h3 id={titleId}><Activity size={16} />双曝光逐轮回放</h3>
      <span className={`smi-source-${batch.sourceKind}`}>{sourceLabels[batch.sourceKind]}</span>
    </div>
    <div className="smr-grid">
      <div className="smr-optics">
        <SenooOpticalScene activeChannels={frame.activeChannels} state="unknown" stateLabel={`位点 ${pair.siteId} · 占据未记录`}
          channelCaption="高亮依据选中位点的曝光和关联事件。" />
        <div className="md-playback">
          <div className="smr-time"><span><Clock3 size={14} />工作簿时间轴</span><output>{timeLabel}</output></div>
          {start !== undefined && <div className="smr-axis">
            <input type="range" aria-label="双曝光逐轮时间轴" aria-valuetext={timeLabel}
              min={start} max={end} step="any" value={time ?? end} disabled={start === end}
              style={{ '--md-fill': `${progress}%` } as CSSProperties}
              onChange={event => onSeek(event.currentTarget.valueAsNumber)} />
            <div><code>{start} µs</code><code>{end} µs</code></div>
          </div>}
          <div className="md-controls">
            <button type="button" disabled={previous === undefined}
              onClick={() => previous !== undefined && onSeek(previous)}><SkipBack size={15} />上一步</button>
            <button type="button" className="md-play-button" disabled={!hasNext}
              onClick={() => onSeek(next ?? null)}><SkipForward size={15} />下一步</button>
          </div>
          {time === null ? <p className="smr-note">显示工作簿中未登记可用时标的结果。</p>
            : !!frame.activeEvents.length && <ul className="smr-events" aria-label="当前记录事件">
              {frame.activeEvents.map(event => <li key={event.eventId}>
                {eventLabels[event.eventType]} <code>{event.eventId}</code>
              </li>)}
            </ul>}
        </div>
      </div>
      <div className="smr-readout">
        <p className="smr-identity"><code>{batch.id}</code><span>尝试 <code>{pair.attemptId}</code></span>
          <span>位点 <code>{pair.siteId}</code></span></p>
        <dl className="smr-conditions">
          <div><dt>制备组</dt><dd>{groupLabels[pair.preparedGroup]}</dd></div>
          <div><dt>制备擦除</dt><dd>{frame.preparation === null ? '尚无结果' : preparationLabels[frame.preparation]}</dd></div>
        </dl>
        <div className="smr-frames">{frame.frames.map(image => <FrameCard key={image.imageNo} frame={image} unit={batch.countUnit} />)}</div>
        <div className="smr-verdict" data-testid="senoo-measurement-replay-verdict" data-state={frame.decisionState}>
          <span>原仪器判决</span><strong>{decision}</strong>
        </div>
        <div className="smr-totals" data-testid="senoo-measurement-replay-totals">
          <table>
            <caption>原记录分母</caption>
            <thead><tr><th scope="col">范围</th>
              {denominatorColumns.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
            <tbody>{([['当前尝试', attemptTotals], ['整批', batch]] as const).map(([label, totals]) => <tr key={label}>
              <th scope="row">{label}</th>
              {denominatorColumns.map(([key]) => <td key={key}>{totals[key]}</td>)}
            </tr>)}</tbody>
          </table>
          <p className="smr-note">所选位点原记录筛选 {selectionLabels[pair.analysisStatus]}。</p>
        </div>
      </div>
    </div>
  </section>;
}
