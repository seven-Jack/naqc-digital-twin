# Knottnerus S23/P13 双帧占位留出对照

**预先指定的 6499、6500 counts 在 P13 各有 0/7,200 处差异，仍是受检值中仅有的两个在 P3 至 P13 每批均与日志逐位吻合的阈值。** P13 与 P12 一样，100 轮 Pic1 和 Pic2 日志均判空。P13 的 22 个判据对同一批双帧给出了完全相同的判决。两批均可核对空位判决的一致性，均缺少用来区分阈值或估计占位漏检率的阳性样本。[P13 冻结规则和历史结果摘要](data/knottnerus-s23-p13/freeze.json) · [P13 逐阈值结果](data/knottnerus-s23-p13/results/summary.json) · [v0.1.13 的 P12 对照](https://github.com/seven-Jack/naqc-digital-twin/blob/v0.1.13/references/knowledge/knottnerus-s23-p12-holdout.md)

## 来源、双帧配对与成像条件

本次选取 Knottnerus ⁸⁸Sr 公开序列 `241129_S23` 中紧接 P12 的参数点 P13，保留原轮号 1–100，证据等级为**同序列留出**，相对 Senoo ¹⁷¹Yb 属于**跨装置对照**。作者装置使用 813 nm 光阱和 689 nm 的 ¹S₀ ↔ ³P₁ 荧光成像。已核对完整作者 ZIP 的官方 MD5、归档 SHA-256 及 Taiyi 输入子包中 350 个成员的来源与摘要。[作者数据 v1，CC BY 4.0](https://doi.org/10.21942/uva.28166483.v1) · [论文](https://doi.org/10.21468/SciPostPhys.19.4.118) · [来源与配置清单](data/knottnerus-s23-p13/source-manifest.json)

- **配对。** 100/100 份 `P13_n.dat` 的序列号、参数点和轮号均为 `(23, 13, n)`。以原轮号配对，`P13_n_1.tga` 对应 Pic1，`P13_n_2.tga` 对应 Pic2，每帧 36 个日志位。200 张原图均为 100×180、16 位小端灰度 TGA，图像摘要各异。2024-11-29 的轮级时标从 15:15:47.655 严格递增至 15:21:34.232。原件未记录时区和逐帧实际曝光时标。[逐轮位串、原始日志路径与时标](data/knottnerus-s23-p13/results/rounds.csv)
- **配置。** P1 与 P3 至 P13 的 ROI 文件、时序表和输出表分别逐字节相同。名义成像设置为 20 个周期、12% 占空比、200 ms，启用验证帧。P13 控制文件中扫描字段 `DRbRepumpDPAOMB2Intensity1` 为 13.00000，全部 100 份 DAT 对应字段 `RbRepumpDPAOMB2Intensity1` 为 0。实际施加值与全空的物理原因仍待核实。[控制设定与日志字段](data/knottnerus-s23-p13/source-manifest.json)
- **冻结。** 在查看 P13 差异前，依据 v0.1.13 中 P2 至 P12 的 11 份归档结果，取 P3 至 P12 各批吻合值的交集，指定 6499、6500 为本批重点。保留 P1 的 36 个 3×3 原始矩形，直接累加九个像素，位移和背景扣除均为零。像素和严格大于 T 时判占，等于 T 时判空。受检判据包含候选 T=6436，以及 P2 日志相容区间 6499–6519 的全部整数。[预冻结记录](data/knottnerus-s23-p13/freeze.json)

## 两帧计数范围、占位阳性与差异原轮号

| 帧 | 3×3 ROI 像素和范围（counts） | 日志占位阳性／位点数 | 每个受检判据的复算占位阳性／位点数 |
| --- | ---: | ---: | ---: |
| Pic1（首帧） | 3,326–5,551 | 0/3,600 | 0/3,600 |
| Pic2（末帧） | 3,365–5,467 | 0/3,600 | 0/3,600 |

两帧最大值均低于最低受检阈值 6,436 counts。日志与复算的阳性轮数均为 0/100。计数范围摘要记录了所用逐位点表的 SHA-256。[计数范围与日志占位数](data/knottnerus-s23-p13/count-ranges.json) · [逐位点原图路径、ROI 坐标和像素和](data/knottnerus-s23-p13/results/sites.csv.gz)

| T（counts） | 判据数 | 每个 T 的 Pic1 差异／3,600 | 每个 T 的 Pic2 差异／3,600 | 差异原轮号 |
| --- | ---: | ---: | ---: | --- |
| 6436（候选） | 1 | 0 | 0 | 无 |
| 6499（重点） | 1 | 0 | 0 | 无 |
| 6500（重点） | 1 | 0 | 0 | 无 |
| 6501–6519（逐一检验） | 19 | 0 | 0 | 无 |

全批差异轮号为 `[]`。逐阈值差异表只有表头，逐轮与逐位点表保留了全部观测。[差异明细](data/knottnerus-s23-p13/results/differences.csv) · [各阈值判决摘要](data/knottnerus-s23-p13/results/independent.json)

## 首帧入选名单、筛选分母与满阵列数

以首帧至少占据 16/36 个位点为入选条件，分别对日志和复算位串筛选。**日志和每个阈值的首帧入选名单均为 `[]`，排除名单均为 P13_1 至 P13_100。** 末帧中央 4×4 的 16 个目标位全部占据才计为一次满阵列，对应零基 ROI 7–10、13–16、19–22、25–28。[逐阈值名单与分母](data/knottnerus-s23-p13/results/cohorts.csv)

| 轮次集合 | 双帧位点判决数 | 末帧已占目标位／目标位 | 末帧满阵列轮数／轮数 |
| --- | ---: | ---: | ---: |
| 筛选前，100 轮 | 7,200 | 0/1,600 | 0/100 |
| 入选，0 轮 | 0 | 0/0（不可估计） | 0/0（不可估计） |
| 排除，100 轮 | 7,200 | 0/1,600 | 0/100 |

筛选前和排除组包含同一批 100 轮。入选组分母为零，因此入选后的目标填充率和满阵列率均不可估计。

## Taiyi 复算及适用范围

2026-11-20 北京时间 09:21:18–09:21:19，Taiyi 核对 13 项输入后，完成逐 ROI 原始像素求和、独立整数积分图复算和两帧计数范围统计。独立程序以原始 DAT 和 TGA 核对 100 轮、200 帧、7,200 个位点帧、22 个判据、198 条筛选记录和零条差异，作业退出码为 0。六份主结果和单独回传的计数范围摘要均核对了 SHA-256。[输入校验](data/knottnerus-s23-p13/integrity.log) · [六份主结果摘要](data/knottnerus-s23-p13/result-sha256.txt) · [计数范围校验](data/knottnerus-s23-p13/count-ranges-sha256.txt) · [独立核验](data/knottnerus-s23-p13/results/independent.json) · [作业退出回执](data/knottnerus-s23-p13/compute-unit-final.log)

复算使用原始作者 ZIP 或按来源清单构建的子包。运行脚本按顺序执行主复算、独立核验和计数范围统计。[主程序](../../scripts/audit-knottnerus-s23-holdout.py) · [独立程序](../../scripts/verify-knottnerus-s23-holdout.py) · [当次 Taiyi 运行脚本](data/knottnerus-s23-p13/taiyi/run.sh) · [计数范围脚本](data/knottnerus-s23-p13/taiyi/inspect_counts.py)

`sum > 6436 counts` 保留为候选判据。6499–6519 仅为 **P2 日志相容区间**。实际在线阈值仍待核实。Senoo CAL 继续接收同装置实测工作簿和原始日志，冻结读出规则后再开启独立 VAL。[Senoo 正式验收与收件](../../docs/RELEASE_EXECUTION_CHECKLIST.md#正式科研验收顺序)
