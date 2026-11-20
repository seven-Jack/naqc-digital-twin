# 整机设备放大与拆解

在整机三维场景点选设备，或从设备列表选择同一项。放大后可以旋转设备、改变部件间距、点选部件查看名称和用途。关闭拆解可返回进入时的视角、轮号和回放位置。一次补位、量子门和读出继续使用原运行记录。[打开整机](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine)

## 模块清单

v0.2.0 已能显示整机、切换阵列视图、逐轮回放及查看子系统证据。当时台面、原子源和腔内阵列已经绘制，场景只给五处设备加了文字标签。这次将现有八个模块组织为 25 个可单独查看的部件。[设备目录](../src/data/machineEquipment.ts) · [装配图形](../src/scene/machineHardware.ts) · [阵列与当前帧](../src/scene/QuantumMachineRenderer.ts)

| 模块 | 可拆开的部件 | 查看时可核对什么 |
| --- | --- | --- |
| [光学平台](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/table) | 安装面、台体边框、支脚 | 安装面与支脚分别位于承重框架上下。 |
| [原子源](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/source) | 源体、输送管与出口、支架 | 沿输送管从供给端追到真空腔入口。 |
| [SLM 固定光镊](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/slm) | 调制器机体、双波长光口、中继镜架 | 储备与科学光路从机体一侧引出，在中继镜架附近汇合。 |
| [AOD 搬运光镊](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/aod) | 偏转器机体、出光口、支承底座 | 出光口连接可移动光镊的投送路径。 |
| [真空腔](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/vacuum) | 腔体与法兰、抽气接口、光镊物镜 | 侧面抽气接口与下方俘获物镜各有独立位置。 |
| [光镊阵列](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/array) | 阵列参考平面、阱位、当前帧原子 | 有阱位的地方可以没有原子。冷却起始帧原子层为空，装载后各位点按选定轮次显示。 |
| [门与探测激光](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/gate) | 钟态转移通道、里德堡通道、探测通道、共用支架 | 578 nm 钟光、301.9 nm 里德堡光和 556 nm 探测光对应不同操作。 |
| [荧光收集物镜](https://naqc-digital-twin.stonynote14.chatgpt.site/#machine/equipment/imaging) | 收集物镜、相机头、成像支架 | 从原子开始，沿镜筒到达相机头。照射原子的探测光位于门与探测激光模块。 |

台面、管路、机箱、物镜外形和拆解方向由演示模型定义，使用无量纲场景坐标。Muniz 等论文提供 ¹⁷¹Yb 基态核自旋装置中 483/460 nm 阱间交接、钟态转移、里德堡驱动和荧光成像的实验依据。正式配置与工程尺寸仍需目标装置资料。[实验论文](https://doi.org/10.1103/PRXQuantum.6.020334) · [参数与适用范围](QUANTUM_COMPUTER.md)

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
