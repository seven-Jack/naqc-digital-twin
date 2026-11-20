import { useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Atom, Camera, ChevronRight, CircuitBoard,
  ClipboardList, Focus, ListFilter, Route, Waves,
} from 'lucide-react';
import {
  evidenceKinds, evidenceRoute, resolveEvidenceRoute, twinSubsystems, type EvidenceFilter, type EvidenceLink,
} from '../data/twinEvidence';
import { useHashFragment } from '../state/useHashFragment';
import { readAcquisitionCsvCells } from '../physics/acquisitionCsv';
import p19 from '../../references/knowledge/data/knottnerus-s23-p19/results/summary.json';
import ranges from '../../references/knowledge/data/knottnerus-s23-p19/count-ranges.json';
import cohortCsv from '../../references/knowledge/data/knottnerus-s23-p19/results/cohorts.csv?raw';
import cohortUrl from '../../references/knowledge/data/knottnerus-s23-p19/results/cohorts.csv?url';
import rangesUrl from '../../references/knowledge/data/knottnerus-s23-p19/count-ranges.json?url';
import summaryUrl from '../../references/knowledge/data/knottnerus-s23-p19/results/summary.json?url';
import './twin-evidence.css';

const icons = { array: Focus, transport: Route, control: Waves, readout: Camera, bell: CircuitBoard };
const fmt = new Intl.NumberFormat('en-US');
const ratios = (count: number, total: number) => `${fmt.format(count)}/${fmt.format(total)}`;

const [cohortHeader, ...cohortLines] = cohortCsv.trimEnd().split(/\r?\n/);
const cohortFields = cohortHeader.split(',');
const fullArrayCounts = new Map(cohortLines.map(line => {
  const cells = readAcquisitionCsvCells(line, 'P19 cohorts.csv');
  const cell = (field: string) => cells[cohortFields.indexOf(field)];
  return [`${cell('threshold')}/${cell('cohort')}`, {
    rounds: Number(cell('round_denominator')), full: Number(cell('fixed_full_n')),
  }] as const;
}));
const thresholdCounts = Object.keys(p19.thresholds) as (keyof typeof p19.thresholds)[];
const p19Links: EvidenceLink[] = [
  { href: `https://doi.org/${p19.source_doi}`, label: '作者公开原始数据' },
  { href: rangesUrl, filename: 'P19-count-ranges.json', label: '两帧计数 JSON' },
  { href: summaryUrl, filename: 'P19-summary.json', label: '逐阈值结果 JSON' },
  { href: cohortUrl, filename: 'P19-cohorts.csv', label: '筛选名单与分母 CSV' },
];

function Links({ items }: { items: readonly EvidenceLink[] }) {
  return <div className="tw-evidence-links">{items.map(link => {
    const external = link.href.startsWith('https://');
    const Icon = link.filename ? ArrowDownToLine : external ? ArrowUpRight : ArrowRight;
    return <a key={link.href} href={link.href} download={link.filename} target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}>
      {link.label} <Icon size={14} aria-hidden="true" />
    </a>;
  })}</div>;
}

function P19Holdout() {
  const [threshold, setThreshold] = useState<keyof typeof p19.thresholds>('6436');
  const decision = p19.thresholds[threshold];
  const all = fullArrayCounts.get(`${threshold}/all`)!;
  const selected = fullArrayCounts.get(`${threshold}/fixed_in`)!;
  const joint = p19.joint_focus_matching_all_holdout_decisions.join('、');
  return <div className="tw-holdout" data-testid="p19-holdout-evidence">
    <table aria-label="P19 原始两帧窗口计数">
      <thead><tr><th scope="col">曝光帧</th><th scope="col">像素和（counts）</th><th scope="col">日志占位／位点帧</th></tr></thead>
      <tbody>{(['1', '2'] as const).map((frame) => {
        const data = ranges.frames[frame];
        return <tr key={frame}><th scope="row">Pic{frame}</th>
          <td>{fmt.format(data.min_counts)}–{fmt.format(data.max_counts)}</td>
          <td>{ratios(data.logged_occupied, data.site_decisions)}</td></tr>;
      })}</tbody>
    </table>
    <div className="tw-holdout-rule">
      <label>占位判据，窗口像素和严格大于
        <select aria-label="P19 占位阈值" value={threshold} onChange={e => setThreshold(e.currentTarget.value as keyof typeof p19.thresholds)}>
          {thresholdCounts.map(value => <option key={value} value={value}>{value} counts</option>)}
        </select>
      </label>
      <dl aria-live="polite" aria-atomic="true">
        <div><dt>复算与日志差异</dt><dd>{ratios(decision.disagreements, decision.decision_denominator)}</dd></div>
        <div><dt>筛选前满阵列</dt><dd>{ratios(all.full, all.rounds)}</dd></div>
        <div><dt>首帧入选后满阵列</dt><dd>{ratios(selected.full, selected.rounds)}{selected.rounds === 0 && <small>不可估计</small>}</dd></div>
      </dl>
    </div>
    <p>本批 ⁸⁸Sr 的两帧均无日志占位阳性。{p19.baseline_candidate} counts 是候选阈值，6499–6519 仅为 P2 日志相容区间。受检值中，仅 {joint} 在 P3 至 P19 逐批吻合。P19 的计数都低于最低受检阈值。</p>
    <Links items={p19Links} />
  </div>;
}

export function TwinEvidenceWorkspace() {
  const { filter, visible, selected } = resolveEvidenceRoute(useHashFragment());
  const Icon = icons[selected.id];
  const records = selected.records.filter(record => filter === 'all' || record.kind === filter);
  function changeFilter(next: EvidenceFilter) {
    const candidates = twinSubsystems.filter(system => next === 'all' || system.records.some(record => record.kind === next));
    const target = candidates.find(system => system.id === selected.id) ?? candidates[0];
    window.location.hash = evidenceRoute(target.id, next);
  }

  return <main className="tw-evidence">
    <div className="tw-evidence-intro">
      <div><h1>整机子系统与证据</h1>
        <p>选择装置环节，核对模型依据、可回放数据和正式验收所需的实测记录。</p></div>
      <label className="tw-evidence-filter"><span><ListFilter size={16} aria-hidden="true" />证据类型</span>
        <select aria-label="证据类型" value={filter} onChange={e => changeFilter(e.currentTarget.value as EvidenceFilter)}>
          <option value="all">全部类型</option>
          {Object.entries(evidenceKinds).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
    </div>
    <div className="tw-evidence-layout">
      <nav className="tw-evidence-index" aria-label="整机子系统">
        <h2><Atom size={17} aria-hidden="true" />子系统</h2>
        {visible.map(system => {
          const SystemIcon = icons[system.id];
          return <a href={evidenceRoute(system.id, filter)} key={system.id} aria-current={system.id === selected.id ? 'page' : undefined}>
            <span className="tw-device-icon"><SystemIcon size={18} aria-hidden="true" /></span>
            <span><strong>{system.name}</strong><small>{system.components}</small></span>
            <ChevronRight size={15} aria-hidden="true" /></a>;
        })}
      </nav>
      <section className="tw-evidence-detail" aria-labelledby="tw-system-title" data-testid="twin-evidence-detail" data-subsystem={selected.id}>
        <header className="tw-system-head">
          <div className="tw-system-title"><Icon size={25} aria-hidden="true" /><h2 id="tw-system-title">{selected.name}</h2></div>
          <p>{selected.operation}</p>
        </header>
        {records.map(record => <article className="tw-evidence-record" key={record.title}>
          <div className="tw-record-head"><span className={`tw-evidence-kind tw-kind-${record.kind}`}>{evidenceKinds[record.kind]}</span>
            <h3>{record.title}</h3></div>
          <p>{record.detail}</p>
          {record.links && <Links items={record.links} />}
          {record.kind === 'comparison' && selected.id === 'transport' && <P19Holdout />}
        </article>)}
        <section className="tw-evidence-pending" aria-labelledby="tw-pending-title">
          <h3 id="tw-pending-title"><ClipboardList size={17} aria-hidden="true" />正式验收待补</h3>
          {selected.pending.map(item => <div key={item.title}><h4>{item.title}</h4>
            <p>{item.detail}</p>{item.links && <Links items={item.links} />}</div>)}
        </section>
      </section>
    </div>
  </main>;
}

export default TwinEvidenceWorkspace;
