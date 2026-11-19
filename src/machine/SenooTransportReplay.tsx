import { Activity, Download, SkipBack, SkipForward, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  createSenooTransportReplayRecord, parseSenooTransportImport, projectSenooTransportFrame, senooTransportCheckpoints,
  summarizeSenooTransportRun, type TransportReplayOrigin,
} from '../physics/senooTransportReplay';
import { createSenooTransportRunTemplate, type SenooTransportRun } from '../physics/senooTransportRun';
import { SenooTransportScene } from '../scene/SenooTransportScene';
import './senoo-transport-replay.css';

interface Loaded {
  readonly filename: string;
  readonly sha256: string | null;
  readonly origin: TransportReplayOrigin;
  readonly run: SenooTransportRun;
  readonly attemptId: string;
  readonly timeS: number;
}

const phases = {
  waiting: '等待可用记录', loading: '装载中', initial: '装载占位已可用',
  transport: '输运中', 'await-final': '等待终态占位', final: '终态占位已可用',
} as const;
const assemblies = { pending: '待终态观测', complete: '目标已填满', incomplete: '目标有空位', unknown: '未判明' } as const;
const transportStatuses = { pending: '待执行记录', active: '执行中', executed: '已执行', failed: '失败', skipped: '跳过' } as const;
const occupancies = { occupied: '有原子', empty: '空位', unknown: '未判明' } as const;
const outcomes = { survived: '确认存活', lost: '确认丢失', unknown: '未判明' } as const;
const rateLabels = [
  ['loading', '记录位点装载率', '位点'], ['assembly', '目标装配率', '轮次'], ['survival', '搬运存活率', '搬运'],
] as const;
const displayNumber = (value: number) => Number(value.toPrecision(10)).toString();
const micro = (seconds: number) => displayNumber(seconds * 1e6);

function saveJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SenooTransportReplayPanel() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [notice, setNotice] = useState<{ kind: 'pending' } | { kind: 'error'; message: string } | null>(null);
  const importId = useRef(0);
  const run = loaded?.run;
  const attempt = run?.attempts.find(item => item.attemptId === loaded?.attemptId);
  const checkpoints = useMemo(() => attempt ? senooTransportCheckpoints(attempt) : [], [attempt]);
  const stats = useMemo(() => run ? summarizeSenooTransportRun(run) : null, [run]);
  const frame = run && loaded && attempt ? projectSenooTransportFrame(run, attempt, loaded.timeS) : null;
  const previous = frame ? checkpoints.filter(time => time < frame.timeS).at(-1) : undefined;
  const next = frame ? checkpoints.find(time => time > frame.timeS) : undefined;

  async function open(file: File) {
    const request = ++importId.current;
    setNotice({ kind: 'pending' });
    try {
      const bytes = await file.arrayBuffer();
      if (request !== importId.current) return;
      const { run, cursor, origin } = parseSenooTransportImport(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const digest = await globalThis.crypto?.subtle?.digest('SHA-256', bytes);
      if (request !== importId.current) return;
      const sha256 = digest ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') : null;
      setLoaded(current => {
        if (!cursor && sha256 && current?.sha256 === sha256) return { ...current, filename: file.name };
        const first = run.attempts[0];
        return { filename: file.name, sha256, origin: origin ?? { filename: file.name, sha256 }, run,
          attemptId: cursor?.attemptId ?? first.attemptId, timeS: cursor?.timeS ?? first.startS };
      });
      setNotice(null);
    } catch (error) {
      if (request === importId.current) {
        setNotice({ kind: 'error', message: error instanceof Error ? error.message : '读取装载与输运文件失败。' });
      }
    }
  }

  function seek(timeS: number) {
    setLoaded(current => current && { ...current, timeS });
  }

  function chooseAttempt(attemptId: string) {
    setLoaded(current => {
      const nextAttempt = current?.run.attempts.find(item => item.attemptId === attemptId);
      return current && nextAttempt ? { ...current, attemptId, timeS: nextAttempt.startS } : current;
    });
  }

  return <section className="md-panel str-panel" aria-label="装载与输运日志" data-testid="senoo-transport-replay"
    data-attempt-id={attempt?.attemptId} data-position-s={frame?.timeS} data-phase={frame?.phase} data-assembly={frame?.assembly}>
    <div className="md-panel-header">
      <h2><Activity size={16} />装载与输运日志</h2>
      {run && <span data-source-kind={run.sourceKind}>{run.sourceKind === 'synthetic' ? '合成记录' : '实测声明 · 待核原件'}</span>}
    </div>
    <div className="str-content">
      <div className="md-controls ss-file-actions">
        <button type="button" onClick={() => saveJson('senoo-transport-run-template-v1.json', createSenooTransportRunTemplate())}>
          <Download size={14} />下载装载与输运模板 JSON
        </button>
        <label><Upload size={14} />导入装载与输运 JSON
          <input type="file" aria-label="导入装载与输运 JSON" accept=".json,application/json" onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void open(file);
          }} />
        </label>
        {run && loaded && <button type="button" onClick={() => saveJson('senoo-transport-replay-v1.json',
          createSenooTransportReplayRecord(run, loaded.attemptId, loaded.timeS, loaded.origin))}>
          <Download size={14} />导出装载与输运回放 JSON
        </button>}
      </div>
      {notice?.kind === 'pending' && <p className="smi-note" role="status">正在核对装载与输运日志…</p>}
      {notice?.kind === 'error' && <p className="smi-error" role="alert">{notice.message}</p>}
      {run && loaded && frame && attempt && stats && <>
        <div className="str-meta">
          <p><code>{loaded.filename}</code> · <code>{run.acquisitionRunId}</code></p>
          <label>轮次 <select aria-label="选择输运轮次" value={attempt.attemptId} onChange={event => chooseAttempt(event.currentTarget.value)}>
            {run.attempts.map(item => <option key={item.attemptId} value={item.attemptId}>{item.attemptId}</option>)}
          </select></label>
        </div>
        <div className="str-layout">
          <div>
            <SenooTransportScene sites={run.sites} frame={frame} />
            <div className="str-axis">
              <div><strong>{phases[frame.phase]}</strong><output>{micro(frame.timeS)} µs</output></div>
              <input type="range" aria-label="装载与输运时间轴" aria-valuetext={`${micro(frame.timeS)} µs`}
                min={attempt.startS} max={attempt.endS} step="any" value={frame.timeS} onChange={event => seek(event.currentTarget.valueAsNumber)} />
              <div className="md-controls">
                <button type="button" onClick={() => previous !== undefined && seek(previous)} disabled={previous === undefined}>
                  <SkipBack size={15} />上一步
                </button>
                <button type="button" onClick={() => next !== undefined && seek(next)} disabled={next === undefined}>
                  <SkipForward size={15} />下一步
                </button>
              </div>
            </div>
          </div>
          <div className="str-observed">
            <dl className="str-facts">
              <div><dt>输运阶段</dt><dd>{transportStatuses[frame.transportStatus]}</dd></div>
              <div><dt>终态装配</dt><dd>{run.sites.some(site => site.target) ? assemblies[frame.assembly] : '未指定目标位点'}</dd></div>
            </dl>
            {frame.transportReason && <p className="smi-note">{frame.transportReason}</p>}
            <div className="str-scroll" role="region" tabIndex={0} aria-label="当前位点占位">
              <table className="str-table">
                <thead><tr><th scope="col">位点</th><th scope="col">占位</th><th scope="col">原子 ID</th></tr></thead>
                <tbody>{frame.sites.map((site, index) => <tr key={site.siteId} data-state={site.state}>
                  <th scope="row">{site.siteId}{run.sites[index].target && <small>目标</small>}</th>
                  <td>{occupancies[site.state]}</td><td><code>{site.atomId ?? '—'}</code></td>
                </tr>)}</tbody>
              </table>
            </div>
            {!!frame.moves.length && <ul className="str-moves" aria-label="已开始的搬运">
              {frame.moves.map(move => <li key={move.id}>
                <strong>{move.fromSiteId} → {move.toSiteId}</strong> <code>{move.id}</code>
                <span>{move.outcome ? outcomes[move.outcome] : move.active ? '搬运中' : '等待结局'} · {
                  move.pathKind === 'tracked' ? '跟踪轨迹' : move.pathKind === 'commanded' ? '指令路径' : '无路径记录'
                }</span>
              </li>)}
            </ul>}
          </div>
        </div>
        <dl className="str-facts str-summary" data-testid="senoo-transport-statistics" aria-label="整批装载与输运统计">
          {rateLabels.map(([key, label, unit]) => {
            const counts = stats[key];
            const pct = counts.denominator ? ` · ${(100 * counts.numerator / counts.denominator).toFixed(1)}%` : '';
            return <div key={key} data-metric={key}><dt>{label}</dt><dd>{counts.numerator} / {counts.denominator}{pct}</dd>
              <small>未判明 {counts.unknown} / {counts.total} {unit}</small></div>;
          })}
          <div><dt>跳过输运</dt><dd>{stats.skippedAttempts} / {run.attempts.length} 轮</dd></div>
        </dl>
        <details className="str-sources">
          <summary>时钟与原始记录</summary>
          <dl className="str-facts">
            <div><dt>装置与工况</dt><dd>¹⁷¹Yb · {displayNumber(run.trapWavelengthM * 1e9)} nm · {run.apparatusVersion} · {run.workingPoint}</dd></div>
            <div><dt>时钟与时零</dt><dd>{run.clockId} · {run.timeOriginRef}</dd></div>
            <div><dt>米制坐标参考</dt><dd>{run.coordinateFrameRef}</dd></div>
            <div><dt>当前轮来源</dt><dd>{attempt.sourceRef}</dd></div>
            <div><dt>可用占位来源</dt><dd>{frame.occupancySourceRef ?? '未记录'}</dd></div>
            <div><dt>原输入 SHA-256</dt><dd><code>{loaded.origin.sha256 ?? '未取得'}</code></dd></div>
            {frame.moves.map(move => <div key={move.id}>
              <dt>{move.id} 的日志与来源</dt>
              <dd>{[move.sourceRef, move.pathSourceRef, move.outcomeSourceRef].filter(Boolean).join(' · ')}</dd>
            </div>)}
          </dl>
        </details>
      </>}
    </div>
  </section>;
}
