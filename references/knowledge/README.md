# ¹⁷¹Yb 整机数字孪生知识库

每条阅读记录包含来源和版本、可回到原文的图节或段落、装置条件、对模型的含义以及适用范围。首套具名文献回放采用 Senoo 767 nm 双曝光。483/460 nm 作为 Bell 演示基线。 [Senoo 装置与实测缺项](../../docs/SENOO_APPARATUS.md) · [装置比较](apparatus-comparison.md) · [原始资料目录](../README.md)

## 按目的查阅

| 要做的事 | 入口 |
| --- | --- |
| 根据原子数据库和文献选择模块、接口、实施顺序和校准数据 | [整机数字孪生架构方案](../../docs/DIGITAL_TWIN_ARCHITECTURE_PROPOSAL.md) |
| 比较首版需要跟踪的工序，明确同一套装置的光路、编码和测量 | [装置候选与比较条件](apparatus-comparison.md) |
| 确定可先实现的模型边界以及后续验收 | [模型接口与验收](model-requirements.md) |
| 追溯 ¹⁷¹Yb 装置、能级、光移、里德堡与读出依据 | [¹⁷¹Yb 逐项阅读记录](ytterbium.md) |
| 对照同类中性原子的装配、调度、门、成像及基础理论 | [中性原子与基础逐项阅读记录](neutral-atoms.md) |
| 对照其他路线或参考设备、序列、控制和采集接口 | [跨平台、手册与工具逐项阅读记录](cross-platform.md) |
| 核对 Senoo 图源表、数据轴、统计条件及分支标签 | [Senoo 图 2 和扩展数据图 5](source-data.md) |
| 准备 Senoo 单原子和两原子门的模型输入、文献验收数据及缺项 | [门模型公开参数与验收数据](senoo-gate-model-data.md) |
| 重跑 302 nm 单原子 Rabi 模型，查看 80 个时点的两态残差 | [图 2c 文献复现](senoo-fig2c-rabi-reproduction.md) |
| 核对双原子能移两轴误差、2.4 µm 阻塞 Rabi 和刊版频率 | [扩展数据图 5f、4f 文献复现](senoo-pair-reproduction.md) |
| 核对 4.242 MHz 与 4.49 MHz 的窗口相位、残差与采样歧义 | [扩展数据图 4e、4f 频率核对](senoo-ed4-rabi-frequency-audit.md) |
| 复现三种 CZ gRB 筛选、反推有效分母及核对每门丢失 | [图 3b–d CZ 文献复现](senoo-cz-reproduction.md) |
| 核对 Bell 四态布居、奇偶振荡和修正前后保真度 | [图 1c Bell 文献复现](senoo-bell-reproduction.md) |
| 对照钟比特 Bell 映射后的布居、奇偶振荡及可约束的损失 | [图 1d 钟比特 Bell 映射复现](senoo-clock-bell-mapping-reproduction.md) |
| 复现阻塞制备 Bell 态的两级映射，比较图 1c、1d 的同口径结果 | [图 2f PXP Bell 映射复现](senoo-pxp-bell-mapping-reproduction.md) |
| 查看双位点光路、工序与逐源点观测，保存和恢复回放状态 | [图 2f 与 CZ 对照的装置回放](../../docs/SENOO_APPARATUS.md#图-2f-阻塞-bell-映射回放) |
| 准备 Senoo 双曝光阈值探索、论文结果对照与独立验证 | [双曝光读出标定资料](senoo-readout-calibration.md) |
| 复现 Ma 的 24 个阈值及 Kim Exp34 的分件 ROI、全帧计数、198 个阈值和跨分件双帧 | [公开读出数据的跨装置对照](cross-apparatus-readout-reproduction.md) |
| 检验 Kim Exp34 冻结读出的跨批次差异，追溯 Exp33 的 2,817 个留出判决差异 | [Exp33 跨批次验证与同批次阈值复现](kim-exp33-cross-batch.md) |
| 按轮核对装载、搬运前后帧与整阵成功的分母，并比较在线与离线占位 | [Senoo 扩展图 1d 与 Knottnerus ⁸⁸Sr 的 100 轮对照](public-transport-senoo-knottnerus.md) · [200 帧原像素复算与筛选差异](public-transport-senoo-knottnerus.md#taiyi-原图复算) |
| 追查 P1 判决差异，并核对筛选前后的分母 | [39 处差异的阈值与坐标比较](knottnerus-p1-threshold-roi.md) · [剩余 26 处的固定窗口复算](knottnerus-p1-threshold-roi.md#固定窗口追查剩余-26-处) · [P1_58 首帧 ROI 3 的像素和与在线配置](knottnerus-p1-58-online-decision.md) |
| 检查 P1 的固定窗口和候选阈值能否在 S23 的 P2 重现在线位串 | [P2 同序列留出对照、差异轮号、两份入选名单和分母](knottnerus-s23-p2-holdout.md) · [P1 区间的 71 个阈值、五处原差异和三处新增差异](knottnerus-s23-p2-threshold-sweep.md) |
| 核对 P1 候选判据及 P2 日志相容区间在 S23/P3 上的表现 | [P3 同序列留出、三处差异和 55 轮首帧入选名单](knottnerus-s23-p3-holdout.md) |
| 检验 P3 吻合的 6499–6507 能否复现 S23/P4，并核对全部 P2 区间阈值 | [P4 同序列留出、P4_81 末帧差异及 53 轮入选分母](knottnerus-s23-p4-holdout.md) |
| 核对 P3、P4 共同吻合的阈值在 S23/P5 上的逐帧表现 | [P5 同序列留出、22 个判据与 60 轮首帧入选名单](knottnerus-s23-p5-holdout.md) |
| 补齐论文正式版或实验数据 | [待补清单](../MANUAL_DOWNLOAD.md) |

## 阅读范围

按 2026-11-17 的本地资料清单覆盖 111 个索引条目，包括 101 份 PDF、2 份图源工作簿和 14 个在线入口。6 篇同时保存作者稿和期刊版的作品有两个 PDF，按同一索引读。论文按与整机建模相关的核心正文、图表、Methods 或补充材料阅读。手册按可用接口和使用场景阅读。工作簿对照出版图与图注进行只读提取。对访问受限的页面或未获取的原始数据，条目写明查阅范围。

| 范围 | 索引条目 | 本地 PDF | 本地表 | 在线 |
| --- | ---: | ---: | ---: | ---: |
| ¹⁷¹Yb 及原子数据 | 41 | 44 | 0 | 3 |
| Senoo 出版方图源表 | 2 | 0 | 2 | 0 |
| 其他中性原子及通用量子计算基础 | 30 | 30 | 0 | 0 |
| 离子阱、超导、光量子、硅自旋、工程手册和工具 | 38 | 27 | 0 | 11 |

## 从文献进入模型的记录方式

1. **指明来自哪套装置。** 实验参数记录同位素、内部态、光波长与用途、温度或场、具体器件条件、单位和不确定度。文献值写明图、表、节或页。
2. **指明观测或推断的口径。** 把数据表测量点、基准反演值、理论预测、仪器能力和页面示意明确标注。误差记录是否按存活或无泄漏后选、是否做读出修正、使用了什么样本和分母。
3. **给出可验证的模型影响。** 位置、时序、状态和观测应能在同一序列下核对。作为标定输入的参数使用同装置数据，留出验证工作点另记。当前可先采用集成资料所支持的共用接口和显示检查。 [模型接口与验收](model-requirements.md)
