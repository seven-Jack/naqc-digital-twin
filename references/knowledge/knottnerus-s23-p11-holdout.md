# Knottnerus S23/P11 双帧占位留出对照

**预先指定的 6499 和 6500 counts 在 P11 各有 0/7,200 处差异，延续了 P3 至 P10 的逐位吻合。** 单看 P11，受检阈值中有 9 个（6499–6507）完全重现日志。候选判据 `sum > 6436 counts` 在 P11_6、P11_44 首帧各多判一个占位，6508–6519 各在 P11_25 首帧少判一个占位。三轮都没有跨过首帧筛选线。日志和全部 22 个判据选中的 47 个原轮号相同，其中 36 轮末帧满阵列。[冻结记录与 P2–P10 依据](data/knottnerus-s23-p11/freeze.json) · [逐阈值结果](data/knottnerus-s23-p11/results/summary.json)

## 来源、配对与判读口径

本批为 Knottnerus ⁸⁸Sr **同序列留出**，相对 Senoo ¹⁷¹Yb 属于**跨装置对照**。作者装置采用 813 nm 光阱及 689 nm 的 ¹S₀ ↔ ³P₁ 荧光成像。取公开序列 `241129_S23` 中 P10 之后的参数点 P11，包含原轮号 1–100。完整作者 ZIP 已核对官方 MD5 和归档 SHA-256，Taiyi 输入子包中 342 个成员各有来源路径及摘要。[作者公开数据 v1，CC BY 4.0](https://doi.org/10.21942/uva.28166483.v1) · [来源与配置清单](data/knottnerus-s23-p11/source-manifest.json)

- **原始双帧。** 每份 `P11_n.dat` 中的序列号、参数点和轮号均为 `(23, 11, n)`。首帧 `P11_n_1.tga` 对应 Pic1，末帧 `P11_n_2.tga` 对应 Pic2，每帧日志各含 36 位。100/100 轮配对完整，200 张原图的摘要各异，均为 100×180、16 位小端灰度 TGA。2024-11-29 的轮级时标从 15:04:10.701 严格递增至 15:09:55.076。原件未注明时区及单帧实际曝光时标。[逐轮日志、位串与原件路径](data/knottnerus-s23-p11/results/rounds.csv)
- **ROI 和成像设置。** P1 与 P3 至 P11 的 ROI 矩形、时序表、输出表分别逐字节相同。名义成像设置均为 20 个周期、12% 占空比、200 ms，启用验证帧。P11 控制文件的 `DRbRepumpDPAOMB2Intensity1` 设为 11.00000，100/100 轮日志的对应字段 `RbRepumpDPAOMB2Intensity1` 均记为 0。实际施加值仍待核实。[成像设置与日志字段](data/knottnerus-s23-p11/source-manifest.json)
- **阈值冻结。** 固定 P1 的 36 个 3×3 半开矩形，每个位点累加九个原始像素，不移动窗口、不扣背景。像素和严格大于整数 T 时判占，等于 T 判空。查看 P11 差异前，从 v0.1.11 的 P3 至 P10 归档结果取交集，冻结本轮重点 6499、6500。候选 T=6436 和 P2 日志相容区间 6499–6519 内的 21 个整数阈值全部逐一检验。[冻结规则及来源摘要](data/knottnerus-s23-p11/freeze.json) · [逐位点像素和、坐标及源图路径](data/knottnerus-s23-p11/results/sites.csv.gz)

## 逐阈值差异与原轮号

| T（counts，含端点） | 阈值数 | 每个 T 的首帧差异／3,600 | 每个 T 的末帧差异／3,600 | 差异轮号 |
| --- | ---: | ---: | ---: | --- |
| 6436（候选） | 1 | 2 | 0 | P11_6、P11_44 |
| 6499（重点） | 1 | 0 | 0 | 无 |
| 6500（重点） | 1 | 0 | 0 | 无 |
| 6501–6507 | 7 | 0 | 0 | 无 |
| 6508–6519 | 12 | 1 | 0 | P11_25 |

| 原轮号 | 首帧 ROI（零基） | 3×3 像素和（counts） | 触发差异的 T | 日志 → 复算 | 首帧占位数与筛选结局 |
| --- | ---: | ---: | --- | --- | --- |
| P11_6 | 27 | 6493 | 6436 | 空 → 占 | 21 → 22，仍入选 |
| P11_44 | 13 | 6457 | 6436 | 空 → 占 | 14 → 15，仍排除 |
| P11_25 | 2 | 6508 | 6508–6519 | 占 → 空 | 19 → 18，仍入选 |

P11_25 的像素和恰为 6508 counts，所以 T=6507 时判占，从 T=6508 起判空。这一位点在 12 个阈值下各产生一行差异，加上候选判据的两行，共 14 行差异，涉及三个不同原轮号。全部判据在末帧 3,600 个位点和其中 1,600 个目标位上均有零差异。[差异明细、坐标与源单帧](data/knottnerus-s23-p11/results/differences.csv) · [Taiyi 独立核验](data/knottnerus-s23-p11/results/independent.json)

## 首帧入选名单、筛选分母和满阵列数

对日志和每个阈值的复算位串分别应用筛选条件，首帧 36 个位点中至少有 16 个占据的轮次入选。**全部 22 个判据均与日志选中同一份 47 轮名单。** 以下为原轮号，省略前缀 `P11_`。[各阈值的入选、排除与交集名单](data/knottnerus-s23-p11/results/cohorts.csv)

1、2、3、4、5、6、11、12、16、17、20、22、23、24、25、27、30、31、32、34、35、37、38、39、40、47、48、49、50、53、56、57、60、62、63、65、66、68、69、70、71、74、75、76、77、78、80。

| 首帧轮次集合 | 双帧位点分母 | 末帧已占目标位／目标位 | 末帧满阵列轮数／轮数 |
| --- | ---: | ---: | ---: |
| 筛选前 100 轮 | 7,200 | 739/1,600 | 36/100 |
| 入选 47 轮 | 3,384 | 739/752 | 36/47 |
| 排除 53 轮 | 3,816 | 0/848 | 0/53 |

每轮双帧位点分母为 2×36，末帧目标位分母为内部 4×4 的 16 个位点（零基 ROI 7–10、13–16、19–22、25–28）。16 个目标位全占据计为一次满阵列。三处首帧差异均未改变入选结局，故表中计数及分母在日志和全部判据下相同。739 个末帧已占目标位及全部 36 轮满阵列均来自入选组。[198 组逐阈值筛选记录](data/knottnerus-s23-p11/results/cohorts.csv)

## 复算凭据与适用范围

Taiyi 于 2026-11-19 北京时间 21:38:01–21:38:02 完成作业。运行前核对了 12 项输入。主程序逐行累加九个像素，独立程序从原始 DAT 和 TGA 重建位串并用二维积分图求矩形和。两种方法对 100 轮、200 帧、7,200 个位点帧、22 个判据、198 组筛选记录及 14 行差异的核验均通过。六份回传结果均已核对 SHA-256。[输入摘要](data/knottnerus-s23-p11/input-sha256.txt) · [结果摘要](data/knottnerus-s23-p11/result-sha256.txt) · [独立核验](data/knottnerus-s23-p11/results/independent.json) · [Taiyi 退出回执](data/knottnerus-s23-p11/compute-unit-final.log)

当次 Taiyi 作业的四个脚本按原样归档，各文件可按上述输入摘要核对。提交与回传脚本保留当次作业目录和服务名称。[资源检查](data/knottnerus-s23-p11/taiyi/admit.py) · [提交作业](data/knottnerus-s23-p11/taiyi/submit.sh) · [运行复算和独立核验](data/knottnerus-s23-p11/taiyi/run.sh) · [收集回执](data/knottnerus-s23-p11/taiyi/return.sh)

在项目根目录使用完整作者 ZIP 可按以下命令复算。主程序创建新的结果目录，独立程序使用 NumPy。[主程序](../../scripts/audit-knottnerus-s23-holdout.py) · [独立程序](../../scripts/verify-knottnerus-s23-holdout.py)

```sh
record=references/knowledge/data/knottnerus-s23-p11
python3 -B scripts/audit-knottnerus-s23-holdout.py Datapackage_SLM.zip "$record/source-manifest.json" "$record/freeze.json" p11-results
python3 -B scripts/verify-knottnerus-s23-holdout.py Datapackage_SLM.zip "$record/freeze.json" p11-results p11-results/independent.json
```

`>6436 counts` 保留为候选判据，6499–6519 仅标为 **P2 日志相容区间**。P11 本批的零差异受检阈值为 6499–6507，跨 P3 至 P11 共同逐位吻合的受检值仍只有 6499 和 6500。实际在线阈值及当批在线判决的成因仍待核实。Senoo CAL 继续接收同装置已填工作簿和原始日志，冻结规则后再开启独立 VAL。[Senoo 正式验收与收件](../../docs/RELEASE_EXECUTION_CHECKLIST.md#正式科研验收顺序)
