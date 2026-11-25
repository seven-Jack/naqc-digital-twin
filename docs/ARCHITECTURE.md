# 架构

React 和 TypeScript 提供面板及单一参数状态。Vite 打包静态文件。主场景直接使用 Three.js，便于显式控制渲染帧与资源释放。科学曲线使用 SVG，保持轴、图例及探针可读。

由原子数据库和文献知识库支撑的下一版设计见 [¹⁷¹Yb 整机数字孪生架构方案](DIGITAL_TWIN_ARCHITECTURE_PROPOSAL.md)。

## 整机演示

- `src/data/machineProfile.ts` 定义演示配置 `muniz-483-460-demo`，包括 6 行 × 8 列阵列、寄存器行和九个播放阶段。各阶段的起止时刻由其播放时长依次累加。光路的通道、样式与示意坐标在 `src/data/machineSceneProfile.ts`。
- `src/physics/machineProtocol.ts` 编译标准协议或可选的 `bell-replenishment`。补位协议在重排后安排占位采集、判决、一次补位与复查，计划区间包含成功继续或失败跳过的窗口。其占位观测、判决和操作事件分别拥有 ID、可用时刻与依赖引用。
- `src/physics/quantumComputer.ts` 从配置、协议、测量基、种子和仿真参数生成批次。标准协议装配整个寄存器，Bell 补位协议优先装配 q0，再按观测决定是否从储备阵列搬运一枚现有原子。播放帧按所选尝试投影几何、当前可用的观测和判决，并计算截至播放时刻的批次计数。
- `src/physics/machineSchedule.ts` 校验事件目标及资源、统一播放时基、计划与执行区间、曝光和结果可用时刻。可执行操作不得重叠占用同一独占资源。补位协议的两路共址换阱分别占用各自激光，下游操作等待两路均完成。
- `src/machine/MachineDashboard.tsx` 持有演示配置、所选协议、尝试编号与播放时刻。各视图共用一帧。标准协议使用 JSON v2，补位协议使用 v3，保存配置、种子和逐次几何、事件、观测与判决。`src/physics/machineRunImport.ts` 校验并读取本地文件，播放器直接使用保存的运行。旧文件缺失的逐轮布局标为缺测。
- `src/scene/machineSceneFrame.ts` 将播放帧按光路配置投影为显示状态。Three.js 场景和光路说明共用投影，WebGL 不可用时同一帧驱动二维阵列和光路说明。
- `src/data/hardwareEvidence.ts` 存放真机实验出处与条件，供 `HardwareEvidence.tsx` 展示。求解器使用独立的仿真假设。
- `src/data/yb171AtomicSnapshot.generated.json` 固定本地原子数据库版本并保留来源、条件与证据状态。演示 v3 的 578 nm 通道引用该快照的 T3 跃迁，装置驱动参数由未来的同装置观测填入。

当前批次模型使用矩形网格与连续寄存器位点。演示配置的几何和阶段时长分别描述示意场景与浏览器时间。更换真实装置时，按其分区、连通性和实验时标补充相应的模型与配置。

Bell 补位协议使用 15.2 秒的示意尝试时间。每次占位采集在阶段开始后 600 ms 产生合成布尔观测，判决于阶段结束的 900 ms 可用。第一次判决选择继续或补位，复查判决选择继续或跳过。满寄存器跳过补位和复查，储备区无可用原子时记录 `no-source`。跳过操作保留计划窗口供检查。三维与二维阵列跟随所选尝试，批次计数在荧光读出窗口按所有尝试推进。切换与回退均从同一运行投影。

## 独立验证的文献组件

生产入口 `src/main.tsx` 只挂载整机演示。以下保留的文献组件由浏览器测试单独加载。

- `src/data/senooReadoutSource.ts` 保存 Senoo 图 2b 的三组配对计数与逐列出处。`src/machine/SenooReadoutSource.tsx` 提供固定对数坐标、组别筛选和配对样本查看。数据由本地原件按哈希校验导入，面板选择只改变文献观测视图。
- `src/data/senooPopulationSource.ts` 保存 Senoo 图 2c 右图两条布居轨迹的源值、上下误差与工作表定位。`src/machine/SenooPopulationSource.tsx` 在共用源时刻显示配对的两态布居。
- `src/physics/dualExposureReadout.ts` 定义双曝光阈值规则及四种判决。`src/data/senooReadoutEvaluation.ts` 从图源构建带制备标签和工作簿定位的观测，生成逐点判决和交叉计数。图表、样本详情、计数与 JSON 导出共享同一规则快照。

- `src/data/senooApparatus.ts` 定义 767 nm 装置、通道、相关态和文献工序。工序顺序用于无量纲的播放进度。论文给出的典型物理量按 SI 另存。
- `src/physics/senooReplay.ts` 将图 2b 的样本和播放进度投影成当前光路、名义态、可用观测和探索判决。回放 JSON v1 校验装置、工作簿哈希、配对样本及规则后恢复进度。
- `src/machine/SenooApparatus.tsx` 把同一帧传给装置场景和计数面板。三维与二维示意共享通道状态。 [文献依据及实测缺项](SENOO_APPARATUS.md)
- `src/data/senooMeasurementWorkbook.ts` 在浏览器读取模板四张 XLSX 数据表，并保留原行号、字符串 ID 和数值缺测。独立的 `src/physics/senooMeasurements.ts` 验证关系键、曝光与事件时标，汇总原记录在各阶段的分母。`src/machine/SenooMeasurementImport.tsx` 展示报告、逐帧记录和来源声明。
- `src/physics/senooMeasurementReplay.ts` 将选中位点的曝光和关联事件投影为纯回放帧。相机和光路使用记录的区间，计数与判决按各自的可用时标释放。`src/machine/SenooMeasurementReplay.tsx` 用同一帧渲染三维、时间轴和双曝光面板，分母共用导入校验口径。工作簿内容哈希用于同一页面重导时保留游标。 [双曝光逐轮回放](SENOO_APPARATUS.md#双曝光逐轮回放)
- `src/physics/senooSyntheticWorkflow.ts` 仅从选定的合成标定批次求中点阈值，冻结双曝光规则、分母及样本出处。验证函数使用该规则判读另一个合成采集运行。`src/machine/SenooSyntheticWorkflow.tsx` 将冻结与留出判读分为两个操作，并可导出验收 JSON。 [合成结果](SENOO_APPARATUS.md#合成阈值冻结与独立验证)
- `src/physics/senooMeasuredReadout.ts` 核对正式流程输入，对标定批次评估显式候选规则，导入冻结记录时复算标定摘要，再按原规则判读留出批次。`src/machine/SenooMeasuredReadout.tsx` 在工作簿面板提供候选评估、冻结、重导和验证报告。 [正式流程与适用条件](SENOO_CALIBRATION.md)
- `src/physics/senooReadoutAcceptance.ts` 读取随规则冻结的八项误差上限、分母要求及独立性依据，按采集尝试计算同时置信区间。`src/machine/SenooReadoutAcceptancePanel.tsx` 编辑判据及查看各组的留出证据。 [冻结判据与区间](SENOO_CALIBRATION.md#冻结验收判据与独立批次区间)
- `src/physics/senooReadoutThresholdScan.ts` 从标定批次的有效计数生成判决区间及排名，区间边界沿用双帧比较符。`src/machine/SenooCalibrationThresholdScan.tsx` 提供候选预览与归档，所选候选沿现有评估和冻结入口处理。 [标定阈值扫描](SENOO_CALIBRATION.md#标定批次阈值扫描)
- 双曝光验证报告保存实际留出工况与冻结快照，重导时用同一判读流程复算。`src/physics/senooCircuitReadoutEvidence.ts` 校验整机留出与组件标定、独立验证的采集运行及原始帧隔离。 [报告重算与整机关联](SENOO_CALIBRATION.md#重算验证报告与关联整机)
- `src/physics/senooCircuitBatch.ts` 校验包含四阶段时标、逐轮占位、筛选与双帧的整机留出批次。`senooCircuitStatistics.ts` 使用同工况冻结规则计算全量分母和筛选后观测，`senooCircuitPrediction.ts` 对照预先归档的条件预测。`src/machine/SenooCircuitBatchPanel.tsx` 提供本地模板、逐轮原始记录和统计导出。 [整机独立批次](QUANTUM_COMPUTER.md#senoo-独立电路批次)
- `src/physics/senooTransportRun.ts` 单独校验装载与输运的米制位点、共同采集时钟、占位和搬运。 `senooTransportReplay.ts` 按游标投影证据可用状态并汇总三类分母。 `src/machine/SenooTransportReplay.tsx` 统一选择轮次与检查点，`src/scene/SenooTransportScene.tsx` 从同一帧绘制跟踪、指令路径和二维降级视图。 [装载与输运日志](SENOO_TRANSPORT_ACQUISITION.md)
- `src/data/senooCzCharacterization.ts` 校验图 3b、3c 的 30 个深度源点及计数口径，并登记图 3d 的源表参照。`src/machine/SenooCzCharacterization.tsx` 用同一个门深度驱动两张图及逐点表，另显示整条曲线的每门保真度和丢失斜率。 [CZ 表征](SENOO_APPARATUS.md#图-3bd-cz-门表征)
- `src/physics/senooCzWaveform.ts` 独立校验两原子 CZ 波形 JSON 的来源声明、SI 样点、位点顺序和门窗覆盖。`src/machine/SenooCzWaveformInput.tsx` 在 CZ 表征入口提供模板、来源核查和逐点检查。 [波形与关联记录](SENOO_CALIBRATION.md#两原子-cz-波形与关联记录)
- `src/physics/senooCzDynamics.ts` 按两个位点的同步波形和有效双激发频移传播九态闭系统。`src/machine/SenooCzDynamicsPanel.tsx` 显示四个逻辑输入的返回振幅、泄漏、条件相位与步长细化差异，并导出可追溯至波形哈希的条件计算。 [相干前向模型](SENOO_CALIBRATION.md#两原子-cz-的相干前向模型)
- `src/physics/senooCzResponse.ts` 导入逐轮独立门响应，保留门前筛选、判读分类、相位与来源。`senooCzResponseComparison.ts` 按波形身份和工况核对独立批次，计算四组布居区间和环绕相位残差。 [独立门响应](SENOO_CALIBRATION.md#两原子-cz-独立门响应)
- `src/physics/senooCzBenchmark.ts`、`senooCzBenchmarkStatistics.ts` 和 `senooCzBenchmarkFit.ts` 分别验证独立 gRB 批次、按实际掩码和采集块统计、计算非 echo 的描述性拟合。`src/machine/SenooCzBenchmarkPanel.tsx` 按深度查看逐轮证据并导出报告。 [独立 gRB 与丢失批次](SENOO_CALIBRATION.md#独立-grb-与丢失批次)
- `src/data/senooRabiCharacterization.ts` 绑定图 2c 源表、归档拟合和已实现的 SI 前向模型。`src/data/senooPairCharacterization.ts` 校验图 5f 的双轴误差和图 4f 两组频率的逐点与逐窗证据。三个观测使用 `src/machine/SenooFitPlot.tsx` 绘制源点、拟合及误差条，游标由各自的源点编号驱动。 [图 2c](SENOO_APPARATUS.md#图-2c-单原子-rabi) · [图 5f、4f](SENOO_APPARATUS.md#扩展数据图-5f-能移与图-4f-阻塞-rabi)

## 钟跃迁物理模型记录

`src/data/atomicData.ts` 保存带版本的原子输入，`src/physics/` 保留势能、驱动与 SI 快照的计算及单元测试。整机门序列通过 `machineSceneFrame.ts` 显示其中的 578 nm 态转移光路。[物理模型与假设](PHYSICS.md)
