import { Atom, ChevronsRight, ListOrdered, SkipBack, SkipForward, Waves, Zap } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { SENOO_CZ_BELL_OBSERVATIONS } from '../data/senooCzBellSource';
import { SENOO_PXP_OBSERVATIONS } from '../data/senooPxpSource';
import {
  SENOO_CZ_BELL_STAGES, senooCzBellReplayFrame, type SenooCzBellReplaySelection,
} from '../physics/senooCzBellReplay';
import {
  SENOO_PXP_STAGES, senooPxpReplayFrame, type SenooPxpReplaySelection,
} from '../physics/senooPxpReplay';
import { SenooOpticalScene } from '../scene/SenooOpticalScene';
import { SenooPxpObservations, type SenooBellComparisonRow } from './SenooPxpObservations';

const pxpIcons = [Zap, ChevronsRight, Waves, Atom];
const czIcons = [Waves, Zap, ChevronsRight, Atom];
const czObservationFigures: Readonly<Partial<Record<string, string>>> = { 'measure-m': '图 1c', 'm-to-o': '图 1d' };
const pairLabels = {
  'rydberg-pair': '里德堡比特 · 阻塞制备',
  'metastable-pair': '亚稳态比特 · 制备旋转',
  'metastable-odd-pair': '亚稳态比特 · 奇子空间',
  'metastable-even-pair': '亚稳态比特 · 偶 Bell 态',
  'clock-pair': '钟比特 · 偶 Bell 态',
};

type Props = { readonly fileActions: ReactNode } & (
  { readonly mode: 'pxp'; readonly selection: SenooPxpReplaySelection;
    readonly onSelection: (selection: SenooPxpReplaySelection) => void }
  | { readonly mode: 'cz'; readonly selection: SenooCzBellReplaySelection;
    readonly onSelection: (selection: SenooCzBellReplaySelection) => void }
);

function stageComparison(state: keyof typeof pairLabels): readonly [SenooBellComparisonRow, SenooBellComparisonRow] | undefined {
  if (state !== 'metastable-even-pair' && state !== 'clock-pair') return undefined;
  const pxp = SENOO_PXP_OBSERVATIONS[state === 'clock-pair' ? 'm-to-o' : 'rotate'];
  const cz = SENOO_CZ_BELL_OBSERVATIONS[state === 'clock-pair' ? 'm-to-o' : 'measure-m'];
  if (pxp.fixedFidelity === null || cz.fixedFidelity === null) return undefined;
  return [
    { label: 'PXP', targetPopulation: pxp.targetPopulation, parityAmplitude: 2 * pxp.fixedFidelity - pxp.targetPopulation },
    { label: 'CZ', targetPopulation: cz.targetPopulation, parityAmplitude: 2 * cz.fixedFidelity - cz.targetPopulation },
  ];
}

export function SenooBellReplay(props: Props) {
  const frame = props.mode === 'pxp' ? senooPxpReplayFrame(props.selection) : senooCzBellReplayFrame(props.selection);
  const { stage, index } = frame;
  const stages = props.mode === 'pxp' ? SENOO_PXP_STAGES : SENOO_CZ_BELL_STAGES;
  const icons = props.mode === 'pxp' ? pxpIcons : czIcons;
  const lastIndex = stages.length - 1;
  const figure = props.mode === 'pxp' ? '图 2f' : '图 1c–d';
  const observationFigure = props.mode === 'cz' ? czObservationFigures[stage.id] ?? figure : figure;
  const stateLabel = props.mode === 'cz' && stage.id === 'cz' ? '亚稳态比特 · 里德堡介导 CZ' : pairLabels[stage.state];

  function seek(nextIndex: number) {
    if (props.mode === 'pxp') props.onSelection({ ...props.selection, stageId: SENOO_PXP_STAGES[nextIndex].id });
    else props.onSelection({ ...props.selection, stageId: SENOO_CZ_BELL_STAGES[nextIndex].id });
  }

  function selectPoint(pointId: string) {
    if (props.mode === 'pxp') {
      const { stageId, pointIds } = props.selection;
      if (stageId !== 'pxp') props.onSelection({ stageId, pointIds: { ...pointIds, [stageId]: pointId } });
    } else {
      const { stageId, pointIds } = props.selection;
      if (stageId === 'measure-m' || stageId === 'm-to-o') {
        props.onSelection({ stageId, pointIds: { ...pointIds, [stageId]: pointId } });
      }
    }
  }

  return <div className="ss-layout ss-pxp-layout" data-testid={`senoo-${props.mode}-replay`} data-stage={stage.id}>
    <section className="md-panel md-sequence ss-sequence" aria-label={`${figure} 文献工序`}>
      <div className="md-panel-header"><h2><ListOrdered size={16} />文献工序</h2></div>
      <ol>{stages.map((step, i) => {
        const Icon = icons[i];
        const selected = step.id === stage.id;
        return <li key={step.id}>
          <button type="button" aria-current={selected ? 'step' : undefined}
            className={selected ? 'md-current' : ''} onClick={() => seek(i)}>
            <span className="md-step-icon"><Icon size={15} /></span>
            <span className="md-step-text">{step.label}</span>
          </button>
        </li>;
      })}</ol>
    </section>

    <section className="md-panel ss-optics" aria-label={`${figure} 装置与光路`}>
      <div className="md-panel-header">
        <h2><Atom size={16} />装置与光路</h2>
        <span className="md-stage-indicator" data-testid={`senoo-${props.mode}-stage`} data-stage={stage.id}><i />{stage.label}</span>
      </div>
      <SenooOpticalScene activeChannels={stage.channels} state={stage.state} stateLabel={stateLabel} />
      <div className="md-playback">
        <p className="md-playback-note">{stage.description}</p>
        <div className="md-timeline ss-timeline">
          <input type="range" aria-label={`${figure} 协议时间轴`} aria-valuetext={stage.label} min={0} max={lastIndex} step={1}
            value={index} style={{ '--md-fill': `${(index / lastIndex) * 100}%` } as CSSProperties}
            onChange={event => seek(event.target.valueAsNumber)} />
          <code>步骤 {index + 1} / {stages.length}</code>
        </div>
        <p className="ss-pxp-time" data-testid={`senoo-${props.mode}-time-status`}>实际时标待测</p>
        <div className="md-controls">
          <button type="button" onClick={() => seek(index - 1)} disabled={index === 0}><SkipBack size={15} />上一步</button>
          <button type="button" className="md-play-button" onClick={() => seek(index + 1)}
            disabled={index === lastIndex}><SkipForward size={15} />下一步</button>
        </div>
        {props.fileActions}
      </div>
    </section>

    <div className="ss-receipt">
      <SenooPxpObservations frame={frame} onSelectPoint={selectPoint} figure={observationFigure}
        fidelityCondition={props.mode === 'cz' ? '公开观测 · 未施加测量误差修正' : undefined}
        comparison={stageComparison(stage.state)}
        emptyMessage={props.mode === 'cz' ? '图 1c 的公开布居和奇偶从亚稳态 Bell 分析开始。' : undefined} />
    </div>
  </div>;
}
