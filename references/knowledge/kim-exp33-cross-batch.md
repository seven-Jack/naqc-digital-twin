# Kim Exp34 读出参数在 Exp33 的跨批次验证

**证据等级为跨装置对照。** 两个批次来自 Kim 等人的同一台 ⁸⁷Rb 装置。论文记录了相同的 198 个光镊位点、Andor iXon Ultra 888 相机和双帧荧光成像流程。第一帧在装载后拍摄，第二帧在里德堡演化结束、重新开启光镊后拍摄。表 2 将两组都列入 SPAM2，失谐均从 −4.0 MHz 扫至 2.5 MHz。Exp33 的扫描时长为 4.0 µs，共 5,636 轮，Exp34 为 4.5 µs，共 3,479 轮。此处的时长指 AQC 扫描。逐批相机曝光时间、EM 增益和相机序列号仍缺独立设置记录。 [论文 Methods、表 2 和 Data Records](https://pmc.ncbi.nlm.nih.gov/articles/PMC10805775/) · [公开原始 TIFF](https://doi.org/10.25452/figshare.plus.24523198.v1) · [公开 MAT](https://doi.org/10.6084/m9.figshare.23828004.v1)

## 冻结参数与比较口径

项目已将 Exp34 至 Exp33 的五次 Taiyi 作业列入同一份可复核的结项清单。 [归档 SHA-256](data/kim-exp33-exp34-final.sha256) · [结项记录与校验命令](../../docs/RELEASE_EXECUTION_CHECKLIST.md#kim-公开双帧专题结项)

Exp33 有四个 TIFF 分件，Exp34 有三个。分件编号表示文件顺序。验证前选定 Exp34 X1／X2 共同的 198 个中心用于全部 Exp33 页，另用 Exp34 X3 的 198 个中心处理同一批页，检验对坐标选择的敏感性。两套预测均使用 Exp34 从像素重选的 198 个阈值。源表 SHA-256 固定于工作包。 [Exp34 逐位点 ROI](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/returned-results/roi-centers.csv) · [Exp34 冻结阈值](../library/neutral-atoms/kim-mis-figshare-v1/exp34-pairs-taiyi-20261119T053434Z/returned-results/threshold-comparison.csv)

从 Exp33 原始像素计算 5 × 5 ROI 均值，按每个位点的冻结阈值对两帧分别判占位（计数 ≥ 阈值）。先生成两个坐标方案的全批预测，再读取 Exp33 MAT 中的计数和占位数组作对照。以单帧位点、同一位点的有序双帧对、整轮阵列为三个分母。跨文件的双帧按全局页序配对，分件统计按第一帧所在文件归属位点对。 [验证脚本](../../scripts/validate-kim-cross-batch.py)

ROI 偏移诊断使用 Exp33 自身的归档计数。在每个分件内，用全局轮号除以 4 余 1 的整轮定位，在公开初始坐标的 ±5 px 范围内枚举 121 个中心，其余整轮留出。下文以定位帧的唯一精确解且留出计数完全一致作为坐标确认条件。偏移量以 Exp34 X1／X2 的固定中心为原点，横纵分别对应 TIFF 列与行。诊断继续使用 Exp34 阈值，主验证保留冻结预测的原始差异。

## 全批次冻结结果

| 与 Exp33 归档比较 | 分母 | Exp34 X1／X2 坐标（主结果） | Exp34 X3 坐标 |
| --- | ---: | ---: | ---: |
| ROI 计数不同的位点帧 | 2,231,856 | 1,422,831（63.751%） | 429,269（19.234%） |
| 占位判决不同的位点帧 | 2,231,856 | 8,829（0.396%） | 5,084（0.228%） |
| 至少一帧判决不同的有序位点对 | 1,115,928 | 8,810（0.789%） | 5,073（0.455%） |
| 至少一个位点对不同的整轮 | 5,636 | 4,283（75.994%） | 3,237（57.434%） |

主结果的平均绝对计数差为 3.197 counts，最大为 45.40 counts。归档判为 0 而重算为 1 的有 4,416 个位点帧，反向差异有 4,413 个。X3 坐标在全批次上的平均绝对计数差降至 0.859 counts，但在 Exp33 首分件上的最大绝对差达 182.36 counts。两套坐标的阈值均取自 Exp34。 [结果摘要](../library/neutral-atoms/kim-mis-figshare-v1/exp33-cross-taiyi-20261119T054858Z/returned-results/summary.json) · [逐位点统计与阈值](../library/neutral-atoms/kim-mis-figshare-v1/exp33-cross-taiyi-20261119T054858Z/returned-results/sites.csv)

| Exp33 分件 | 页数 | 计数差异／位点帧 | 占位差异／位点帧 | 双帧差异／有序位点对 |
| --- | ---: | ---: | ---: | ---: |
| X1 | 1,202 | 19,174 / 237,996 | 393 / 237,996 | 393 / 118,998 |
| X2 | 5,000 | 698,026 / 990,000 | 4,235 / 990,000 | 4,224 / 495,000 |
| X3 | 5,000 | 697,952 / 990,000 | 4,157 / 990,000 | 4,149 / 495,000 |
| X4 | 70 | 7,679 / 13,860 | 44 / 13,860 | 44 / 6,930 |

上表各分件均使用主结果的坐标。11,272 页构成 5,636 个完整双帧轮次，四个文件均在第二帧结束，跨分件轮数为 0。按 `00/01/10/11` 顺序，归档的有序位点对数分别为 498,148、13,624、223,589、380,567，主结果分别为 497,677、13,776、224,376、380,099。逐轮表保留第一、第二帧各自的计数与占位差异，逐对表保留双方两帧原值。 [逐轮页序与差异](../library/neutral-atoms/kim-mis-figshare-v1/exp33-cross-taiyi-20261119T054858Z/returned-results/rounds.csv) · [1,115,928 个有序位点对](../library/neutral-atoms/kim-mis-figshare-v1/exp33-cross-taiyi-20261119T054858Z/returned-results/pairs.csv.gz)

## ROI 偏移和阈值的影响

| Exp33 分件 | 定位／留出帧 | 相对冻结坐标有偏移的位点 | 留出位点帧 | 修正坐标前 → 后的计数差异 | 保留 Exp34 阈值时占位差异 |
| --- | ---: | ---: | ---: | ---: | ---: |
| X1 | 302 / 900 | 16 / 198 | 178,200 | 14,356 → 0 | 304 → 253 |
| X2 | 1,250 / 3,750 | 140 / 198 | 742,500 | 523,531 → 0 | 3,208 → 1,257 |
| X3 | 1,250 / 3,750 | 140 / 198 | 742,500 | 523,451 → 0 | 3,195 → 1,289 |
| X4 | 16 / 54 | 110 / 198 | 10,692 | 5,925 → 0 | 34 → 18 |

792 个分件与位点组合均得到唯一且通过留出核对的坐标。各轴最大绝对偏移为 1 px。X2 和 X3 各有 81 个位点仅列加 1，36 个位点列加 1 且行减 1。采用 Exp33 诊断坐标后，1,673,892 个留出位点帧的计数全部与归档一致。此时沿用 Exp34 阈值，仍有 2,817 个占位差异，说明相同的像素计数在两批阈值下可以给出不同判决。Exp33 归档阈值减去 Exp34 冻结阈值的范围为 −4.903 至 +7.303 counts。用 Exp33 归档计数及其自身阈值可重现全部归档判决。 [逐位点偏移、候选及留出差异](../library/neutral-atoms/kim-mis-figshare-v1/exp33-cross-taiyi-20261119T054858Z/returned-results/roi-diagnostic.csv) · [Exp33 原始 MAT](../library/neutral-atoms/kim-mis-figshare-v1/exp33-cross-taiyi-20261119T054858Z/raw/Exp33.mat)

四个 TIFF 和 MAT 共 3,703,949,972 字节，均通过 Figshare 登记字节数和 MD5 核验。Taiyi 独立目录为 `/home/HXLIU/Exp34/cross-exp33-20261119T054858Z`，原始 TIFF 保存在该目录的 `raw/`。回传结果含各原件的 SHA-256、七个 TIFF 的首页标签和 Exp33 MAT 变量目录。公开数据支持同装置、同公开成像流程下相对于作者归档判决的跨批次比较。实验中的实际占位真值、批间坐标变化的物理原因，以及逐批曝光和增益仍待独立证据。**Senoo 正式 CAL／VAL 继续暂缓。** [原件与哈希](../library/neutral-atoms/kim-mis-figshare-v1/exp33-cross-taiyi-20261119T054858Z/public-integrity.json) · [相机元数据](../library/neutral-atoms/kim-mis-figshare-v1/exp33-cross-taiyi-20261119T054858Z/acquisition-metadata.json) · [回传核验](../library/neutral-atoms/kim-mis-figshare-v1/exp33-cross-taiyi-20261119T054858Z/returned-verification.log)

## Exp33 同批次阈值复现与 2,817 个留出差异的归因

**跨装置对照，⁸⁷Rb。** Taiyi 固定上一步核实的 792 个分件 ROI，重新从四份 TIFF 计算每页的 5 × 5 像素均值。每个位点使用全部 11,272 帧，在均值 −45 到均值 +75 counts 之间分 70 个等宽箱，选第 10 至 25 箱内首个最低频数箱的左边界。198/198 个阈值与 Exp33 MAT 的差值均在 $10^{-9}$ counts 容差内，最大绝对差为 $4.32\times10^{-12}$ counts。两帧共用同一位点阈值，判决使用“计数 ≥ 阈值”。 [198 个位点的阈值、箱号和差值](../library/neutral-atoms/kim-mis-figshare-v1/exp33-thresholds-taiyi-20261119T071414Z/returned-results/sites.csv) · [箱边界与频数](../library/neutral-atoms/kim-mis-figshare-v1/exp33-thresholds-taiyi-20261119T071414Z/returned-results/histograms.json)

| 比较范围 | 位点帧 | 计数差异 | 占位差异，Exp34 阈值 → Exp33 阈值 | 有序位点对 | 双帧差异，Exp34 阈值 → Exp33 阈值 |
| --- | ---: | ---: | ---: | ---: | ---: |
| X1 的 ROI 留出帧 | 178,200 | 0 | 253 → 0 | 89,100 | 253 → 0 |
| X2 的 ROI 留出帧 | 742,500 | 0 | 1,257 → 0 | 371,250 | 1,255 → 0 |
| X3 的 ROI 留出帧 | 742,500 | 0 | 1,289 → 0 | 371,250 | 1,288 → 0 |
| X4 的 ROI 留出帧 | 10,692 | 0 | 18 → 0 | 5,346 | 18 → 0 |
| 留出合计，4,227 轮 | 1,673,892 | 0 | **2,817 → 0** | 836,946 | 2,814 → 0 |
| 全批次，5,636 轮（含留出） | 2,231,856 | 0 | **3,708 → 0** | 1,115,928 | 3,704 → 0 |

对每个原差异固定像素计数，只切换阈值。2,817 个计数全部与归档精确相同，且均落在两个阈值之间（含低端、不含高端）。其中 727 个判决由 0 改为 1，2,090 个由 1 改为 0，全部与 Exp33 归档相符，新增差异为 0。例如第 18 轮第 63 位点的第一帧为 560.48 counts，Exp34 阈值为 560.9820，Exp33 阈值为 559.6449，归档判为 1。以上归因针对使用 Exp33 坐标后剩余的差异。上一节使用 Exp34 坐标与阈值的冻结预测仍是跨批次验证结果。 [逐帧归因明细](../library/neutral-atoms/kim-mis-figshare-v1/exp33-thresholds-taiyi-20261119T071414Z/returned-results/affected-frames.csv) · [按分件核验](../library/neutral-atoms/kim-mis-figshare-v1/exp33-thresholds-taiyi-20261119T071414Z/returned-results/summary.json)

在 Exp33 重算阈值下，5,636 轮中有判决差异的整轮数为 0。按 `00/01/10/11` 顺序，复算与归档均为 498,148、13,624、223,589、380,567 对。留出帧用于核对上轮 ROI，同时参与了本轮全批阈值选取。证据支持 Kim 公开数据的同批次重建与差异归因，本专题据此结项。科研正式版继续按同装置验收清单推进。 [逐轮双帧核对](../library/neutral-atoms/kim-mis-figshare-v1/exp33-thresholds-taiyi-20261119T071414Z/returned-results/rounds.csv) · [三套有序判决数组](../library/neutral-atoms/kim-mis-figshare-v1/exp33-thresholds-taiyi-20261119T071414Z/returned-results/ordered-pairs.npz) · [核验记录](../library/neutral-atoms/kim-mis-figshare-v1/exp33-thresholds-taiyi-20261119T071414Z/returned-verification.log) · [发布验收清单](../../docs/RELEASE_EXECUTION_CHECKLIST.md)
