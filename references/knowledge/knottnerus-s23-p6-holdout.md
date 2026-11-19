# Knottnerus S23/P6 双帧占位留出对照

**在 P3、P4、P5 全部吻合的 6499–6507 counts，9 个整数阈值在 P6 也分别重现了全部 7,200 个日志位。** P2 日志相容区间的其余 12 个阈值（6508–6519）以及 P1 候选判据 `sum > 6436 counts` 在 P6 同样全部吻合。全部 22 个判据共用同一批 100 轮原图，与日志相比均无差异轮号，首帧均选中相同的 56 轮。[冻结记录与 P2–P5 来源哈希](data/knottnerus-s23-p6/freeze.json) · [逐阈值结果](data/knottnerus-s23-p6/results/summary.json)

## 来源和配对

证据等级为 **Knottnerus ⁸⁸Sr 同序列留出，相对 Senoo ¹⁷¹Yb 的跨装置对照**。作者使用 813 nm 光阱和 689 nm 的 ¹S₀ ↔ ³P₁ 荧光成像。选取公开序列 `241129_S23` 中 P5 之后的参数点 P6，保留原轮号 1–100。已核对完整 ZIP 的官方 MD5 和归档 SHA-256，Taiyi 工作子包中的 322 个成员均有来源路径和内容哈希。[作者数据 v1，CC BY 4.0](https://doi.org/10.21942/uva.28166483.v1) · [论文与附件](https://www.dare.uva.nl/id/e2c1c6fa-bc32-450d-bc90-c3524281e2d8) · [原件与成像条件清单](data/knottnerus-s23-p6/source-manifest.json)

- **双帧。** 每份 `P6_n.dat` 的序列号、参数点及轮号均与 `(23, 6, n)` 一致。`P6_n_1.tga` 对应首帧 `Pic1`，`P6_n_2.tga` 对应末帧 `Pic2`，日志各含 36 位。100/100 轮配对完整，200 张原图都是 100×180、16 位小端灰度 TGA，文件哈希各异。轮级时标从 2024-11-29 14:34:34.841 递增至 14:41:06.501。原件未注明时区或逐帧实际曝光时标。[逐轮时标、位串与原日志路径](data/knottnerus-s23-p6/results/rounds.csv)
- **坐标与成像。** P1、P3、P4、P5、P6 的 ROI 矩形文件、时序表和输出表分别逐字节相同。名义成像均为 20 个周期、12% 占空比、200 ms，并启用验证帧。扫描控制字段 `DRbRepumpDPAOMB2Intensity1` 在这五个参数点依次为 1、3、4、5、6。[控制设置与原件摘要](data/knottnerus-s23-p6/source-manifest.json)
- **冻结判读。** 在 P6 原图中按 P1 的 36 个半开矩形累加固定 3×3 窗口的九个像素，不移动中心、不扣背景。只有像素和严格大于整数 T 时才判占，等于 T 时判空。冻结前从 P3、P4、P5 各自完整吻合的阈值集合取交集，得到重点检验的 6499–6507。其余阈值也逐一检验。[位点帧计数、矩形及源图路径](data/knottnerus-s23-p6/results/sites.csv.gz) · [P2](knottnerus-s23-p2-threshold-sweep.md) · [P3](knottnerus-s23-p3-holdout.md) · [P4](knottnerus-s23-p4-holdout.md) · [P5](knottnerus-s23-p5-holdout.md)

## 差异轮号与阈值

| T（counts，含端点） | 完全吻合的阈值数 | 每个 T 的首帧差异／3,600 | 每个 T 的末帧差异／3,600 | 其中末帧目标区差异／1,600 | 原差异轮号 |
| --- | ---: | ---: | ---: | ---: | --- |
| 6436（候选） | 1/1 | 0 | 0 | 0 | 无 |
| 6499–6507（P3、P4、P5 共同吻合） | 9/9 | 0 | 0 | 0 | 无 |
| 6508–6519（P2 区间的其余阈值） | 12/12 | 0 | 0 | 0 | 无 |

差异表保留了阈值、轮号、帧号、零基 ROI、像素和、日志判决与复算判决的列名，数据行为 0。独立程序逐项检查两种差异方向，确认差异集合为空。[差异明细](data/knottnerus-s23-p6/results/differences.csv) · [独立核验](data/knottnerus-s23-p6/results/independent.json)

## 首帧入选名单与筛选分母

对日志和每个阈值分别应用首帧至少 16/36 个位点占据的条件。以下为共同入选的 56 个原轮号，省略前缀 `P6_`。[每种判据的入选、排除和交集名单](data/knottnerus-s23-p6/results/cohorts.csv)

1、2、3、4、6、7、10、11、12、13、14、16、17、18、19、21、22、23、25、26、29、31、32、33、35、36、38、40、41、43、44、45、47、50、52、53、55、57、58、60、61、62、63、64、67、71、75、76、79、80、92、93、94、97、98、100。

| 首帧轮次集合 | 双帧位点分母 | 首帧已占／全部位点 | 末帧目标填充／目标位点 | 末帧满阵列／轮数 |
| --- | ---: | ---: | ---: | ---: |
| 筛选前全部 100 轮 | 7,200 | 1,496/3,600 | 891/1,600 | 49/100 |
| 入选 56 轮 | 4,032 | 1,024/2,016 | 889/896 | 49/56 |
| 排除 44 轮 | 3,168 | 472/1,584 | 2/704 | 0/44 |

目标填充按每轮内部 4×4 的 16 个位点计，零基 ROI 为 7–10、13–16、19–22、25–28。满阵列按 16 个目标位全部占据的轮数计。44 个排除轮贡献了 704 个目标位分母和其中 2 个占位，49 个满阵列均来自入选轮次。表中各分子与分母在日志及全部判据下相同。

## 复算凭据与适用范围

Taiyi 于 2026-11-19 北京时间 19:40:55–19:40:56 完成作业。运行前核对了 12 项输入。主程序逐行累加九个像素，独立程序重新读取 DAT 和原图，用二维积分图求和。核验覆盖 100 轮、200 帧、7,200 个位点帧、22 个判据的完整判决及 198 组筛选记录。6 份结果均通过回传哈希核对。[主程序](../../scripts/audit-knottnerus-s23-holdout.py) · [独立程序](../../scripts/verify-knottnerus-s23-holdout.py) · [输入校验](data/knottnerus-s23-p6/input-sha256.txt) · [结果校验](data/knottnerus-s23-p6/result-sha256.txt) · [Taiyi 退出回执](data/knottnerus-s23-p6/compute-unit-final.log)

从项目根目录可对完整作者 ZIP 复算。主程序创建新的结果目录，独立程序使用 NumPy。

```sh
record=references/knowledge/data/knottnerus-s23-p6
python3 -B scripts/audit-knottnerus-s23-holdout.py Datapackage_SLM.zip "$record/source-manifest.json" "$record/freeze.json" p6-results
python3 -B scripts/verify-knottnerus-s23-holdout.py Datapackage_SLM.zip "$record/freeze.json" p6-results p6-results/independent.json
```

`>6436 counts` 保留为候选判据，6499–6519 仅标为 **P2 日志相容区间**。P6 的日志位串无法区分这 22 个判据，当批相机实际使用的在线阈值仍待核实。Senoo CAL 继续接收同装置已填先导工作簿和原始日志，完成 CAL 并冻结规则后再开启独立 VAL。[正式验收入件状态](../../docs/RELEASE_EXECUTION_CHECKLIST.md#正式科研验收顺序)
