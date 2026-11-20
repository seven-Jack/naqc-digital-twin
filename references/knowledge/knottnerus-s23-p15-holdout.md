# Knottnerus S23/P15 双帧占位留出对照

**预先指定的 6499、6500 counts 在 P15 各有 0/7,200 处差异。在受检阈值中，只有这两个值在 P3 至 P15 每批都与 Pic1／Pic2 日志逐位吻合。** P15 的 100 轮双帧日志全部判空，其余受检阈值在本批也全部吻合。P12 至 P15 连续四批均无占位阳性样本，可核对相对日志的空位判决一致性，无法区分这些阈值对占位的识别能力。[各阈值判决摘要](data/knottnerus-s23-p15/results/summary.json) · [截至 P14 的对照](https://github.com/seven-Jack/naqc-digital-twin/blob/v0.1.15/references/knowledge/knottnerus-s23-p14-holdout.md)

## 原图、配对与预冻结

本批取自 Knottnerus ⁸⁸Sr 装置的公开序列 `241129_S23`，使用 813 nm 光阱与 689 nm 的 ¹S₀ ↔ ³P₁ 荧光成像。取 P14 后的参数点 P15，保留原轮号 P15_1 至 P15_100。证据等级为**同序列留出**，相对 Senoo ¹⁷¹Yb 属于**跨装置对照**。[作者公开数据 v1，CC BY 4.0](https://doi.org/10.21942/uva.28166483.v1) · [论文](https://doi.org/10.21468/SciPostPhys.19.4.118)

- **输入配对。** 核对了完整作者 ZIP 的官方 MD5、归档 SHA-256 和 P15 输入子包的 358 个成员。100 份 `P15_n.dat` 的序列、参数点和轮号均为 `(23, 15, n)`。依原轮号将 `P15_n_1.tga` 配 Pic1、`P15_n_2.tga` 配 Pic2，每帧各 36 个日志位。200 张原图的文件摘要各异，均为 100×180、16 位小端灰度 TGA。轮级时标从 2024-11-29 15:27:29.760 严格递增至 15:33:18.787；时区与单帧实际曝光时标缺失。[来源、原图摘要与时标](data/knottnerus-s23-p15/source-manifest.json) · [逐轮位串与日志路径](data/knottnerus-s23-p15/results/rounds.csv)
- **成像条件。** P1 与 P3 至 P15 的 ROI 文件、时序表和输出表分别逐字节相同。名义成像设置均为 20 个周期、12% 占空比、200 ms，启用验证帧。P15 控制文件中的 `DRbRepumpDPAOMB2Intensity1` 为 15.00000，而 100 轮 DAT 的对应字段 `RbRepumpDPAOMB2Intensity1` 均为 0。实际施加值与本批全部判空的物理原因仍待核实。[控制设置及日志字段](data/knottnerus-s23-p15/source-manifest.json)
- **冻结判据。** 在查看 P15 判决前，使用 v0.1.15 的 P2 至 P14 共 13 份归档摘要核对阈值来源，从 P3 至 P14 各批零差异值取交集，预先指定 6499、6500。保留 P1 的 36 个 3×3 矩形窗口，不移动或扣除背景。九个原始像素之和严格大于整数 T 时判占，等于 T 时判空。检验候选 T=6436 与 6499–6519 全部 21 个整数，各判据均使用相同的 7,200 个位点帧。[冻结规则与历史摘要](data/knottnerus-s23-p15/freeze.json)

## 两帧计数、阳性和差异轮号

| 帧 | 3×3 ROI 像素和范围（counts） | 日志占位阳性／位点数 | 每个受检判据的复算阳性／位点数 |
| --- | ---: | ---: | ---: |
| Pic1 首帧 | 3,328–6,100 | 0/3,600 | 0/3,600 |
| Pic2 末帧 | 3,341–5,962 | 0/3,600 | 0/3,600 |

两帧的最高计数均低于最低受检阈值 6,436。分帧统计时，首帧和末帧各有 0/100 轮出现日志或复算占位阳性。[计数范围与对应位点表摘要](data/knottnerus-s23-p15/count-ranges.json) · [逐位点像素和、原图与 ROI 坐标](data/knottnerus-s23-p15/results/sites.csv.gz)

| 受检 T（counts） | 判据数 | 每个 T 的首帧差异／3,600 | 每个 T 的末帧差异／3,600 | 差异原轮号 |
| --- | ---: | ---: | ---: | --- |
| 6436（候选） | 1 | 0 | 0 | 无 |
| 6499（重点） | 1 | 0 | 0 | 无 |
| 6500（重点） | 1 | 0 | 0 | 无 |
| 6501–6519（逐一检验） | 19 | 0 | 0 | 无 |

全部 22 个判据的差异轮号均为 `[]`，差异表只有表头。[逐阈值差异明细](data/knottnerus-s23-p15/results/differences.csv) · [独立逐阈值核验](data/knottnerus-s23-p15/results/independent.json)

## 首帧入选名单、筛选分母与满阵列数

日志和复算分别应用首帧至少占据 16/36 个位点的条件。**日志与每个阈值的首帧入选名单均为 `[]`，排除名单均为 P15_1 至 P15_100。** 末帧中央 4×4 的 16 个目标位全部占据才计为一次满阵列，对应零基 ROI 7–10、13–16、19–22、25–28。[逐阈值名单与筛选分母](data/knottnerus-s23-p15/results/cohorts.csv)

| 首帧轮次集合 | 双帧位点判决数 | 末帧已占目标位／目标位 | 末帧满阵列轮数／轮数 |
| --- | ---: | ---: | ---: |
| 筛选前，100 轮 | 7,200 | 0/1,600 | 0/100 |
| 入选，0 轮 | 0 | 0/0（不可估计） | 0/0（不可估计） |
| 排除，100 轮 | 7,200 | 0/1,600 | 0/100 |

筛选前和排除组包含同一批 100 轮。入选组没有观测轮次，因此目标填充率和满阵列率均不可估计。

## Taiyi 复算与适用范围

2026-11-20 北京时间 10:00:11–10:00:12，Taiyi 核对 13 项作业输入后执行复算。主程序直接累加每个位点的九个原始像素，独立程序从原始 DAT 和 TGA 用二维整数积分图求和。核对覆盖 100 轮、200 帧、7,200 个位点帧、22 个判据及 198 条筛选记录，作业退出码为 0。六份主结果及单独回传的计数范围文件均已核对 SHA-256，计数范围文件也与所用位点表的摘要一致。[输入校验](data/knottnerus-s23-p15/integrity.log) · [六份结果摘要](data/knottnerus-s23-p15/result-sha256.txt) · [计数范围校验](data/knottnerus-s23-p15/count-ranges-sha256.txt) · [独立核验](data/knottnerus-s23-p15/results/independent.json) · [退出回执](data/knottnerus-s23-p15/compute-unit-final.log)

可使用完整作者 ZIP 或来源清单指定的子包复算。[主程序](../../scripts/audit-knottnerus-s23-holdout.py) · [独立程序](../../scripts/verify-knottnerus-s23-holdout.py) · [当次 Taiyi 作业脚本](data/knottnerus-s23-p15/taiyi/run.sh) · [计数范围脚本](data/knottnerus-s23-p15/taiyi/inspect_counts.py)

`sum > 6436 counts` 保留为候选判据，6499–6519 仅为 **P2 日志相容区间**。实际在线阈值仍待核实。Senoo CAL 继续接收同装置实测工作簿与原始日志，冻结读出规则后再开启独立 VAL。[Senoo 收件与正式验收](../../docs/RELEASE_EXECUTION_CHECKLIST.md#正式科研验收顺序)
