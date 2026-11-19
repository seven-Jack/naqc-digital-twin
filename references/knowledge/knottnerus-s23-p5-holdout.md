# Knottnerus S23/P5 双帧占位留出对照

**在 P3、P4 全部吻合的 6499–6507 counts，9 个整数阈值在 P5 也分别重现了全部 7,200 个日志位。** P2 日志相容区间的其余 12 个阈值（6508–6519）和 P1 候选判据 `sum > 6436 counts` 在 P5 同样全部吻合。逐轮对照没有差异轮号，日志和全部 22 个判据均选中相同的 60/100 轮。所有阈值都在同一批原图上检验。[冻结记录](data/knottnerus-s23-p5/freeze.json) · [逐阈值结果与名单](data/knottnerus-s23-p5/results/summary.json)

## 来源、双帧和坐标核对

P5 为 Knottnerus ⁸⁸Sr 的**同序列留出**，相对 Senoo ¹⁷¹Yb 标记为**跨装置对照**。作者装置使用 813 nm 光阱和 689 nm 的 ¹S₀ ↔ ³P₁ 荧光成像。按原序列取 `241129_S23` 中 P4 之后的 P5，保留原轮号 1–100。作者 v1 ZIP 的官方 MD5 和已归档的 SHA-256 均已核实，P5 工作子包有 318 个逐项校验的成员。[作者数据 v1，CC BY 4.0](https://doi.org/10.21942/uva.28166483.v1) · [论文与公开附件](https://www.dare.uva.nl/id/e2c1c6fa-bc32-450d-bc90-c3524281e2d8) · [原件路径、校验值与成像设置](data/knottnerus-s23-p5/source-manifest.json)

- **原图与日志。** 100/100 份 `P5_n.dat` 的 `(Series, DataSetNr, RunNr)` 与 `(23, 5, n)` 一致。每轮 `P5_n_1.tga` 对应 `Pic1`，`P5_n_2.tga` 对应 `Pic2`，各为 36 位。200 张原图均为 100×180 的 16 位小端灰度 TGA，200 个文件哈希各不相同。轮级时标自 2024-11-29 14:28:52.058 至 14:34:31.175 递增。原件未注明时区和逐帧实测曝光时标。[逐轮位串、时标和原件路径](data/knottnerus-s23-p5/results/rounds.csv)
- **成像设置。** P1、P3、P4、P5 的 ROI 矩形文件、时序表和输出表分别逐字节相同。四组控制文本均设 20 个周期、12% 占空比、200 ms 名义成像时长，并启用验证帧。扫描控制字段 `DRbRepumpDPAOMB2Intensity1` 在这四组依次为 1、3、4、5。该字段记录控制器设置。[配置比对及来源清单](data/knottnerus-s23-p5/source-manifest.json)
- **像素判读。** 按 P1 的 36 个原图半开矩形直接累加各固定 3×3 窗口，不移动中心、不扣背景。仅在像素和严格大于 T 时判占，恰等于 T 时判空。冻结记录给出 P2、P3 和 P4 结果的 SHA-256，可追溯本轮预先指定的阈值和重点区间。[7,200 条位点帧像素和与坐标](data/knottnerus-s23-p5/results/sites.csv.gz) · [P2 区间来源](https://github.com/seven-Jack/naqc-digital-twin/blob/v0.1.3/references/knowledge/knottnerus-s23-p2-threshold-sweep.md) · [P3 对照](https://github.com/seven-Jack/naqc-digital-twin/blob/v0.1.4/references/knowledge/knottnerus-s23-p3-holdout.md) · [P4 对照](https://github.com/seven-Jack/naqc-digital-twin/blob/v0.1.5/references/knowledge/knottnerus-s23-p4-holdout.md)

## 各阈值与差异轮号

下表的分母均针对单个 T。每一帧有 100 轮 × 36 个位点，末帧目标区为内部 4×4（零基 ROI 7–10、13–16、19–22、25–28）。

| T（counts，含端点） | 全部吻合的阈值数 | 首帧差异／3,600 | 末帧差异／3,600 | 其中末帧目标区差异／1,600 | 差异轮号 |
| --- | ---: | ---: | ---: | ---: | --- |
| 6436，候选基线 | 1/1 | 0 | 0 | 0 | 无 |
| 6499–6507，P3 和 P4 均全部吻合 | 9/9 | 0 | 0 | 0 | 无 |
| 6508–6519，P2 区间的其余阈值 | 12/12 | 0 | 0 | 0 | 无 |

差异表保留了阈值、原轮号、帧号、ROI、原始像素和及判决方向等字段，本次记录数为 0。独立程序从原图及日志逐项重建了全部判决，并验证该差异表为空。[差异明细](data/knottnerus-s23-p5/results/differences.csv) · [独立核验](data/knottnerus-s23-p5/results/independent.json)

## 首帧入选名单和筛选分母

首帧在全部 36 位中至少有 16 位占据时入选。日志与每个冻结判据分别生成入选名单，共同的 60 个原轮号如下，省略前缀 `P5_`。[全部入选与排除轮号、交集及逐阈值分母](data/knottnerus-s23-p5/results/cohorts.csv)

2、3、4、6、7、9、10、11、12、13、16、20、22、24、25、26、27、28、29、33、34、35、36、38、40、41、42、43、44、47、49、50、51、52、53、55、57、58、59、62、66、69、70、74、76、78、79、81、82、84、85、88、89、90、91、93、96、97、99、100。

| 首帧轮次集合 | 双帧位点分母 | 首帧已占／全部位点 | 末帧目标填充／目标位点 | 末帧满阵列／轮数 |
| --- | ---: | ---: | ---: | ---: |
| 筛选前全部 100 轮 | 7,200 | 1,649/3,600 | 953/1,600 | 48/100 |
| 入选 60 轮 | 4,320 | 1,116/2,160 | 947/960 | 48/60 |
| 排除 40 轮 | 2,880 | 533/1,440 | 6/640 | 0/40 |

表中分子和分母对日志及全部 22 个判据相同。筛选排除了 40 轮、640 个末帧目标位，其中有 6 个目标位判占；48 个满阵列全部来自入选轮次。

## 复算凭据与适用范围

Taiyi 于 2026-11-19 北京时间 19:19:29–19:19:31 完成作业。12 项作业输入在运行前通过校验。主程序逐行累加九个像素，独立程序重新读取双帧原图和 DAT 日志，以二维积分图计算同一矩形的和。核对覆盖 100 轮、200 帧、7,200 个位点帧、22 个阈值的判决位串及 198 组筛选记录。6 份结果回传后均通过 SHA-256 核验。[主程序](../../scripts/audit-knottnerus-s23-holdout.py) · [独立程序](../../scripts/verify-knottnerus-s23-holdout.py) · [输入校验](data/knottnerus-s23-p5/input-sha256.txt) · [结果校验](data/knottnerus-s23-p5/result-sha256.txt) · [Taiyi 退出回执](data/knottnerus-s23-p5/compute-unit-final.log)

从项目根目录可用同一 DOI 的完整 ZIP 复算，主程序创建新的结果目录，独立程序使用 NumPy。

```sh
record=references/knowledge/data/knottnerus-s23-p5
python3 -B scripts/audit-knottnerus-s23-holdout.py Datapackage_SLM.zip "$record/source-manifest.json" "$record/freeze.json" p5-results
python3 -B scripts/verify-knottnerus-s23-holdout.py Datapackage_SLM.zip "$record/freeze.json" p5-results p5-results/independent.json
```

保留 `>6436 counts` 为候选判据，6499–6519 仅标为 **P2 日志相容区间**。P5 的相同位串无法区分这 22 个判据，也不能确定当批相机载入的在线阈值。Senoo CAL 继续接收同装置先导实测工作簿和原始日志，完成 CAL 并冻结规则后再开独立 VAL。[正式验收入件状态](https://github.com/seven-Jack/naqc-digital-twin/blob/v0.1.6/docs/RELEASE_EXECUTION_CHECKLIST.md#正式科研验收顺序)
