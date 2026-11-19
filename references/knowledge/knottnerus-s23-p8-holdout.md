# Knottnerus S23/P8 双帧占位留出对照

**6499–6507 counts 的 9 个整数阈值在 P8 各有 0/7,200 处差异，延续了 P3 至 P7 的逐位吻合。** P2 日志相容区间的其余 12 个阈值（6508–6519）在 P8 也全部吻合。候选判据 `sum > 6436 counts` 有两处差异，均在入选轮次。P8_23 的差异发生在首帧，P8_34 的差异发生在末帧目标位。全部判据的入选名单相同，但候选判据把入选轮次中的满阵列数从日志的 41 轮计为 42 轮。[冻结记录与 P2–P7 来源摘要](data/knottnerus-s23-p8/freeze.json) · [逐阈值结果](data/knottnerus-s23-p8/results/summary.json)

## 来源、配对与判读条件

证据等级为 Knottnerus ⁸⁸Sr **同序列留出**，相对 Senoo ¹⁷¹Yb 属于**跨装置对照**。作者装置采用 813 nm 光阱和 689 nm 的 ¹S₀ ↔ ³P₁ 荧光成像。取公开序列 `241129_S23` 中紧接 P7 的参数点 P8，保留全部 100 个原始轮号。完整作者 ZIP 已核对官方 MD5 和归档 SHA-256，Taiyi 工作子包的 330 个成员均已逐项核对文件摘要。[作者公开数据 v1，CC BY 4.0](https://doi.org/10.21942/uva.28166483.v1) · [来源与配置清单](data/knottnerus-s23-p8/source-manifest.json)

- **双帧。** 对每个原轮号 n，`P8_n.dat` 中的序列号、参数点和轮号均为 `(23, 8, n)`。`P8_n_1.tga` 对应 Pic1，`P8_n_2.tga` 对应 Pic2，每帧日志各含 36 位。200 张原图均为 100×180、16 位小端灰度 TGA，文件摘要各异。轮级时标从 2024-11-29 14:46:53.379 严格递增至 14:52:34.266，原件未注明时区或逐帧实际曝光时标。[逐轮日志、位串与源路径](data/knottnerus-s23-p8/results/rounds.csv)
- **可比条件。** P1 与 P3 至 P8 的 ROI 矩形、时序表、输出表分别逐字节相同。名义成像设置均为 20 个周期、12% 占空比、200 ms，并启用验证帧。P8 控制文件中的扫描设定 `DRbRepumpDPAOMB2Intensity1` 为 8.00000，100/100 轮日志的对应字段 `RbRepumpDPAOMB2Intensity1` 均记为 0。实际施加值仍待核实。[控制设置与日志字段](data/knottnerus-s23-p8/source-manifest.json)
- **冻结判读。** 固定 P1 的 36 个 3×3 半开矩形，每个位点累加九个原始像素，不移动窗口、不扣背景。像素和严格大于整数 T 才判占，等于 T 时判空。查看 P8 差异前，已冻结候选 T=6436 与 P2 日志相容区间 6499–6519 的 21 个整数阈值，并从 P3 至 P7 的已发布结果取交集，确定重点范围 6499–6507。[冻结记录](data/knottnerus-s23-p8/freeze.json) · [原图路径、ROI 坐标与逐位点计数](data/knottnerus-s23-p8/results/sites.csv.gz)

## 逐阈值差异与原轮号

| T（counts，含端点） | 阈值数 | 每个 T 的首帧差异／3,600 | 每个 T 的末帧差异／3,600 | 其中末帧目标位差异／1,600 | 差异轮号 |
| --- | ---: | ---: | ---: | ---: | --- |
| 6436（候选） | 1 | 1 | 1 | 1 | P8_23 首帧、P8_34 末帧 |
| 6499–6507（P3 至 P7 共同吻合） | 9 | 0 | 0 | 0 | 无 |
| 6508–6519（P2 区间的其余阈值） | 12 | 0 | 0 | 0 | 无 |

| 原轮号 | 帧与位点（ROI 从 0 起） | 3×3 像素和 | 日志 → 候选判决 | 对该轮的影响 |
| --- | --- | ---: | --- | --- |
| P8_23 | 首帧 ROI 4，目标区外 | 6463 counts | 空 → 占 | 首帧从 20 增至 21 个占位，仍入选。末帧目标填充均为 16/16 |
| P8_34 | 末帧 ROI 19，目标区内 | 6450 counts | 空 → 占 | 首帧均有 18 个占位，均入选。末帧从日志的 15/16 变为复算的 16/16 |

两个像素和都高于 6436 且低于 6499，因此 P2 区间内的每个受检阈值在这两个位点都判空，与日志相同。各阈值的其余位点也已逐一比对。[差异明细与原帧路径](data/knottnerus-s23-p8/results/differences.csv) · [Taiyi 独立核验](data/knottnerus-s23-p8/results/independent.json)

## 首帧入选名单与筛选分母

首帧至少有 16/36 个位点占据时入选。分别用日志和每个阈值的复算位串应用该条件，22 个判据均复现同一份 **54 轮名单**。以下为原始轮号，省略前缀 `P8_`。[各阈值入选、排除与交集名单](data/knottnerus-s23-p8/results/cohorts.csv)

3、4、5、6、7、9、11、12、16、17、20、22、23、24、25、26、31、33、34、37、40、46、48、51、52、53、54、56、57、58、59、60、63、65、71、72、74、77、79、81、83、84、85、87、89、90、91、92、93、94、95、97、98、100。

| 轮次集合 | 双帧位点分母 | 末帧目标填充（日志及 T=6499–6519） | 末帧目标填充（候选 T=6436） | 满阵列轮数（日志及 T=6499–6519） | 满阵列轮数（候选 T=6436） |
| --- | ---: | ---: | ---: | ---: | ---: |
| 筛选前 100 轮 | 7,200 | 854/1,600 | 855/1,600 | 41/100 | 42/100 |
| 入选 54 轮 | 3,888 | 850/864 | 851/864 | 41/54 | 42/54 |
| 排除 46 轮 | 3,312 | 4/736 | 4/736 | 0/46 | 0/46 |

双帧位点分母按每轮 2×36 计。末帧目标填充的分母按每轮内部 4×4 的 16 个位点计（零基 ROI 7–10、13–16、19–22、25–28），满阵列的分母按轮数计。P8_34 解释了入选后所有判据之间的末帧填充和满阵列数差异。46 个排除轮在全部判据下均无差异。[198 组筛选统计与逐帧差异分母](data/knottnerus-s23-p8/results/cohorts.csv)

## 复算凭据与适用范围

Taiyi 于 2026-11-19 北京时间 20:31:41–20:31:43 完成作业。提交前核验了 12 项输入。主程序逐行累加九个像素，独立程序从原始 DAT 和 TGA 重建位串，用二维积分图求矩形和。独立核验覆盖 100 轮、200 帧、7,200 个位点帧、22 个判据、198 组筛选记录及两行差异。六份回传结果的 SHA-256 均已核对。[输入校验](data/knottnerus-s23-p8/input-sha256.txt) · [结果校验](data/knottnerus-s23-p8/result-sha256.txt) · [独立核验](data/knottnerus-s23-p8/results/independent.json) · [Taiyi 退出回执](data/knottnerus-s23-p8/compute-unit-final.log)

从项目根目录使用完整作者 ZIP 的复算命令如下。主程序创建新的结果目录，独立程序使用 NumPy。[主程序](../../scripts/audit-knottnerus-s23-holdout.py) · [独立程序](../../scripts/verify-knottnerus-s23-holdout.py)

```sh
record=references/knowledge/data/knottnerus-s23-p8
python3 -B scripts/audit-knottnerus-s23-holdout.py Datapackage_SLM.zip "$record/source-manifest.json" "$record/freeze.json" p8-results
python3 -B scripts/verify-knottnerus-s23-holdout.py Datapackage_SLM.zip "$record/freeze.json" p8-results p8-results/independent.json
```

`>6436 counts` 保留为候选判据，6499–6519 仅标为 **P2 日志相容区间**。P8 的日志无法区分这 21 个整数阈值。实际在线阈值与两处在线判空的原因仍待核实。Senoo CAL 继续接收同装置已填工作簿和原始日志，冻结规则后再开启独立 VAL。[Senoo 正式验收与收件](../../docs/RELEASE_EXECUTION_CHECKLIST.md#正式科研验收顺序)
