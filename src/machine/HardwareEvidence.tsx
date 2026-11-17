import { ArrowUpRight, BookOpen, ExternalLink } from 'lucide-react';
import { hardwareComparisons, munizEvidence as reference } from '../data/hardwareEvidence';

export function HardwareEvidence() {
  return <section className="md-hardware md-panel" id="hardware-evidence" aria-labelledby="hardware-evidence-heading">
    <div className="md-panel-header">
      <h2 id="hardware-evidence-heading" tabIndex={-1}><BookOpen size={16} />真机实验依据</h2>
      <span>公开论文 · 按装置与条件标注</span>
    </div>
    <div className="md-hardware-body">
      <article className="md-reference">
        <div>
          <p className="md-reference-kind">光路与实验流程参考</p>
          <h3>{reference.platform}</h3>
          <p>{reference.encoding}。论文使用 {reference.trapSites} 个阱位，交互区的相邻阱位间距为 {reference.gatePitchUm} µm。演示网格为 48 位点。</p>
        </div>
        <dl className="md-reference-metrics">
          <div>
            <dt>储备阱 ↔ 科学阱</dt>
            <dd><strong>{reference.reservoirNm} ↔ {reference.scienceNm} nm</strong><span>同位置阱间交接，功率斜坡 {reference.transferMs} ms</span></dd>
          </div>
          <div>
            <dt>态选择荧光</dt>
            <dd><strong>{reference.imagingNm} nm · {reference.imageMs} ms</strong><span>单幅态选择曝光，典型读出误差 &lt;0.2%，丢失 &lt;0.5%</span></dd>
          </div>
          <div>
            <dt>两比特 CZ</dt>
            <dd><strong>{reference.shelvingNm} + {reference.rydbergNm} nm</strong><span>钟态转移 → 里德堡相位 → 返回基态，含局域相位校准</span></dd>
          </div>
          <div>
            <dt>由双比特 Clifford RB 推得的 CZ 保真度</dt>
            <dd><strong>99.72(3)% / 99.40(3)%</strong><span>分别为按末态仍在量子比特子空间后选、未做该后选</span></dd>
          </div>
        </dl>
        <a href={reference.url} target="_blank" rel="noreferrer">{reference.author} · {reference.sources} <ExternalLink size={12} /></a>
      </article>
      <div className="md-hardware-comparisons">
        {hardwareComparisons.map(item => <article key={item.url}>
          <p className="md-platform">{item.platform}</p>
          <h3>{item.topic}</h3>
          <p className="md-reference-data">{item.data}</p>
          <p>{item.detail}</p>
          <a href={item.url} target="_blank" rel="noreferrer">{item.author} · {item.sources} <ArrowUpRight size={13} /></a>
        </article>)}
      </div>
      <p className="md-evidence-note">上述为各论文报告的实验配置或实测指标。演示按公开流程组织，仿真输入、播放时间和输出只描述本页模型。</p>
    </div>
  </section>;
}
