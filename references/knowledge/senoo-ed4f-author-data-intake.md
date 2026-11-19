# Senoo 扩展数据图 4f 原始资料接收与核对

当前保留刊版 **4.49 MHz** 和源表复算 **4.24242 MHz**。目标是追溯 ¹⁷¹Yb 767 nm 光镊、302 nm 驱动、2.4 µm 原子对工况下，刊版如何生成横轴、拟合曲线并选定频率。首轮请求优先获取绘图使用的输入和拟合设置。 [原有证据与逐窗比较](senoo-ed4-rabi-frequency-audit.md#论文说明与待补证据) · [刊版数据可用性](https://www.nature.com/articles/s41567-026-03258-8#data-availability)

## 接收顺序

| 优先级 | 资料 | 到件后核对 |
| --- | --- | --- |
| 1 | 图 4f 拟合实际使用的输入表、生成 `SMFig4_Rydberg.pdf` 的脚本或工程、输出参数与误差。若频率由外部测量固定，补该测量引用。 | 把拟合输入逐点映射到 `ExtendedDataFig4f!B1:BI5`。核对时间单位、时零和任何时间变换，原始模型、权重、初值或搜索范围、时窗间的相位约束，以及最后报告的参数和不确定度。 |
| 2 | 逐轮采集与脉冲日志，带运行、原子对和尝试 ID、控制设定时长、触发、实测光脉冲起止、时钟与时窗。 | 按原 ID 关联实际照明时间与已发表时间点，检查窗间共同时基、缺轮和重复轮。记录原时标单位、刻度、参考零点及换算误差。 |
| 2 | 逐轮制备、单激发、双激发和丢失分类，筛选掩码、排除原因以及各点分子和分母。 | 按原子对和时点重算丢失检测后的单激发布居 `P(r₀m₁) + P(m₁r₀)`、分母和误差条，确认跨原子对汇总方式。 |
| 3 | 同工况连续时间扫描或独立 Rabi 频率标定，包含驱动、失谐、距离、几何、时钟和误差。 | 用窗间数据或独立频率与误差判别两个候选值。与原图的工况匹配后记录结论和适用范围。 |

收到资料后保留原件，并为每个文件登记角色、来源、接收日期、原始文件名、版本、SHA-256、工况和单位。另存衍生的时点索引与逐轮对应关系。发现输入、时标或分母不一致时，记录原始定位和异常，待来源核实后再重算。 [随刊原始工作簿](../library/171yb/yb-senoo-source-edfig4.xls) · [原有核对的复现入口](senoo-ed4-rabi-frequency-audit.md#复现命令)

分别登记两项结论。**刊版选解复核**以原绘图输入和流程重放为据，核对是否生成 4.49 MHz 对应的曲线与报告值。**独立频率判别**以同工况窗间扫描或频率标定为据，报告误差是否足以区分两组候选值。两项证据分别归档。 [项目验收要求](../../docs/SENOO_CALIBRATION.md#六项验收所需证据)

## 英文邮件草稿

**Subject** Request for the Extended Data Fig. 4f fit files

Dear authors,

I am reproducing the two-atom blockade Rabi analysis in Extended Data Fig. 4f of your paper *High-fidelity entanglement and coherent multi-qubit mapping in an atom array* (DOI 10.1038/s41567-026-03258-8).

Could you share the exact input data and fit script or settings used to generate the 4.49 MHz curve? A link to the relevant files, or a brief note on the time-axis convention, fit weights, and how the frequency and phase were constrained, would be helpful.

If readily available, the pulse-timing or shot-level logs and a short description of how the loss filter was applied would also help me trace the source-data time points and denominators.

Thank you for your time.

Best regards,\
[Your name]
