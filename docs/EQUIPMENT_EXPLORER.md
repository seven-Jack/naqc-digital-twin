# 整机设备放大与拆解

本地首页以整机三维架构为入口。点选设备本体、标签或右侧设备目录可放大并拆解。切换到“功能图”可沿原子与光的传递路径选择同一设备。浏览器缺少 WebGL 时，功能图和二维拆解仍可操作。

进入设备会暂停在当前轮次和时刻。选择“回放阶段”并播放或拖动，可检查 AOD 搬运的原子、门操作使用的光路或成像得到的位串。返回整机恢复原视角，时间轴停在最后查看的一帧。光学平台等支承结构显示整机阶段，压力、通量等硬件读数需有相应记录。

## 从真机资料读懂三个片段

1. **移动原子。** 在 AOD 模块播放“原子重排”。青色虚线为当前这枚原子的路径，亮点沿线移动，方框是电路需要填充的寄存器阱位。选择“Bell · 一次补位”协议后，只有在选定轮次需要补位且有可用原子时才出现补位搬运。在标准 Bell 演示中把单阱装载概率设为 9%、种子设为 171，可依次看到 F4 → E4 → D4 和 B3 → C3 → C4 → C5 → D5。
2. **原位换阱。** 在 SLM 模块播放“转入计算阱”和“转回储备阱”。每条功率条按该路自身的满量程归一化，两条曲线互补，原子坐标固定。Muniz 团队在空间匹配的 483 nm 和 460 nm 光镊间以 2 ms 线性交接。网页将过程放慢，条形长度表示演示设定。[装置论文附录 A](https://arxiv.org/html/2411.11708#A1)
3. **观察原子。** 在荧光收集物镜模块中，补位协议的初检和复查分别在该次曝光结束后报告各位点“有原子 / 空位”。末端按本轮可用位串显示“亮 / 暗”，丢失、跳过和等待都有独立提示。Muniz 的态选择探测使用沿磁场入射的 556 nm 光，探测时间为 5 ms。合成占位曝光另有演示时序，界面没有模拟相机原始像素。[成像条件与读出选择](https://arxiv.org/html/2411.11708#A1)

下面的文章和视频也可在相应设备的“相关文章与视频”中打开。视频按发布方题名、简介或章节定位，中文报道用于对照实验图像。¹⁷¹Yb 光路、波长和实验时长依据 Muniz 等的原始论文。首页功能图与局部阵列参考了量观知元“中性原子模拟器”把空位和搬运过程放在同一幅图里的展示方式。[设计参考](https://www.quspect.com/)

| 资料 | 对照设备与观看位置 |
| --- | --- |
| 尹璋琦《中性原子阵列量子计算机前沿进展介绍》 | 对照图一的装载区和相互作用区，辨认移动原子与原位换阱的区别。[墨子沙龙公众号授权转载](https://xueqiu.com/4826147079/304072236) |
| Manuel Endres, *Quantum Science with Tweezer Arrays* | 对照讲座中的逐原子组装和成像，查看重排前后的空位。[讲座录像](https://www.youtube.com/watch?v=7o6bbNdKRt0) |
| 光子盒《都2022了，你还不知道中性原子量子计算机吗？》 | 原子源、固定光镊、门。对照冷却、光镊俘获和里德堡相互作用。[研究院署名转载](https://www.whiqt.org.cn/index.php?a=index&aid=559&c=View&m=home) · [微信公众号原文入口](https://mp.weixin.qq.com/s/b69TGhRxTekNLsTUXXe5mw) |
| 量子位 · 时令《潘建伟团队突破量子操控极限！AI助力2024个原子60毫秒精准重排》 | 搬运与固定光镊。读重排前后的阵列图，留意铷阵列使用的动态 SLM 并行方案。文章中的规模和时间只适用于报道的实验。[量子位同文](https://www.qbitai.com/2025/08/321955.html) · [中国科大报道](https://news.ustc.edu.cn/info/1055/92466.htm) · [原始论文](https://doi.org/10.1103/2ym8-vs82) |
| 科学网微信公众号 · 冯维维《〈自然〉（20251106出版）一周论文导读》 | 阵列、成像。首项工作用约 12000 个阱位俘获超过 6100 个铯原子，阱位数和原子数可分别核对。[科学网同文](https://news.sciencenet.cn/htmlnews/2025/11/554859.shtm) · [原始论文](https://doi.org/10.1038/s41586-025-09641-4) |
| 詹明生《原子量子计算物理与技术》 | 原子源、门、平台。中文会议讲座，适合对照原子量子比特的制备与操控。[中国电子学会会议记要](https://www.cie.org.cn/list_42/12528.html) · [讲座录像](https://www.bilibili.com/video/BV1ANs5ePEBa/) |
| 李一一 · iCANX 报告导读《量子计算机“补货”：原子装载如何提速近100倍》 | 原子源、AOD、阵列。普林斯顿 ¹⁷¹Yb 实验一边保护已存比特，一边从持续补充的冷原子储备区准备新原子。本机“一次补位”在初检后从已装载原子中调拨一枚。科学网页提供访谈主题及直播入口。[科学网导读](https://news.sciencenet.cn/htmlnews/2026/10/573037.shtm) · [中文装置图解](https://www.quantumcas.ac.cn/2026/0929/c24874a754854/page.htm) · [原始论文](https://doi.org/10.1126/science.adz9952) |
| Antoine Browaeys, *Exploring Many-Body Problems With Arrays of Individual Atoms* | 阵列、门。主办方页面含 2023 年讲座录像和摘要，主题为单原子阵列及里德堡可调相互作用。[Simons Foundation 讲座](https://www.simonsfoundation.org/events/exploring-many-body-problems-with-arrays-of-individual-atoms/) |
| 632nm 访谈 Mikhail Lukin | 门、平台。节目章节 28:39 讨论里德堡原子，29:46 转入整机建造。[视频与章节](https://632nm.com/episodes/cold-atoms-mikhail-lukin-on-quantum-optics-and-neutral-atom-computing) |
| Caltech 实验组报道与短片 | 平台、真空腔、收集物镜。下方图集标出铯装置的超高真空腔及两张光学平台，可对照实物的安装密度；本地模型的机箱和支架为结构示意。[Caltech 原始图文与视频](https://www.caltech.edu/about/news/caltech-team-sets-record-with-6100-qubit-array) |

## 模块清单

v0.2.0 已能显示整机、切换阵列视图、逐轮回放及查看子系统证据。当时台面、原子源和腔内阵列已经绘制，场景只给五处设备加了文字标签。这次将现有八个模块组织为 25 个可单独查看的部件。[设备目录](../src/data/machineEquipment.ts) · [装配图形](../src/scene/machineHardware.ts) · [阵列与当前帧](../src/scene/QuantumMachineRenderer.ts)

| 模块 | 可拆开的部件 | 查看时可核对什么 |
| --- | --- | --- |
| [光学平台](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/table) | 安装面、台体边框、支脚 | 安装面与支脚分别位于承重框架上下。 |
| [原子源](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/source) | 原子束与冷却腔、差分输运管、支架 | 在冷却阶段播放原子云从磁光阱到科学区的输运。 |
| [SLM 固定光镊](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/slm) | 调制器机体、双波长光口、中继镜架 | 储备与科学光路从机体一侧引出，在中继镜架附近汇合。 |
| [AOD 搬运光镊](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/aod) | 偏转器机体、出光口、支承底座 | 出光口连接可移动光镊的投送路径。 |
| [真空腔](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/vacuum) | 腔体与法兰、抽气接口、光镊物镜 | 后方歧管连接抽气支路，投送物镜经玻璃窗聚焦光镊。 |
| [光镊阵列](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/array) | 阵列参考平面、阱位、当前帧原子 | 有阱位的地方可以没有原子。冷却起始帧原子层为空，装载后各位点按选定轮次显示。 |
| [门与探测激光](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/gate) | 钟态转移通道、里德堡通道、探测通道、共用支架 | 578 nm 钟光、301.9 nm 里德堡光和 556 nm 探测光对应不同操作。 |
| [荧光收集物镜](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/imaging) | 收集物镜、相机头、成像支架 | 从原子开始，沿镜筒到达相机头。照射原子的探测光位于门与探测激光模块。 |

台面、机箱、物镜外形和拆解方向由演示模型定义。两区原子位置的垂直距离使用文献标尺。Muniz 等论文提供 ¹⁷¹Yb 基态核自旋装置中 483/460 nm 阱间交接、钟态转移、里德堡驱动和荧光成像的实验依据。正式配置与工程尺寸仍需目标装置资料。[实验论文](https://doi.org/10.1103/PRXQuantum.6.020334) · [参数与适用范围](QUANTUM_COMPUTER.md)

## 工程项目参考

- **BIM 构件定位。** xeokit 可按场景实体获取包围盒，用其中心和尺度确定相机取景范围。整机中台面和出光口的尺寸相差很大，选中时按各自装配体的范围取景，窄屏同样需要看全。核对版本 `07a9878`。[xeokit 相机取景源码](https://github.com/xeokit/xeokit-sdk/blob/07a98788b78f3ff00f4ff4d1045b8dad41e3e70b/src/viewer/scene/camera/CameraFlightAnimation.js#L231-L284)
- **CAD 装配拆解。** three-cad-viewer 针对命名组件计算位移并生成拆解动画，允许退出拆解并恢复原动画。本项目给每组部件赋予展示方向，拆解比例只改变绘图层的组位置，回放数据仍保存原坐标。核对版本 `5d8828a`。[CAD 装配拆解源码](https://github.com/bernhard-42/three-cad-viewer/blob/5d8828abc1b36bcff768144f156cbac72d9fd2ae/src/core/viewer.ts#L5080-L5178)

## 逐项验收方法

1. 从画布上的设备或设备列表打开装配体，检查放大后其他机器部件让出视野。鼠标拖动仅旋转视角。用键盘操作同一入口，并在窄屏上逐个进入八个模块。
2. 对上表每组部件核对实际几何、名称与用途。从合拢调至拆开，检查部件相对位置及高亮，再将比例调回零。比较桌面与窄屏视口，查看边缘部件是否被截断。
3. 固定种子、轮号和回放时刻，记录光路、原子占位与已完成读出数。进入并退出设备，核对以上数值和原整机视角。起始空帧和已有原子的帧分别检查，避免给空位补画原子。
4. 无 WebGL 时，通过设备列表查找各组部件的名称、用途与证据。将静态资源和交互分别在已发布网址复核。[几何单测](../tests/machineEquipment.test.ts) · [浏览器回归](../tests/equipment-explorer.spec.ts) · [发布记录](RELEASE_EXECUTION_CHECKLIST.md)

上述操作已在 v0.3.0 完成桌面与窄屏验收。47 项本机生产浏览器回归、9 项公网复验通过。[发布包与回执](https://github.com/seven-Jack/naqc-digital-twin/releases/tag/v0.3.0)

## 正式装置待验

结构示意、文献复现和同装置实测各自保留来源。当前资料仍缺同装置双曝光 CAL、冻结规则后的独立 VAL、装载及搬运原始日志、同版本 CZ 波形和独立门响应、Senoo 扩展数据图 4f 原始拟合记录，以及带已标定相位和已验证读出的独立 Bell 批次。[六项收件条件与执行顺序](WHOLE_MACHINE_DELIVERY.md#正式定量验收仍需六项证据)

### 整机装配与光轴

Muniz 等的 ¹⁷¹Yb 实验使用相对的两只高 NA 物镜。一只投送固定阱、移动阱和局域 Raman 光，另一只专收 556 nm 荧光。图 1a 中 578 nm 与 301.9 nm 沿交互行同向传播，556 nm 探测沿同一轴反向传播。三维与功能图均采用这一相对方向。起点、折转镜的数量和台面布置为演示选择。[实验图 1a](https://arxiv.org/pdf/2411.11708#page=2) · [附录 A](https://arxiv.org/html/2411.11708#A1)

同团队 Norcia 等的 ¹⁷¹Yb 装置用差分抽气管连接 MOT 区与科学区。原子束先在 MOT 区经 399 nm 和 556 nm 两步冷却，再由 532 nm 移动晶格垂直输运 300 mm。三维场景以 10 个场景单位表示 1 m，两个原子位置相距 3 个单位。演示将科学区画在上方，两只物镜横置以展现共轴光路。安装朝向、腔壁、泵路与法兰尺寸仍需同机装配图核实。300 mm 的测量对象为原子位置，取自 Muniz 引用的前序平台。[Norcia 2023 附录 A](https://arxiv.org/html/2305.19119#A1) · [Norcia 2024 图 1](https://arxiv.org/pdf/2401.16177#page=2) · [Atom Computing 白皮书第 10 页](https://atom-computing.com/wp-content/uploads/2025/01/Atom-Computing-Whitepaper-2025.pdf#page=10)

三维“阵列 → 论文交互行”与两腔装配共用世界坐标长度单位，切换阵列时相机放大微米区域。阱心标记直径供辨认，左下的 84 点索引仅表示行列。“尺寸图 → 交互行”按 Muniz 附录 A 的 12 行 × 7 列阵列绘出交互行。阱心间距 3 μm，最外两阱中心跨度 18 μm（6 段 × 3 μm），与最近储备行间隔 6 μm。其余储备行的间距待核。投送物镜 NA 为 0.65，视场为 0.5 mm。[Muniz 附录 A](https://arxiv.org/html/2411.11708#A1)

整机与设备片段共用 0.1× 至 2× 的播放速度，每档相差 0.1×。倍率只调整浏览器时间轴。合成回放的冷却阶段前半展示 MOT，后半用光点示意样品经过输运管。分段时长与光点轨迹由演示设定；导入记录没有原子云轨迹时仅显示阶段信息。6 × 8 合成回放的阱位坐标按行列绘制，微米标尺仅用于论文交互行。


### 在整机中回放量子门

首页导航的「门操作」打开同一轮的脉冲演示。在「门与探测激光」的设备回放中也能点选步骤。Bell 和 GHZ 可选具体的 CZ 及其参与比特。点击钟跃迁转存、里德堡激发与阻塞、钟跃迁返回中的任一步，浏览器会暂停并将整机定位到这段起点。播放此门会停在该门末帧。乘积叠加态电路仅列出其实际包含的 H 门。回放时间、0.1×–2× 倍速和三维光路与整机一致。

Muniz 装置在 460 nm 科学阱内，对两个 ¹⁷¹Yb 比特同步施加 578 nm 钟光，将 |1⟩ 分量转入 |c⟩（³P₀，mF = −1/2）。实验的转存和返回各使用一次 Blackman 整形的 Y(π/2) → X(π) → Y(π/2) 复合钟脉冲。中间的 301.9 nm 紫外脉冲以近似方形的幅度包络和随时间调制的相位耦合 |c⟩ 与 |r⟩（65 ³S₁，F = 3/2，mF = −3/2）。里德堡阻塞抑制双激发。第二个钟脉冲将钟态分量送回 |1⟩。用虚拟 Z 旋转补偿单比特相位后，|11⟩ 获得相对 π 相位。[Muniz 等，第 IV 节及图 3a](https://harvest.aps.org/v2/journals/articles/10.1103/PRXQuantum.6.020334/fulltext#page=5)

面板中的能级图高亮被驱动的通道，三个脉冲的包络为示意，三段均分演示时间。「理想输入分量」可对照 |00⟩、|01⟩、|10⟩ 和 |11⟩ 在该步的耦合或映射。已跳过的门显示跳过状态。H 门视图展示两束光经虚能级耦合基态核自旋，以及两个基态分别通过 H 门后的叠加态。图中 5 GHz 是 Muniz 等给出的单光子红失谐，参照 ¹S₀ ↔ ³P₁（F = 1/2）谱线。[Muniz 等，第 III 节](https://harvest.aps.org/v2/journals/articles/10.1103/PRXQuantum.6.020334/fulltext#page=3)
