# Knottnerus S23/P14 双帧占位留出对照

**6499、6500 counts 在 P14 各有 0/7,200 处差异，仍是受检值中仅有的两个在 P3 至 P14 每批均与日志逐位吻合的阈值。** P14 的两帧日志和复算均判空，全部 22 个判据给出相同结果。P12、P13、P14 已连续三批没有占位阳性样本。这些批次核对了空位判决的一致性，区分各阈值的阳性识别能力仍需有占位的批次。[逐阈值结果](data/knottnerus-s23-p14/results/summary.json) · [P13 及此前的对照](https://github.com/seven-Jack/naqc-digital-twin/blob/v0.1.14/references/knowledge/knottnerus-s23-p13-holdout.md)

## 原始双帧、成像条件与冻结规则

本批取自 Knottnerus ⁸⁸Sr 公开序列 `241129_S23`，为 P13 之后的第一个参数点，保留原轮号 P14_1 至 P14_100。作者装置使用 813 nm 光阱和 689 nm 的 ¹S₀ ↔ ³P₁ 荧光成像。证据等级是 Knottnerus **同序列留出**，相对 Senoo ¹⁷¹Yb 平台属于**跨装置对照**。[作者数据集 v1，CC BY 4.0](https://doi.org/10.21942/uva.28166483.v1) · [论文](https://doi.org/10.21468/SciPostPhys.19.4.118)

- **帧与日志。** 完整作者 ZIP 通过官方 MD5 和归档 SHA-256 核对。P14 输入子包保留 354 个源成员及摘要。100 份 `P14_n.dat` 的序列、参数点与轮号均为 `(23, 14, n)`。每轮按原轮号将 `P14_n_1.tga` 与 Pic1、`P14_n_2.tga` 与 Pic2 配对，每帧各 36 个日志位。200 张原图摘要各异，均为 100×180、16 位小端灰度 TGA。2024-11-29 的轮级时标由 15:21:37.942 严格递增至 15:27:26.060。原件未注明时区和逐帧实际曝光时标。[输入成员与时标](data/knottnerus-s23-p14/source-manifest.json) · [逐轮位串与原日志路径](data/knottnerus-s23-p14/results/rounds.csv)
- **配置。** P1 与 P3 至 P14 的 ROI 文件、时序表、输出表分别逐字节一致，名义成像配置均为 20 个周期、12% 占空比、200 ms，验证帧启用。P14 控制文件的 `DRbRepumpDPAOMB2Intensity1` 为 14.00000，100 份逐轮日志的对应字段 `RbRepumpDPAOMB2Intensity1` 均为 0。实际施加值和全空的物理原因仍待核实。[控制字段与日志记录](data/knottnerus-s23-p14/source-manifest.json)
- **预冻结。** 在查看 P14 判决前，以 v0.1.14 中 P2 至 P13 的 12 份摘要为依据，从 P3 至 P13 每批零差异的阈值取交集，指定 6499、6500 为重点。固定 P1 的 36 个 3×3 矩形，直接累加每个窗口的九个像素，位移和背景扣除均为零。像素和严格大于整数 T 才判占。逐一检验候选 T=6436 和 P2 日志相容区间 6499–6519 内的 21 个整数。[冻结记录与历史依据](data/knottnerus-s23-p14/freeze.json)

## 两帧计数、阳性与差异轮号

| 观测 | 3×3 ROI 像素和（counts） | 日志占位阳性／位点数 | 每个阈值的复算阳性／位点数 |
| --- | ---: | ---: | ---: |
| Pic1 首帧 | 3,350–5,814 | 0/3,600 | 0/3,600 |
| Pic2 末帧 | 3,273–5,595 | 0/3,600 | 0/3,600 |

两帧的最大值均低于最低受检阈值 6,436 counts。日志与复算各有 0/100 轮出现占位阳性。[计数范围及位点表摘要](data/knottnerus-s23-p14/count-ranges.json) · [逐位点像素和、坐标与原图路径](data/knottnerus-s23-p14/results/sites.csv.gz)

| 受检 T（counts） | 判据数 | 每个 T 的 Pic1 差异／3,600 | 每个 T 的 Pic2 差异／3,600 | 差异原轮号 |
| --- | ---: | ---: | ---: | --- |
| 6436（候选） | 1 | 0 | 0 | 无 |
| 6499（重点） | 1 | 0 | 0 | 无 |
| 6500（重点） | 1 | 0 | 0 | 无 |
| 6501–6519（逐一检验） | 19 | 0 | 0 | 无 |

所有判据对照的是同一批 7,200 个双帧位点判决。差异原轮号为 `[]`，差异表只有表头。[逐阈值差异明细](data/knottnerus-s23-p14/results/differences.csv) · [独立核验的各阈值判决摘要](data/knottnerus-s23-p14/results/independent.json)

## 入选名单、筛选分母与满阵列

日志和复算分别以首帧至少占据 16/36 个位点为入选条件。**日志和每个阈值的入选名单均为空 `[]`，排除名单均为 P14_1 至 P14_100。** 满阵列按末帧中央 4×4 的 16 个目标位全部占据判定，零基 ROI 为 7–10、13–16、19–22、25–28。[各阈值名单与筛选分母](data/knottnerus-s23-p14/results/cohorts.csv)

| 首帧轮次集合 | 双帧位点判决数 | 末帧已占目标位／目标位 | 末帧满阵列轮数／轮数 |
| --- | ---: | ---: | ---: |
| 筛选前，100 轮 | 7,200 | 0/1,600 | 0/100 |
| 入选，0 轮 | 0 | 0/0（不可估计） | 0/0（不可估计） |
| 排除，100 轮 | 7,200 | 0/1,600 | 0/100 |

筛选前与排除组包含同一批 100 轮。入选组没有观测轮次，因此目标填充率和满阵列率均不可估计。

## Taiyi 回执及适用范围

Taiyi 在 2026-11-20 北京时间 09:40:54–09:40:55 完成作业。运行前已核对 13 项输入。主程序按窗口直接求和，独立程序从原始 TGA 和 DAT 以二维整数积分图复算。两种方法核对了 100 轮、200 帧、7,200 个位点帧、22 个判据和 198 条筛选记录，作业退出码为 0。六份主结果和单独回传的计数范围文件均通过 SHA-256 核对，计数范围文件同时记录了所用位点表的摘要。[输入校验](data/knottnerus-s23-p14/integrity.log) · [结果校验](data/knottnerus-s23-p14/result-sha256.txt) · [计数范围校验](data/knottnerus-s23-p14/count-ranges-sha256.txt) · [独立核验](data/knottnerus-s23-p14/results/independent.json) · [退出回执](data/knottnerus-s23-p14/compute-unit-final.log)

可用完整作者 ZIP 或来源清单对应的子包复算。[主程序](../../scripts/audit-knottnerus-s23-holdout.py) · [独立核验程序](../../scripts/verify-knottnerus-s23-holdout.py) · [当次作业脚本](data/knottnerus-s23-p14/taiyi/run.sh) · [计数范围脚本](data/knottnerus-s23-p14/taiyi/inspect_counts.py)

`sum > 6436 counts` 保留为候选判据，6499–6519 仅为 **P2 日志相容区间**。实际在线阈值仍待核实。Senoo CAL 继续接收同装置实测工作簿与原始日志，冻结读出规则后再开启独立 VAL。[Senoo 收件及正式验收](../../docs/RELEASE_EXECUTION_CHECKLIST.md#正式科研验收顺序)
