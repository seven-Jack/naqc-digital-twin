# Senoo 装载与输运日志

在 `#senoo` 打开 **装载与输运日志**。用 **下载装载与输运模板 JSON** 取得运行头，用 **导入装载与输运 JSON** 读入一个采集运行。模板面向 ¹⁷¹Yb 位点占据和搬运观察，装置、光镊波长和工况按所提供的运行填写。归档控制器、相机及轨迹原件和 SHA-256 后，从这些记录转写 JSON。 [装载与输运 v1 格式](../src/physics/senooTransportRun.ts) · [合成示例](../tests/fixtures/senoo-transport-synthetic.json)

## 原始记录与字段

| 内容 | 记录要求 |
| --- | --- |
| 运行身份和证据 | 记录 `apparatusVersion`、`workingPoint`、`trapWavelengthM`、`acquisitionRunId` 及运行级 `sourceRef`。`sourceKind` 为 `measured` 或 `synthetic`。实测声明的原件逐一核对。 |
| 坐标和时钟 | 每个位点给出 ID、目标标志和米制 `positionM`。登记 `coordinateFrameRef`，保存阵列平面的 x、y 和高度 z 的坐标约定、标定及原件。阶段和轨迹用相同 `clockId`、`timeOriginRef` 下的秒。来自不同硬件时钟的数据先对齐并保存变换。 |
| 每次尝试 | 记录唯一尝试 ID、起止、装载时段及实际输运状态。已执行和失败留实际时段，失败或跳过附原因。跳过时留空输运起止，已执行搬运列表为空。 |
| 装载后和输运后占位 | 分别登记 `initial` 与 `final`，填结果可用时刻 `availableAtS` 和原始帧或判定引用。已提供的快照须列齐位点。确认空位填 `empty`，缺测或无法区分填 `unknown`，整张快照缺测填 `null`。有同一原子的身份关联证据时再填写 `atomId`。 |
| 逐次搬运 | 记录搬运 ID、起止位点、实际时段、已确认的原子 ID 及原始执行记录。轨迹 `path.kind` 为 `tracked` 或 `commanded`，保留样点和来源。无轨迹填 `null`。存活与丢失需要结局证据和可用时刻。待核或未判明的结局填 `unknown`。终点有原子与同一原子存活分别留证。 |

装载后快照有记录时，应在输运开始前可用。终态在输运结束后可用。同一已识别原子的搬运时间须依序登记，各独立搬运可并行。事件在时间轴上按实际记录展开。

## 回放与分母

轮次选择、时间轴和前后检查点共用同一游标。跟踪轨迹按记录样点显示，样点间仅为回放插值，样点范围外保留位置缺测。指令路径以虚线显示。搬运开始后，相关起止位点在新占位可用前显示未判明。存活或丢失只在对应结局可用后显示。三维阵列与二维降级视图使用同一份帧和米制坐标比例。 [帧投影实现](../src/physics/senooTransportReplay.ts)

整批统计独立显示于时间轴下方。换轮和拖动游标时，当前占位、轨迹和结局随之更新，整批计数采用该运行的全部尝试。

| 指标 | 分子与分母 |
| --- | --- |
| 记录位点装载率 | 装载后确认有原子的位点次数，除以装载后占位可判定的位点次数。另报缺测及全部位点次数。 |
| 目标装配率 | 终态所有目标位点均确认占据的轮次，除以装配结果可判定的轮次。确认任一目标为空即为装配失败，其余部分或全部缺测保留为未判明。 |
| 搬运存活率 | 证实存活的搬运次数，除以结局明确的实际搬运次数。另列未知结局及实际搬运总数，跳过的尝试单独计数。 |

用 **导出装载与输运回放 JSON** 保存归一化记录、原输入哈希、轮次、时刻和整批统计。重导回放可恢复游标并从记录重算统计。连续导入字节相同的原文件可保留当前游标。原始文件及归档哈希仍需随实测交付。

## 收到采集文件后

在项目根目录执行以下命令。先收一批时只传第一个运行文件，收到独立批次后再追加第二个。可用 `tests/fixtures/senoo-transport-synthetic.json` 练习单批收件。命令接受 `#senoo` 可导入的采集 JSON 或回放 JSON。 [本地收件脚本](../scripts/audit-senoo-transport-acquisition.ts)

```sh
transport_audit_dir=$(mktemp -d)
./node_modules/.bin/esbuild scripts/audit-senoo-transport-acquisition.ts \
  --bundle --platform=node --format=esm --outfile="$transport_audit_dir/audit.mjs" &&
node "$transport_audit_dir/audit.mjs" "运行.json" "独立运行.json" > "$transport_audit_dir/transport-audit.json"
```

1. 从 `runs[].attempts` 按轮号查首末占位、未判定位点、跳过或失败原因、路径证据和存活结局。`reviews` 列出待回查项。把各轮与相机帧、触发和执行记录对应，并用采集器的启动清单核实 `expectedAttempts`，包括失败和跳过轮。
2. `runs[].statistics` 沿用回放的统计，分别给出分子、可判分母、未判数量和总数。库内四轮合成示例的装载为 6/10（总 12 个位点次数），装配为 1/3（总 4 轮），搬运存活为 1/2（总 3 次搬运），另有 1 轮跳过。`missing-final` 轮可定位到终态缺帧和搬运结局未判。
3. 双批报告在 `comparison` 中列出文件、运行 ID、来源类型或装置版本冲突，及工况差异和共享的逐轮原始引用。共享容器文件时，根据两侧轮号与帧号或记录段核实是否重用样本。各批 SHA-256 来自本次交付 JSON 的字节，回放所载原输入身份另存为 `declaredReplayOrigin`。相机、控制器原件的内容、引用及哈希由采集方比对。

退出码 0 表示已生成 `source-review` 收件报告，合成记录与声明为实测的记录均保留其来源。退出码 1 表示双批有身份或来源冲突，详见 JSON。退出码 2 表示输入或格式有错，诊断写入标准错误。独立性需用原始记录和样本分配核实，收件状态与正式验收分别登记。

## 公开跨装置逐轮数据

公开资料按原实验的同位素、布局和时间口径导入同一离线工具。使用上一节打包的命令后，运行 `node "$transport_audit_dir/audit.mjs" --public-transport 公开批次.json`。输入类型为 `public-transport-run` v1，报告标记为 `cross-apparatus`。Senoo 运行、回放和正式验收继续使用原入口。 [公开数据解析](../scripts/audit-public-transport.ts)

| 字段 | 转写原件时保留的信息 |
| --- | --- |
| 运行 | `apparatus`、`species`、`sourceRef`、`selectionRef` 分别给出装置、同位素、来源和选取的分件、轮号或筛选范围。`decisionRef` 和 `clockRef` 指向实际采用的占位规则和实测时钟，缺失填 `null`。 |
| 布局 | `initialLayout.siteIds`、`finalLayout.siteIds` 分别给出两帧的位点顺序。`finalLayout.targetSiteIds` 给出目标位点，未知填 `null`。两布局分别记录 `coordinates`，可给 `kind`（`camera-roi-px`、`nominal-m` 或 `measured-m`）、坐标轴 `axes`、按位点排序的 `positions` 和 `sourceRef`；无坐标填 `null`。 |
| 逐轮 | 每轮有唯一 `attemptId` 和原件定位 `sourceRef`。`initial`、`final` 各有 `rawFrameRef`、`decisionRef`、`occupancy` 和实测 `timeS`。占位串按对应布局用 0、1、? 表示空、占据、未知；缺少逐位判决时填 `null`。缺少整帧及其判决时该阶段填 `null`。图号、帧序和文件创建时间只用于定位。 |
| 搬运及条件分母 | `moves: null` 表示未取得本轮完整的已执行搬运清单，此时整批搬运总数未知。已交付的执行记录填写 `id`、`fromSiteId`、`toSiteId` 和 `sourceRef`。有同原子关联时记 `atomId` 和 `outcomeRef`，结局取 `survived`、`lost` 或 `unknown`。终态目标填满与搬运存活各计各的分母。可用 `minimumInitialAtoms` 另报满足论文初态原子数条件的子集，排除轮、未定轮和全批分母均保留。 |

报告逐轮保留原帧、判读和空目标位点。可用每轮 `recordedTime` 保留原日志日历文字，其时区和对应阶段以原件为准。可用每帧 `rawFrameSha256` 附转写时按原帧文件字节计算的摘要。`findings` 汇总重复帧引用或摘要、缺少前／后帧、时序倒置、部分位点无判决和终态缺原子的轮号。双帧覆盖量统计同轮两份原帧引用均有登记的轮数；若出现复用，要回查报告中的帧引用和涉及轮号。数据包只公开选定扫描或图示例时，分母只覆盖这部分。

## 独立实测验收

交付同一装置运行下的原始占位帧、真实坐标标定及触发日志、搬运路径及其证据类型、轮次完整分母和终态判定。任选成功、失败及缺测轮核对原始资料与回放，并用独立批次检验装载率、目标装配率和搬运存活率。完成同装置验证后，将对应组件版本和适用工况写入整机预测。 [整机独立验证](QUANTUM_COMPUTER.md#senoo-独立电路批次) · [长期推进顺序](PROJECT_CHECKLIST.md#六cal-暂缓期间的推进)
