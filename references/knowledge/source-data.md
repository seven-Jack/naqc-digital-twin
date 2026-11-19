# Senoo 出版方数据表的读数与模型用途

以下读数对应 Senoo 等 ¹⁷¹Yb 多能级比特映射实验的图 2 和扩展数据图 5。按工作表只读提取图源值、列类型、误差和值的范围，再和刊版图、图注及 Methods 对照。图轴和统计口径来自论文，工作簿里的 `X`、`Y` 列本身没有完整单位或实验条件。 [刊版](../library/171yb/yb-senoo-mapping-publisher.pdf) · [论文 DOI](https://doi.org/10.1038/s41567-026-03258-8)

Rabi、双原子能移和门表征的工况、源单元格及测量缺项见 [门模型公开参数与验收数据](senoo-gate-model-data.md)。

## yb-senoo-source-fig2

[图 2 源表](../library/171yb/yb-senoo-source-fig2.xls)共 16 个工作表。图 2 与图注在刊版 PDF 第 3 页，印刷页 905。

| 工作表 | 对应数据 | 适用于模型的检查 |
| --- | --- | --- |
| `Fig2b_loss`、`Fig2b_spin0`、`Fig2b_spin1` | 各 255 组双曝光相机计数，分别来自未装原子、制备 `m₀`、制备 `m₁` 三组，横纵坐标对应图 2b 的两次成像。 | 用双曝光特征核对状态或丢失判决的表达。独立记录制备组别、两帧观测和分类结果。点数为源表里的图示样本数，实验统计口径见 Methods 与扩展数据表 1。 |
| `Fig2c_right_blue`、`Fig2c_right_red` | 各 80 个时间点，含上下误差，分别为 ¹⁷¹Yb 的 `m₁`、`r₀` 布居曲线。读出先把里德堡比特映射到亚稳态比特。 | 时间轴单位为 µs。保留读出映射条件，支持在同一时刻对照两个态的布居和误差。 |
| `Fig2d` B2:F4 | `¹S₀` 为 42(2)%，`³P₂ F=3/2` 为 20(2)%，`m₀` 为 2.7(5)%，`m₁` 为 4(1)%，`Other` 为 31(3)%。 | 这是该实验制备、等待、探测和再泵方案推断的去向比例。表中保留 `Other`，并把舍入后的比例与其误差关联。若模拟需要归一化概率，先说明规则与约束，保留原记录。 |
| `Fig2e_0` 至 `Fig2e_3`、`Fig2e_Inset` | 四种初始 Rydberg 布居下的条件群体衰减，各 11 个时刻。插图列出四个初始布居与相应拟合时间常数。 | 显式记录丢失检测后的有效样本条件和初始制备比重。条件布居拟合、绝对存活与 Rydberg 衰变时间分别保存。 |
| `Fig2f_left_top`、`Fig2f_left_bottom`、`Fig2f_center_bottom`、`Fig2f_right_top`、`Fig2f_right_bottom` | 三组四项标签的布居，两组各 31 个相位点的奇偶曲线。态标签用明确的比特串或 `g/m` 序列。 | 同一态制备的布居、分析相位、奇偶和基底映射各有字段。编码 `00`、`01` 等须按字符串保留，源表中部分标签被 Excel 存成数字。 |

## yb-senoo-source-edfig5

[扩展数据图 5 源表](../library/171yb/yb-senoo-source-edfig5.xls)共 11 个工作表。图与图注在刊版 PDF 第 18 页。

| 工作表 | 对应数据 | 适用于模型的检查 |
| --- | --- | --- |
| `ExtendedDataFig5a`、`ExtendedDataFig5` | 14 点的电离脉冲时间与布居。通用命名的表与 `5a` 具有同组 X/Y 数据，后者有更多有效位。 | 使用图轴的 ns。电离探测的时间常数对应读出步骤，里德堡态自然或实验条件下的衰变时间单独登记。 |
| `ExtendedDataFig5b_1S0`、`ExtendedDataFig5b_m0`、`ExtendedDataFig5b_total` | 基态积累、指定亚稳态积累和总衰变曲线，各 11 点。总衰变表的采样时间与前两表不同。 | 使用各自时间坐标。图 5b 与图 2d 一致标记 `m₀` 为 2.7(5)%、`m₁` 为 4(1)%。刊版 PDF 第 10 页 Methods 的数值顺序对应相反的态标签。模型证据记录保留冲突，图表口径可用于展示，状态特定的数值校准注明所采用来源。 |
| `ExtendedDataFig5c_RepumpOff`、`ExtendedDataFig5c_RepumpOn` | 两组各 15 点的基态布居，横轴为 µs，有独立的上下误差。是否开启 770 nm 再泵是条件变量。 | 将再泵作为干预事件，使用对应观测算符解释轨迹。直接拟合或推出 ³P₂ 分支需要保留实验归一化、初始条件和再泵方案。 |
| `ExtendedDataFig5f_1`、`ExtendedDataFig5f_2`、`ExtendedDataFig5g_bottom`、`ExtendedDataFig5g_top` | `f` 为原子间距与交互频移，X/Y 有各自误差。 `g` 为两条各 30 点的失谐扫描与存活率。 | 交互量用图示的 `V/(2π)`（MHz），原子间距为 µm。记录磁场方向与两原子连线，横纵误差和存活统计各归其轴。 |

图 2 和扩展数据图 5 可用于验证图源导入、误差条和状态判决界面。门及多体态表征使用已归档的图 3、4 XLS，数据字段和原件位置见公开数据索引。逐次整机数据的缺口集中在同装置的装载记录、搬运前后帧、光阱波形和读出原图。 [公开数据归档](../MANUAL_DOWNLOAD.md#按组件归档的公开数据)

## 图 2b 接入记录

整机页的“Senoo 双曝光读出源表”读取三张表各 255 对，共 765 对计数。原表采用横向布局，B1:IV1 是源索引 0–254，B2:IV2 为 X 即 Image 1，B3:IV3 为 Y 即 Image 2。运行快照保留工作表、列名、小数计数及原件 SHA-256，每个散点可定位到同列的两个单元格。坐标采用原图的双对数定义，组别按制备条件显示。低计数点按原样保留。 [前端快照](../../src/data/senooReadoutSource.ts) · [查看面板](../../src/machine/SenooReadoutSource.tsx)

源索引只用于定位数据。该图源没有逐点实验时间戳、阵列位置、相机像素帧或分类阈值。面板提供成对观测的查看，Bell 补位协议的合成占位观测与统计仍由其自己的运行记录生成。

双曝光标定资料已登记此图的可复现 CSV、扩展数据图 2 成像源表、出版方结果与待补逐轮数据。 [标定资料索引](senoo-readout-calibration.md)

使用本地 Python 和 xlrd 2.x 可重新提取。默认输入为资料库中的图 2 XLS，脚本先核对 SHA-256、表结构与序号，再逐列保存计数。加 --check 会比对生成快照与当前原件。应用构建使用已保存的快照。 [导入脚本](../../scripts/import-senoo-readout.py)

```sh
python3 scripts/import-senoo-readout.py --check
```

## 图 2c 接入记录

“Senoo 里德堡态布居源表”使用 `Fig2c_right_blue`（m₁）和 `Fig2c_right_red`（r₀）。在 B 至 CC 的 80 列里，逐列保留共同时间（µs）、无量纲布居、上下误差偏移及源索引。按图注保留丢失检测条件，Methods 的探测顺序为先把里德堡比特映射到亚稳态比特再成像。图 2d 的去向比例与 Methods 的标签冲突见上表。 [前端快照](../../src/data/senooPopulationSource.ts) · [重新提取](../../scripts/import-senoo-population.py)

```sh
python3 scripts/import-senoo-population.py --check
```
