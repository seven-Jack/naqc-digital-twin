# Knottnerus S23/P4 双帧占位留出对照

**在 P3 全部吻合的 6499–6507 counts，9 个整数阈值逐一重现了 P4 的全部 7,200 个日志位。** P2 日志相容区间中其余 12 个整数阈值（6508–6519）在 P4 也全部吻合。沿用 P1 的候选判据 `sum > 6436 counts` 时，仅 P4_81 末帧出现一处差异。该轮首帧有 13 个占位，按至少 16 个的规则排除；全部 22 个受检判据与日志均选中相同的 53 轮。[事前冻结的判据与 P3 重点区间](data/knottnerus-s23-p4/freeze.json) · [逐阈值结果](data/knottnerus-s23-p4/results/summary.json)

## 原图、坐标和日志

证据等级为 **Knottnerus ⁸⁸Sr 同序列留出、相对 Senoo ¹⁷¹Yb 的跨装置对照**。作者装置使用 813 nm 光阱和 689 nm 的 ¹S₀ ↔ ³P₁ 荧光成像。选用公开序列 `241129_S23` 中紧随 P3 的第四个参数点，纳入 P4_1 至 P4_100 全部原轮号。完整公开 ZIP 的 MD5 和 SHA-256 已核对，Taiyi 工作子包含 322 个逐项校验的源文件。[作者数据 v1，CC BY 4.0](https://doi.org/10.21942/uva.28166483.v1) · [论文及原始附件](https://www.dare.uva.nl/id/e2c1c6fa-bc32-450d-bc90-c3524281e2d8) · [来源与配对清单](data/knottnerus-s23-p4/source-manifest.json)

- **双帧配对。** 每轮 `P4_n.dat` 的 `Series=23`、`DataSetNr=4`、`RunNr=n` 与文件名一致。`P4_n_1.tga`、`P4_n_2.tga` 分别与 `Pic1`、`Pic2` 的 36 位判决配对，共 100/100 轮。200 张原图均为 100×180、16 位小端 TGA。轮级时标自 2024-11-29 14:23:11.306 至 14:28:48.428 递增，原件未注明时区或逐帧实测曝光时标。[逐轮时标、位串和原件路径](data/knottnerus-s23-p4/results/rounds.csv)
- **成像条件。** P1、P3、P4 的 36 个 ROI 矩形、时序表和输出表分别逐字节相同。名义成像设置均为 20 个周期、12% 占空比、200 ms，并启用验证帧。三组控制文本的参数点字段 `DRbRepumpDPAOMB2Intensity1` 依次为 1、3、4；实际曝光和在线比较阈值仍缺相机端记录。[原始配置与核对结果](data/knottnerus-s23-p4/results/summary.json)
- **冻结判读。** 对 P4 原图使用 `P1ROIs.dat` 的原始半开矩形，直接累加固定 3×3 窗口的九个像素，不移动中心、不扣背景。仅当像素和严格大于整数阈值 T 时判占。先核对候选基线 6436，再逐一核对 6499–6519。每个 T 均使用同一批 100 轮。[P2 区间来源](https://github.com/seven-Jack/naqc-digital-twin/blob/v0.1.3/references/knowledge/knottnerus-s23-p2-threshold-sweep.md) · [P3 留出结果](https://github.com/seven-Jack/naqc-digital-twin/blob/v0.1.4/references/knowledge/knottnerus-s23-p3-holdout.md) · [7,200 个位点帧计数](data/knottnerus-s23-p4/results/sites.csv.gz)

## 阈值与差异轮号

| T（counts，含端点） | 受检 T 数 | 每个 T 的首帧差异 / 3,600 | 每个 T 的末帧差异 / 3,600 | 每个 T 的末帧目标区差异 / 1,600 | P4 日志全部吻合的 T 数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 6436（候选） | 1 | 0 | 1 | 1 | 0/1 |
| 6499–6507（P3 全部吻合） | 9 | 0 | 0 | 0 | 9/9 |
| 6508–6519（P3 曾出现差异） | 12 | 0 | 0 | 0 | 12/12 |

唯一的差异发生在 **P4_81 的 Pic2、零基 ROI 14**，位于内部 4×4 目标阵列。原图 `P4_81_2.tga` 的列 43–45、行 122–124 合计 **6460 counts**。在 T=6436 时像素判占，轮日志 `P4_81.dat` 的 `Pic2` 对应位为 0。末帧目标占位因此由日志的 0/16 变为复算的 1/16。全部 21 个 P2 区间阈值都高于 6460，在该处复现判空。仪器判空时使用的在线阈值和比较前读数仍待原始记录核实。[差异行、矩形边界、源图和日志](data/knottnerus-s23-p4/results/differences.csv)

## 首帧入选名单和筛选分母

日志与每个冻结判据都按首帧 36 位中至少 16 位占据独立筛选。以下为全部 22 个判据及日志共有的 53 个入选原轮号，省略前缀 `P4_`。[逐阈值入选、排除和交集名单](data/knottnerus-s23-p4/results/cohorts.csv)

1、2、3、5、9、10、15、16、17、19、20、23、25、28、30、31、32、33、35、36、37、38、43、44、45、52、54、55、60、61、64、65、67、68、70、71、73、74、75、76、77、78、80、83、84、86、88、94、95、96、97、98、99。

| 轮次集合 | 双帧位点分母 | 日志末帧目标填充 | T = 6436 末帧目标填充 | 每个 T = 6499–6519 末帧目标填充 | 日志及全部判据的末帧满阵列 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 筛选前 100 轮 | 7,200 | 834/1,600 | 835/1,600 | 834/1,600 | 38/100 |
| 首帧入选 53 轮 | 3,816 | 833/848 | 833/848 | 833/848 | 38/53 |
| 首帧排除 47 轮 | 3,384 | 1/752 | 2/752 | 1/752 | 0/47 |

目标填充以每轮 16 个目标位为分母，满阵列比例以轮为分母。候选判据相对日志多判的一个目标位全部落在排除的 47 轮中。只比较入选后的 833/848 或 38/53，会漏掉 P4_81 的双帧判决差异。

## Taiyi 核验与适用范围

Taiyi 于 2026-11-19 北京时间 18:23:06–18:23:07 完成主复算和独立核验。主程序按 P1 矩形逐行求和，独立程序从 P4 原件重读日志并以二维积分图求和。两份实现核对了 100 轮、200 帧、7,200 个像素和及日志位、22 个判决位串摘要、全部差异和 198 组筛选名单与分母。6 份返回结果均通过 SHA-256 复核。[独立核验](data/knottnerus-s23-p4/results/independent.json) · [输入校验清单](data/knottnerus-s23-p4/input-sha256.txt) · [输出校验清单](data/knottnerus-s23-p4/result-sha256.txt) · [作业退出回执](data/knottnerus-s23-p4/compute-unit-final.log)

从仓库根目录可对作者 v1 的完整 ZIP 重放；主程序创建新的结果目录。两份 P4 脚本按哈希载入同目录已发布的 P2/P3 函数，独立复核使用 NumPy。[P4 主复算脚本](../../scripts/audit-knottnerus-s23-p4.py) · [独立核验脚本](../../scripts/verify-knottnerus-s23-p4.py)

```sh
python3 -B scripts/audit-knottnerus-s23-p4.py Datapackage_SLM.zip references/knowledge/data/knottnerus-s23-p4/source-manifest.json p4-results
python3 -B scripts/verify-knottnerus-s23-p4.py Datapackage_SLM.zip p4-results p4-results/independent.json
```

保留 `>6436 counts` 为候选判据，6499–6519 的名称仍为 **P2 日志相容区间**。P4 约束的是同一 ⁸⁸Sr 序列中冻结判决与保存位串的一致性。Senoo ¹⁷¹Yb 正式 CAL 已恢复收件，尚缺同装置先导工作簿与原始日志；独立 VAL 等待 CAL 完成并冻结规则后开启。[正式验收入件状态](https://github.com/seven-Jack/naqc-digital-twin/blob/v0.1.5/docs/RELEASE_EXECUTION_CHECKLIST.md#正式科研验收顺序)
