import { useMemo, useState } from 'react';
import { Atom } from 'lucide-react';
import { atomicData } from '../data/atomicData';
import { signed } from '../components/format';
import { TAU } from '../physics/constants';
import { motionalClock, MOTIONAL_BASIS_SIZES } from '../physics/motionalClock';
import type { Model } from '../physics/model';
import { kHz, us } from '../physics/units';
import { colors, sample } from '../plots/curves';
import { ScientificPlot } from '../plots/ScientificPlot';

const percent = (value: number) => (value * 100).toFixed(2) + '%';

export function MotionalAnalysis({ model }: { model: Model }) {
  const [axis, setAxis] = useState<'radial' | 'axial'>('radial');
  const [temperatureUk, setTemperatureUk] = useState(0.2);
  const [basisSize, setBasisSize] = useState<number>(12);
  const groundHz = model.harmonicGround[axis === 'radial' ? 'radialHz' : 'axialHz'];
  const excitedHz = model.harmonicExcited[axis === 'radial' ? 'radialHz' : 'axialHz'];
  // In the existing scene the probe travels along +x and the tweezer propagates along +z.
  const projectedWaveNumber = axis === 'radial' ? TAU / atomicData.clockWavelengthM : 0;
  const result = useMemo(() => {
    const input = {
      groundHz, excitedHz, projectedWaveNumber, basisSize, temperatureK: temperatureUk * 1e-6,
      groundDepthHz: -model.groundHz, excitedDepthHz: -model.excitedHz,
      rabiHz: model.activeRabiHz, detuningHz: model.detuningHz,
    };
    try {
      const current = motionalClock(input);
      const higher = motionalClock({ ...input, basisSize: basisSize + 4 });
      const plotUs = Math.min(model.parameters.pulseUs, 50 / Math.max(1, current.bandwidthHz, higher.bandwidthHz) / us(1));
      const points = sample(0, plotUs, 400, x => current.population(us(x)));
      const reference = points.map(([x]) => higher.population(us(x)));
      const pulseEnd = current.population(model.pulseSeconds);
      const endpointChange = Math.abs(pulseEnd - higher.population(model.pulseSeconds));
      const largestChange = Math.max(endpointChange, ...points.map(([, value], i) => Math.abs(value - reference[i])));
      return { current, higher, points, largestChange, pulseEnd, plotUs };
    } catch (error) {
      return { error: error instanceof Error ? error.message : '运动模型计算失败。' };
    }
  }, [groundHz, excitedHz, projectedWaveNumber, basisSize, temperatureUk, model]);
  return <div className="research-detail">
    <div className="research-inputs">
      <label>运动轴<select value={axis} onChange={event => setAxis(event.target.value === 'axial' ? 'axial' : 'radial')}>
        <option value="radial">径向 x · 沿钟激光</option><option value="axial">轴向 z · 垂直钟激光</option>
      </select></label>
      <label>基态温度 (µK)<select value={temperatureUk} onChange={event => setTemperatureUk(Number(event.target.value))}>
        <option value={0}>0</option><option value={0.05}>0.05</option><option value={0.2}>0.2</option><option value={0.5}>0.5</option><option value={1}>1</option><option value={2}>2</option><option value={5}>5</option>
      </select></label>
      <label>每个钟态的基底大小<select value={basisSize} onChange={event => setBasisSize(Number(event.target.value))}>
        {MOTIONAL_BASIS_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
      </select></label>
    </div>
    <p className="research-note">使用当前阱频、钟激光失谐和方波脉冲，对两个钟态各自的谐振子基底做相干演化，再按初始热布居平均。频率补偿以阱底光移为准，振动零点能之差会进一步移动载波。</p>
    {'error' in result ? <p role="alert" className="research-alert">{result.error}</p> : <>
      <dl className="research-metrics">
        <div><dt>脉冲末态激发概率</dt><dd data-testid="motion-population">{percent(result.pulseEnd)}</dd></div>
        <div><dt>运动基底截断差</dt><dd>{(100 * result.largestChange).toFixed(3)} 个百分点</dd></div>
        <div><dt>省略的初始热布居</dt><dd>{percent(result.current.thermalTail)}</dd></div>
        <div><dt>朗姆–迪克参数 η</dt><dd>{result.current.eta.toFixed(3)}</dd></div>
        <div><dt>振动基态的反冲权重保留率</dt><dd>{percent(result.current.recoilRetainedFromGround)}</dd></div>
      </dl>
      {(result.largestChange > 0.01 || result.current.thermalTail > 0.01 ||
        result.current.recoilRetainedFromGround < 0.99 || result.current.groundLevelsAboveDepth > 0.01 ||
        result.higher.excitedBasisAboveDepth ||
        result.current.rmsGroundM > (axis === 'radial' ? model.beam.waistM : model.rayleighM) * 0.25) &&
        <p role="status" className="research-alert">当前参数下，运动基底或谐振近似可能不足。可增大基底，检查截断差及热布居尾部。若基底延伸到有限阱深以上，需进一步使用实际势阱计算。</p>}
      <div className="research-grid">
        <div>
          <ScientificPlot label="一维热平均拉比动力学" xLabel="脉冲时间 (µs)" yLabel="激发概率" xRange={[0, result.plotUs]}
            yRange={[0, 1]} series={[
              { id: 'motion', label: '一维热平均', color: colors.cyan, points: result.points },
              { id: 'analytic', label: '静止原子', color: colors.gold, dashed: true,
                points: sample(0, result.plotUs, 400, x => model.drive.population(us(x))) },
            ]} />
          <p className="research-note">截断差取 {basisSize} 与 {basisSize + 4} 态计算在图中 401 个采样点及脉冲终点上的最大差值。{result.plotUs < model.parameters.pulseUs &&
            ` 为分辨快速振荡，曲线显示前 ${result.plotUs.toPrecision(3)} µs，末态读数使用完整脉冲时长。`}</p>
        </div>
        <table className="research-table">
          <caption>载波与一阶运动边带</caption>
          <thead><tr><th scope="col">跃迁</th><th scope="col">相对阱底共振 (kHz)</th><th scope="col">耦合强度 |M|²</th></tr></thead>
          <tbody>{[
            { label: '红边带', ...result.current.transition(1, 0) },
            { label: '载波', ...result.current.transition(0, 0) },
            { label: '蓝边带', ...result.current.transition(0, 1) },
          ].map(line => <tr key={line.label}><th scope="row">{line.label} {line.n}→{line.m}</th>
            <td>{signed(line.relativeToBottomHz / kHz(1), 3)}</td><td>{line.strength.toPrecision(3)}</td></tr>)}</tbody>
        </table>
      </div>
    </>}
  </div>;
}

export function MotionSection({ model }: { model: Model }) {
  const [open, setOpen] = useState(false);
  return <details className="panel research-panel" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><Atom size={17} /> 一维量子化运动</summary>
    {open && <MotionalAnalysis model={model} />}
  </details>;
}
