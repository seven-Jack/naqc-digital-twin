import { signed } from '../components/format';
import type { Model } from '../physics/model';
import { kHz } from '../physics/units';

export function ExperimentGuide({ model, onCompensate }: { model: Model; onCompensate: () => void }) {
  const compensated = model.parameters.mode === 'compensated';
  return <section className="panel experiment-guide" aria-label="钟跃迁实验步骤">
    <div className="experiment-guide-heading">
      <h2>从俘获到共振</h2>
      <a className="text-button" href="#research-models">运动与实验校准 ↓</a>
    </div>
    <div className="experiment-steps">
      <a href="#optical-controls"><span>调节光镊</span><strong>{model.parameters.powerMw.toFixed(2)} mW · {model.parameters.waistUm.toFixed(2)} µm</strong></a>
      <div><span>观察钟跃迁光移</span><strong>{signed(model.starkHz / kHz(1))} kHz</strong></div>
      <div><span>有效失谐</span><strong>{signed(model.detuningHz / kHz(1))} kHz</strong></div>
    </div>
    <div className="experiment-guide-action">
      <p>{compensated
        ? '再次开始脉冲，比较补偿前后的末态激发概率。'
        : '先开始脉冲，观察失谐下的激发概率，再施加补偿并重跑。'}</p>
      <button className="text-button" onClick={onCompensate}>
        {compensated ? '恢复未补偿' : '补偿当前光移'}
      </button>
    </div>
  </section>;
}
