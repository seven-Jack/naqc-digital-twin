# 跨平台实验、仪器与软件证据

本分册覆盖资料库的离子阱、超导、光量子、硅自旋、工具标准与手册，共 38 个条目。逐件阅读 27 份 PDF 的摘要、相关正文、图表或手册章节，核对 11 个在线条目的相关页面，并抽查 Helios Fig. 2 与 PairInteraction Fig. 6 的页面图。涉及大型手册时定位到与整机、时序或读出有关的章节。在线文档按 2026-11-17 查阅状态记录。

## 对数字孪生的接口约束

| 对象 | 至少应记录的内容 | 可检验行为 |
| --- | --- | --- |
| 装置定义 | 装置与修订、功能区及坐标、设备端口、可用能力、依赖与互斥、资料版本 | 同一配置可为一个逻辑程序生成可追溯的编译计划。教程示例数值保留示例标签。 |
| 资源与调度 | 原子/逻辑比特/阱位身份、路径区段、所占通道、门与搬运重叠、可用和实际使用资源 | 重叠事件在其涉及的资源上才执行互斥检查。逻辑连接、空间连通与某次运行中可执行的门均可独立查询。 |
| 时钟 | 逻辑顺序、设备计划时间与时钟单位、实际事件时间、展示时间映射 | 暂停或拖动回放游标不改变已记录的设备时标。缺测时用未知值或计划值的来源标签。 |
| 读出与反馈 | 原始事件、触发/积分窗口、判读、占位、无效或泄漏标志、信号可用时刻、分支执行记录 | 跟踪一次判读到下一操作的因果链。反馈延迟有明确起止点，和稳态解码吞吐分别显示。 |
| 测量统计 | 运行与样本标识、预筛选和后选择口径、各阶段分母、使用的投影与估计法、不确定度、失败分类 | 同一批次可从原始事件重新统计。失占位、泄漏、阈值判读错以及传输失败各自有计数。 |
| 校准与验证 | 校准对象、依赖关系、适用条件、使用快照、拟合/测量/推断的类型及版本 | 改动单个上游标定后可指出哪些下游参数待重验。把硬件独立测量和带条件的系统基准分别对照。 |

## 离子阱

### `xp-qccd` Pino 等的 QCCD 示范

Honeywell 作者稿。Fig. 1 与 System 的 Hardware、Software 把线性表面阱的加载、储存、门和辅助区，以及云端、编译器、机控、FPGA 和采集连在同一图上。离子链的平移、拆分/合并和重排在不同区域执行。控制器还跟踪与搬运及门有关的相位。Fig. 4 的传态 CNOT 实验包含分区搬运、两轮中途测量与条件门。

模型可将物理搬运原语、逻辑 SWAP、相位参考更新、条件门和被丢弃后重跑的运行单独记录。文中使用 ¹⁷¹Yb⁺ 与 Ba⁺，电极驱动及协同冷却属于离子平台。 [本地作者稿](../library/trapped-ions/xp-qccd.pdf)

### `xp-helios` Ransford 等的 Helios

作者稿 arXiv:2511.05465v1。Sec. II A–C、Figs. 1–4 展示 ¹³⁷Ba⁺ 计算离子的环形储存、缓存、逻辑区及支路储存，八个操作区按批次工作，路由可与逻辑区的基态冷却并行。Fig. 3 区分普通、保护和三级读出，三级判读显式输出 0、1 或泄漏。Fig. 4 对 98 比特示例分解搬运、冷却和操作时间，并比较门层密度与配对结构。

模型应显式表达缓存容量、跨区转移和同一设备的不同读出协议。Fig. 1 是荧光实拍，Fig. 2 是示意并给出部分实际尺寸。时序和性能数据应随特定程序或基准的条件记录。 [本地作者稿](../library/trapped-ions/xp-helios.pdf)

### `xp-racetrack` Moses 等的 H2 跑道结构

APS 刊版。Sec. II A、Fig. 2 将输送带、上下排门区及光束安排画开。本次实验上下排参与物理重排，底部 DG 区才承担量子操作。Table I 依据编译信息分解操作、搬运和冷却预算。Sec. V 的重复码存储实验采用逻辑测量后的解码，文中另述中途实时解码能力。

模型应区分器件结构的潜在能力、该工作启用的能力、该运行已执行的动作，并标明编译估计或实测时间。该工作与后续 H2 产品数据的工作规模和参数版本分别保存。 [本地刊版](../library/trapped-ions/xp-racetrack.pdf)

### `xp-ion-qec` Ryan-Anderson 等的实时纠错

APS 刊版。Figs. 1–3、Sec. II A 使用十个 ¹⁷¹Yb⁺ 计算离子，其中七个数据比特和三个辅助比特实现距离 3 颜色码，另有 Ba⁺ 冷却离子。初始化有最多三次的条件重试，flagged 综合征检查改变时才运行额外测量。每个周期将综合征变化传给实时解码器，并更新后续周期的基准。

回放宜保留尝试次数、通过或失败条件、综合征历史和推断出的校正，以及分支是否执行。区分校正推断、软件记录的逻辑帧和实际施加的脉冲。证据对应该编码和离子实验。 [本地刊版](../library/trapped-ions/xp-ion-qec.pdf)

### `xp-h2-datasheet` H2 产品数据表

Quantinuum v4.00，2025-09-17。Specifications Table 1 与 System Operation 标明产品有 56 个 ¹⁷¹Yb⁺ 计算离子、四个可并行操作的区以及典型和最大错误口径。材料指出不同操作区可有不同误差，给出的典型误差有跨区平均。

硬件能力卡可独立于科研论文的基准任务建档，注明规格版本、典型值或上界、测试条件与采用范围。设备名和全连接说法应附带实际路由来源。 [本地数据表](../library/trapped-ions/xp-h2-datasheet.pdf)

## 超导

### `xp-willow` Google Quantum AI 的低于表面码阈值实验

作者稿 arXiv:2408.13687v1。Fig. 1 展示 105 比特处理器上的距离 7 布局，Fig. 4 与 Sec. V 的实时解码来自另一套 72 比特处理器上的距离 5 实验。后者将电信号在电子设备上判为位，工作站转成检测事件，经共享缓冲进入流式解码。文中约 63 µs 延迟的起点为软件收到最后一轮数据，终点为解码器返回校正。设备每轮周期约 1.1 µs，该延迟尚未覆盖反馈进入后续逻辑电路。

模型可单列数据采集、数字判决、传输、解码和反馈执行时间，并绑定设备与任务。该超导结果适合约束记录语义。 [本地作者稿](../library/superconducting/xp-willow.pdf)

### `xp-sycamore-si` Sycamore 补充材料

作者稿 arXiv:1910.11333v2。Sec. III、Sec. VI A–B、Figs. S10–S11 描述控制/读出链，以及存储频率、偏置、持续时间与幅度的器件参数注册。Optimus 将校准组成有向无环图。根配置、孤立单比特配置和并行网格配置分阶段建立，遇到漂移时利用依赖关系查找需重验的部分。

模型可给每次运行绑定校准快照和活动子集，对不同设备版本或漂移状态重新计算受影响的参数。相关图和页码来自补充稿，校准关系随硬件技术改变。 [本地补充稿](../library/superconducting/xp-sycamore-si.pdf)

### `xp-krinner` Krinner 等的重复表面码综合征

作者稿 arXiv:2112.03708v1。Figs. 1–3 与 The surface code cycle and state initialization 在 17 个 transmon 上实现 9 数据比特、8 辅助位置的距离 3 表面码。循环中交错测量 X、Z 稳定子，并重叠部分读出与操作。实验按初始化记录筛选，随后用采集的综合征进行逻辑输出修正分析。

模型可显式表达检查角色、重叠读出和门层、初始筛选及每轮检测记录，并分别标注在线采集与运行后解码。拓扑和误差常数随实验变。 [本地作者稿](../library/superconducting/xp-krinner.pdf)

### `xp-sycamore` Arute 等的随机电路采样

Nature 刊版。Figs. 1–4 将 54 位硬件网格中失效点、53 位执行规模、门层编排与 XEB 数据一起呈现。Fig. 2 分报孤立和并行操作时的测量误差及 Pauli 错误分布，Fig. 4 分报可验证线路与用简化线路支持的规模估计。

模型可保留全台图、可用子图、该运行的活动子图与屏蔽位置，并明确 XEB 计算使用的理想概率和伴随统计口径。随机电路采样的对照结论受任务及经典计算假设约束。 [本地刊版](../library/superconducting/xp-sycamore.pdf)

### `xp-zuchongzhi` Gao 等的祖冲之 3.0

APS 刊版。Figs. 1–3 的双片集成设备有 105 个 transmon 和 182 个耦合器，最大采样线路使用挑选出的 83 个比特。Fig. 2 的门和读出数据来自同时操作被选比特。Fig. 3 区分 31 比特完整线路实测、83 比特分块线路和 83 比特完整线路保真度估计。

展示可在同一张拓扑图上选出参与节点、禁用边与门层配对，度量字段注明直接测量、估计或推断。硬件覆盖量与具体任务规模使用各自分母。 [本地刊版](../library/superconducting/xp-zuchongzhi.pdf)

### `xp-machino-bswap` Machino 等的强驱动 bSWAP

arXiv:2610.21936v1。Sec. III、Table I、Figs. 3–5 为远失谐固定频率 transmon 的实验。强交换驱动进入着装态，第二路弱驱动补偿累计 ZZ 相位，前后有幅度坡道和虚拟 Z 帧更新。谱线扫描、重复脉冲和独立相位校准给出工作点。Sec. V 用 IRB 与交错 XEB 分别报告两种门的结果。

模型可把门意图、各通道脉冲、帧、门后相位补偿和验证协议关联，并显示每个保真度对应的方法。微波脉冲参数和 ZZ 消除结果归原实验。 [本地预印本](../library/superconducting/xp-machino-bswap.pdf)

## 光量子

### `xp-aurora` Aghaee Rad 等的模块化光量子机

Nature 刊版。Figs. 1–3、Methods 的 Aurora hardware system 与 Extended Data Figs. 1–2 给出脉冲源、36 个光子数分辨通道、光纤缓存、重组芯片、五个 QPU 芯片和 FPGA 判读的路径。缓存为先到的 herald/判读结果预留时间。大尺寸高斯簇态连续采集和距离 2 重复码的条件测量是不同实验，后者演示了根据解码选择下一测量基。

模型可并排投影空间图与有向信号流图，记录等待/缓存、触发、基选择、信号链延迟以及每项实验实际启用的模块。光量子模式、光路损耗和原子位置不共用物理尺度。 [本地刊版](../library/photonics/xp-aurora.pdf)

### `xp-borealis` Madsen 等的可编程光子采样

NIST 归档稿。Figs. 1–3 与 Experiment 展示 216 个时域模式经三个可编程光纤回路，延迟分别跨 1、6、36 个时隙，在光子计数输出形成一次样本。小规模验证把实测分布与使用标定压缩参数及有损传输矩阵计算的基准对照，分不同光子数和碰撞类型。

模型应让逻辑模式、物理设备、进入顺序与实际时间分开编号。组件参数可用于构建可验证的小规模观测，再标注外推范围。该设备的展示任务是高斯玻色采样。 [本地归档稿](../library/photonics/xp-borealis.pdf)

### `xp-psiquantum` 可制造光量子平台

Nature 刊版。Figs. 1–2、Table 1 与 Chip-to-chip qubit interconnect 从 300 mm 晶圆、低温封装追踪到光子源、滤波器、干涉器和探测元件，另有跨芯片光纤链路。Table 1 区分已宣告光子制备/测量、量子干涉与后选择融合指标，各自有本实验分母。

模型可给每个模块单独描述输入输出接口、采用条件和度量分母。跨模块的传输效率、触发概率、带条件的保真度与整机成功率有各自记录。平台元件的表现归各指定实验。 [本地刊版](../library/photonics/xp-psiquantum.pdf)

### `xp-photonic-fusion` Bartolucci 等的融合式架构

Nature Communications 刊版。Fig. 1、Fusion networks 与 Physical architecture 区分资源态生成、路由延迟、融合测量及经典解码。Fig. 2 的 6-ring 是特定网络，Fig. 3 的擦除和测量错误阈值依赖采用的统计模型。物理布线可用时域延迟表现高维逻辑网络的连接。

模型可将已知位置的擦除、未知值误判和可观察的融合失败分别编码，并保留从物理事件到逻辑边或检测事件的映射。论文给出理论架构及阈值分析。 [本地刊版](../library/photonics/xp-photonic-fusion.pdf)

## 硅自旋

### `xp-silicon-spin` Philips 等的六比特硅量子点

Nature 刊版。Fig. 1、Extended Data Figs. 1–2 与 Methods 展示 Si/SiGe 量子点由双端传感器做外侧偶奇判读，中央比特借条件旋转映射为间接 QND 测量。初始化含测量反馈和再次判读。部分结果按三次 QND 判读相同作筛选，Fig. 5 改用多数判决。Fig. 1f 给出校准依赖。

模型应区分目标比特、实际检测位置、奇偶或直接状态的可观测量，以及重复判决和后选择策略。硅量子点读出窗及反馈耗时仅属该硬件。 [本地刊版](../library/silicon-spin/xp-silicon-spin.pdf)

## 工具、标准与手册

### `tools-artiq` ARTIQ RTIO 手册

本地官方手册 9.9701+608f43e，Ch. 7 §7.1–7.5、Ch. 8 §8.1–8.2。RTIO 事件有编程时间游标和硬件壁钟，游标提前量形成 slack，内核写入命令后设备于预定时刻产生输出。输入事件保存时标，过去时刻写入、队列顺序错误、通道碰撞和忙碌有不同处理语义。

模型宜给计划时间和观测时间独立字段，包含时钟基准、量化、触发先后和失败类型。机器单位受设备配置影响，手册举例的 1 ns 只用于理解该接口。 [本地手册](../library/engineering/tools-artiq.pdf)

### `tools-labscript` Starkey 等的硬件定时实验控制

作者稿 arXiv:1303.0080v3。Figs. 1–3 与 Secs. III、VII–VIII 把每次 shot 的准备、硬件定时执行、采集、后处理分开。伪时钟在事件或采样更新点触发，多通道共享时钟会受支持的最大更新速率和缓存约束。同一 HDF 记录逐步关联实验变量、编译指令、原始图像、脚本及分析。

模型可将控制计划固化为可重播输入，不同设备采样与等待事件作为能力字段，图像 ROI 和拟合结果具独立来源键。HDF 容器与器件驱动只是原实现的一种组织。 [本地作者稿](../library/engineering/tools-labscript.pdf)

### `tools-naviz` MQT NAViz 文件格式

在线 0.3.2 文档，Machine Configuration、Visualization Input 与 Automatic Time / Relative Time。机器配置和时间事件保存在不同文件。原子或区域可作操作目标，显式或相对时标可分解为带起止时间的事件，多事件组的结束时刻由最迟完成项决定。

模型应通过稳定装置、区域和原子 ID 联结机器几何与可重播事件。格式内的视觉颜色、半径与移动插值属于回放表达，需要保留原始记录以判断实物轨迹。 [官方文件格式](https://mqt.readthedocs.io/projects/naviz/en/stable/file_format.html)

### `tools-atomtwin` AtomTwin.jl 模拟器文档

在线 Quick Start 与 Solvers and accuracy。将 System 的物理对象、Sequence 的操作和探测器分开，返回带时间采样的命名观测。求解器说明包含 Schrödinger、MCWF 和主方程，时变包络跟步长采样或子步容差有关。半经典运动和冻结位置是可选条件，随机轨迹可设种子。

模型应记录求解器版本、步长/容差、运动假设、随机种子和输出量，并使用简单极限或步长收敛核验。示例输出属于教程，装置参数与实测证据另行绑定。 [Quick Start](https://aqcess.github.io/AtomTwin.jl/stable/quickstart/) · [求解器说明](https://aqcess.github.io/AtomTwin.jl/stable/solvers/)

### `tools-camera` Andor iXon Ultra/Life EMCCD 手册

本地官方手册 v2.3，§4.3.6、§4.4、§§5.2–5.4，特别是 Fig. 32。EMCCD 探测流程可区分感光、帧转移、增益寄存器及读出。帧转移模式与触发方式改变这些阶段可否重叠。该版本的外部曝光宽度控制在 NFT 模式描述，帧转移模式另列可用信号。

模型应保存触发边沿、曝光窗、帧可用时刻、ROI/binning、增益及饱和条件。用设备型号、模式和标定数据确定这些量，原子态判别阈值另由每次实验的图像校核。 [本地手册](../library/engineering/tools-camera.pdf)

### `tools-pulser` Pasqal Sequence 与验证

在线 The Pulser Sequence、Inspecting、Runtime Validation。Register 定原子位置，Device 定物理约束，Channel 定可用控制，Sequence 编排时序并交给 Backend。切换设备可触发规则验证。模拟执行可选按真实设备限制检查，后端另有约束。

模型可在编译前检查区域、粒子数、通道及时序，再独立校验仿真或设备配置能力。该工具的物理约束随设备和后端变化，示例序列有自己的目标配置。 [官方 Sequence 文档](https://docs.pasqal.com/pulser/sequence/)

### `tools-nist-yb` NIST Yb 原子数据表

在线原子手册，Isotope 行将同位素质量、天然丰度、核自旋和核磁矩列开，¹⁷¹Yb 的核自旋为 1/2，¹⁷³Yb 为 5/2，¹⁷⁴Yb 为 0。天然丰度应随自然混合表的定义使用。

模型的物种标识应包含元素、质量数和电荷态，核性质字段挂到同位素。富集源的混合和具体实验的装载概率需另有条件或测量。 [NIST 表](https://physics.nist.gov/PhysRefData/Handbook/Tables/ytterbiumtable1.htm)

### `na-doc-naviz` MQT NAViz 源码与文档

在线仓库 README 的 Key Features 与模块树包含 import、parser、animator、renderer、state，支持交互时间轴、视频导出和可替换的机器规格。

模型的运行结果、解析适配器、时间轴插值和渲染应能分别更换。导出的视频或动画帧归展示产物，仿真和测量以经版本化的运行记录追溯。 [官方仓库](https://github.com/munich-quantum-toolkit/naviz)

### `xp-qick` Stefanazzi 等的 RFSoC 时序控制器

Fermilab 归档录用稿。Figs. 3、7–10、QICK Firmware 以 tProcessor 触发信号生成与读出模块，DAC/ADC 和数字标记接口接到明确的硬件块。主机先送波形与定时程序，仪器再在 FPGA 运行，读出可下变频并积分。

模型应区分低速配置、波形资源、端口连线、低延迟控制和采集数据。该稿为初版硬件/固件，板卡时钟、通道数和 RF 指标属于该版本。 [本地录用稿](../library/engineering/xp-qick.pdf)

### `xp-laboneq` LabOne Q 手册

在线 Introduction 的 Fig. 1、Session、Compiler and Controller、Pulse Sheet Viewer。Device Setup、Calibration 和 Experiment 分离定义，Session 连接实际配置与程序，离线编译后区分由仪器及时执行的 real-time 区域和 host/near-time 工作。浏览器 Pulse Sheet 对编译后的信号、段、波形与控制流提供检查。

模型可输出可检查的编译时序，持久记录校准、配置、实验说明及结果的引用。浏览器展示速度与真实设备时钟各自定义。 [官方手册](https://docs.zhinst.com/labone_q_user_manual/getting_started/introduction.html)

### `tools-openqasm-paper` Cross 等的 OpenQASM 3 论文

作者稿 arXiv:2104.14722v2。§2.4、§§4.3–4.4、§§5.1–5.4 叙述测量、重置、低延迟经典控制、相对时序、校准及多级表示。实时条件值与近时的外围计算配合，逻辑程序的门语义可降低为设备相关时间、波形和捕获。

模型应将逻辑指令图和设备相关的编译事件分开，保留条件输出、解析前的时序意图和可执行时序。不含校准的同一逻辑门可由多个装置实现。 [本地作者稿](../library/engineering/tools-openqasm-paper.pdf)

### `tools-openqasm-spec` OpenQASM 3.0 正式语义

在线 Circuit timing 与 Pulse-level descriptions。delay 和 barrier 可限定调度。duration 与 stretch 随后端解析。gate 定义逻辑变换，defcal 的定义绑定设备原语，其内部条件流需要满足可编译的时长约束。

模型应保持计划占用与逻辑变换为独立关系，条件事件应指明何时可用控制值与何时可算出时长。编译规则以明确的语言及后端版本为准。 [时间规范](https://openqasm.com/versions/3.0/language/delays.html) · [脉冲规范](https://openqasm.com/versions/3.0/language/pulses.html)

### `tools-qmap` MQT QMAP 分区编译

在线 Zoned Neutral Atom Compiler 的八比特 GHZ 示例和架构定义。示例以储存与纠缠区、SLM 的阵列布局、AOD 和交互作用范围约束逻辑门的路由。具体示例的 CZ 局限在纠缠区，输出 .naviz 动作流，架构另导出 .namachine。

模型可沿逻辑门、分区布局检查、原子移动、操作事件再到动画保持引用链。示例 JSON 的时长、保真度和距离值是编译器输入例子，具体候选装置须逐项寻实验证据。 [官方编译器文档](https://github.com/munich-quantum-toolkit/qmap/blob/main/docs/na_zoned_compiler.md)

### `tools-qiskit` Qiskit ExperimentData

在线 0.14.2 文档 Class、DbExperimentData、add_data/analysis_results。容器可关联实验原始数据、元数据、分析输出和图，并链接后端、子实验和 job。可序列化上传的字段有明确契约。

模型要给运行、测量、分析及导出产物明确标识和谱系。以原始测量日后可重算为验收，结果对象中的临时字段在输出契约中显式声明。 [官方字段文档](https://qiskit-community.github.io/qiskit-experiments/stubs/qiskit_experiments.framework.ExperimentData.html)

### `tools-aquila` Amazon Braket 与 QuEra Aquila

本地官方手册。Access to local detuning on QuEra Aquila（印刷页 95–96），Submit an analog program using QuEra Aquila（123 页起），Braket AHS task result schema（135–136 页）。将布局/填充与时变 Rabi、相位和失谐分开，局域失谐空间图样在一次程序中固定，时间系数和数值范围受设备约束。测量含前后序列与 shot 状态。

模型可保留每次占位输入、空间图样、时序输出与失败标志。该设备做模拟哈密顿量演化，控制场定义和读出编码保留在它自身的协议层。 [本地手册](../library/engineering/tools-aquila.pdf)

### `tools-slm` HOLOEYE 相位型 SLM 应用说明

本地 v6.0。§2.1、§2.3、§3.4 用干涉法标定相位灰阶与稳定性，再用相机和衍射级检查效率，讨论全息光镊。波长与器件镀膜、液晶温度和波前补偿有关。

模型可把设计相位图、波长/温度对应的相位响应与原子面靶点的实测偏移分开。像素、刷新时间、相位深度和光效率归具体型号，不从示例外推到候选整机。 [本地手册](../library/engineering/tools-slm.pdf)

### `tools-aod` ISOMET AN0424 声光偏转应用说明

本地厂家应用说明 Figs. 1–4、Electronic Beam Steering 与 Appendix。扫 RF 频率改变一阶偏转角，离开中心频率时 Bragg 失配可降低效率。部分器件使用多输入相位调控或幅相表对扫频作补偿。

模型应保留输入频率到偏转角和原子面位置的校准，以及频率到光功率/阱深的独立响应。具体器件的光路倍率、扫描范围和动态响应由当前装置提供。 [本地应用说明](../library/engineering/tools-aod.pdf)

### `xp-quantinuum-guide` Quantinuum 系统指南

在线 Choose a system 和官方 System Operation 的 Full-stack Operation、Job Chunking and Performance Validation，以及 H2 Conditional Operations & Classical Logic。Helios 与 H2 提交栈有区分。系统控制可按 shot 估计分块，在块前后做状态检查、校准和复跑。中途测量的经典参数可供条件操作读取。

模型可以独立记录申请运行、编译、仪器批次、检查/重跑和有效样本，批次所花墙钟可大于原语时长和。两条 MCMR 深链接本次只返回页面外壳，操作部分用可读的官方 System Operation 及 Conditional Operations 文档核对。 [系统指南](https://docs.quantinuum.com/systems/) · [系统操作](https://docs.quantinuum.com/systems/user_guide/hardware_user_guide/operation.html) · [条件操作](https://docs.quantinuum.com/systems/trainings/h2/getting_started/conditional_operations_and_classical_logic.html)

### `xp-qick-guide` QICK 在线文档

在线 0.2.444 项目首页和 Firmware 的 tProc Waveform Ports vs. Trigger Outputs。资料区分 RFSoC 板卡、FPGA 信号生成及采集固件与 Python 编程；生成波形的端口和数字触发端口在 tProc v2 的映射分开，硬件板与固件决定可用个数和连接。

同一时序图可让波形命令和曝光等触发事件关联、独立记录物理地址和固件版本。项目首页的能力描述依赖指定硬件与固件。 [官方首页](https://docs.qick.dev/latest/) · [固件文档](https://docs.qick.dev/latest/firmware/index.html)

### `xp-qubic` Xu 等的 QubiC 控制与测量系统

作者稿 arXiv:2101.00071v3。Sec. II、Figs. 1–4、8 描述 FPGA DSP、模拟前端、本地宿主、编译与参数化采集。频率相位和包络可分开参数化，同一数字通道可映射到不同物理输出，原始 IQ 与标定脚本可独立保存。Fig. 5 用随机基准审视实际控制。

模型可用校准表追溯逻辑门到通道、参考相位和读出原始量。原子荧光的观测算子与 transmon IQ 的判读模型由各自的设备描述提供。 [本地作者稿](../library/engineering/xp-qubic.pdf)

### `xp-qubic2` Xu 等的分布式读出反馈

arXiv:2309.10333v2。Secs. III–V、Figs. 2–6 描述从 ADC、下变频积分、状态判别到分布核控制流，处理核可基于判读和内部状态执行分支，器件之间还需要时钟与数据同步。论文给出本架构的底层时序和同步实现。

模型可用一条因果路径连原始获取、积分、判决、消息传输、分支收到和脉冲启动。延迟按各独立路径、时钟和任务记录。 [本地预印本](../library/engineering/xp-qubic2.pdf)

### `tools-pairinteraction-paper` Mögerle 等的 Rydberg 建模工具

Scientific Reports 刊版。Figs. 2–4 中 MQDT 模型、RydState 的态/矩阵元与 PairInteraction 的单体/双体基底和哈密顿量分工。Fig. 3 用 ¹⁷¹Yb 的 S 型系列讨论通道混合与标签。Benchmark 和 Fig. 6 的实验对照是 ¹⁷⁴Yb 冷原子云中特定避交叉，作者注明将实验电场值重标定 1.028。

模型应记录同位素、态标签及跟踪方法、基底截断、量子缺陷数据版本、外场和边界条件，区分数据库输入、计算结果与具体实验证据。验证强度限于对应的状态、同位素与实验条件。 [本地刊版](../library/engineering/tools-pairinteraction-paper.pdf)
