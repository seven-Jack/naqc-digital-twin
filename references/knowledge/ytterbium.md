# ¹⁷¹Yb 装置与原子物理证据

对应资料库「¹⁷¹Yb 及原子数据」，逐项保留证据类型、适用条件和模型行为。装置、时序、参数和验证口径各自有来源。 [Senoo 图源表阅读记录](source-data.md) · [Senoo 门模型的参数与验收数据](senoo-gate-model-data.md)

## 可独立比较的实验配置

| 配置 | 可复核的装置与流程 | 可用于比较的模型边界 |
| --- | --- | --- |
| Muniz 门基准 | ¹S₀ 核自旋编码，483 nm 储备阱和 460 nm 科学阱共址，2 ms 功率斜坡交接。边缘交互行，578 nm 钟态转移和 301.9 nm UV 相位门，556 nm 分帧读出。 | 双阱交接、能级转移、基态/钟态泄漏和丢失可分别表达。主要证据是表征和基准测试，逐次装载、搬运及读出原始帧暂缺。[图 1、3、4 和附录 A](../library/171yb/yb-muniz-gates.pdf) |
| Muniz 五区复用和 Atom Computing 环面码 | ¹S₀ 核自旋编码，423 nm 寄存器，459 nm 功能区，483 nm 装载区，488 nm 搬运和 784 nm 腔增强晶格读出。回路可以重置、按图补位，后续实验在计算中更新储备。 | 可检查跨区调度、成像后条件分支和逻辑电路中的原子复用。运行容量、码规模、最大测量轮数分别记录。[复用图 1、附录 A–B](../library/171yb/yb-muniz-ancilla.pdf) · [环面码图 1、§II](../library/171yb/yb-atomcomputing-toric.pdf) |
| Ma 2022 自旋门 | ¹S₀ 核自旋，约 486.78 nm 成像阱，RF 单比特旋转，经过 ³P₁ 的双光子里德堡门和状态选择移除。 | 可检验模型是否支持替换门链、光谱寻址和观测方式。亮暗结果由该实验采用的成像与主动移除定义。[图 1、§§II–V](../library/171yb/yb-ma-universal-publisher.pdf) |
| Norcia 局域隐藏和 Lis omg | Norcia 用 460 nm 局域光移保护数据位。Lis 用 759 nm 固定光镊、532 nm 局域光移和 578 nm 转移，在不同内部编码架之间切换。 | 两套实验都展示选择性保护。保护机理、位标记及对数据位的扰动独立。内部态转移与原子位置改变分别表达。[Norcia 图 1、3–4](../library/171yb/yb-norcia-midcircuit.pdf) · [Lis 图 1、附录 B](../library/171yb/yb-lis-omg.pdf) |
| Ma 2023、Zhang 亚稳态擦除 | ³P₀ 核自旋承载信息，检测基态泄漏。Zhang 有存储区与门区的 SLM/AOD 交接，并使用成像结果选择辅助码块。 | 可检验泄漏、丢失、擦除标志与反馈事件之间的关系。搬运相位、加热和探测效率使用各自的测量条件。[Ma 图 1–3](../library/171yb/yb-ma-metastable-publisher.pdf) · [Zhang 图 1、4](../library/171yb/yb-zhang-erasure.pdf) |
| Senoo 多架映射与 Li 连续补给 | Senoo 使用光钟、³P₀ 核自旋、里德堡比特之间的映射。Li 将连续原子供给、成像、制备和 ³P₀ 相干存储接在一起。 | 两者分别提供量子状态架迁移和原子物流的实例。分支态、后选择和各阶段速率分别建模。[Senoo 图 1–4](../library/171yb/yb-senoo-mapping-publisher.pdf) · [Li 图 1–4](../library/171yb/yb-li-reloading.pdf) |

## 装置、搬运、门与读出

| 条目 | 直接证据与阅读定位 | 模型要求与使用边界 |
| --- | --- | --- |
| `yb-muniz-gates` | ¹⁷¹Yb 实验。图 1、附录 A 的两套匹配 SLM 阱各 12 行×7 列，交互行距其余阵列 6 µm，行内间距 3 µm，图 1 的 518 G 磁场沿侧向全局光束。经交叉 AOD 产生的 483 nm 光镊搬运后在同址改用 460 nm，线性斜坡约 2 ms。门表征用门前一张、门后三张成像。图 3 为钟态转移加 UV 条件相位及返回。图 4a 的 CZ 99.72(3)% 和 99.40(3)% 分别对应后选择和无后选择的双比特 Clifford RB 推断。[APS 刊版](../library/171yb/yb-muniz-gates.pdf) | 分开表示移动、共址换阱、光学驱动和成像。保留 0、1、钟态泄漏、丢失及每次观测的合格样本。图 4b 对应另一种基准口径，独立登记。 |
| `yb-muniz-ancilla` | ¹⁷¹Yb 实验。图 1、§II、附录 A–B 记录 128 个 423 nm 寄存器位、459 nm IZ/MZ/SZ、483 nm LZ 及 488 nm 跨区搬运。500 G 下，784 nm 共址腔增强晶格内用 556 nm 两次成像，中间泵浦使第二次可判断占位。§IV 最多演示 41 个综合征轮次。[APS 刊版](../library/171yb/yb-muniz-ancilla.pdf) | 路径按位点、区和并行约束描述。光镊输运时腔晶格关闭，成像时恢复。模拟可分别保存态选择、泵浦后占位、冷却重置和补位命令。 |
| `yb-norcia-midcircuit` | ¹⁷¹Yb 实验。图 1、表 I、图 4 在约 500 G、483 nm 阱中，对 556 nm 循环跃迁作态选择成像，460 nm 隐藏光移保护数据位。条件补位时，前 16 轮辅助位平均填充超过 98%。附录 F 测得 ¹S₀–³P₀ 魔术波长 459.5960(5) nm。[APS 刊版](../library/171yb/yb-norcia-midcircuit.pdf) | 拆分成像重叠误判、泵浦到其他态和真实丢失。数据位受保护时仍记录相位和对比度。隐藏光对 ³P₁ 成像的作用与其对 ¹S₀/³P₀ 差分光移分别建模。 |
| `yb-norcia-assembly` | ¹⁷¹Yb 实验。图 1、图 2b 是 MOT、移动光晶格、储备阱、晶格成像、单束移动光镊和目标位的闭环。1225 个目标位的典型重排前、后填充约 98%、99%。图 3b 的 7 ms 晶格成像给出 99.8(1)% 每帧存活。图 4 和附录 F 分解时序与换阱损失。[APS 刊版](../library/171yb/yb-norcia-assembly.pdf) | 占位率携带时刻和位点分母。真空间隔、换阱与成像的损失按事件记录。532 nm 是该实验的搬运晶格，目标阱和成像阱分别配置。 |
| `yb-atomcomputing-toric` | ¹⁷¹Yb 实验预印本。图 1、§II、图 3–4 显示区域化基态核自旋处理器。中途测量后冷却、重置，测量区缺位先由存储区补上。MOT 经移动光晶格送原子到装载区，并在预定节点补两区。逻辑错误率最多表征 90 个综合征轮次。[arXiv v1](../library/171yb/yb-atomcomputing-toric.pdf) | 回放可用并发的原子供应与线路事件，以及补给后的续跑。逻辑结果按具体码、循环长度和筛选条件登记。 |
| `yb-jenkins-nuclear-spin` | ¹⁷¹Yb 实验。图 1、§§II–III 的 532 nm 阱、556 nm 冷却与成像展示增强装载后，10×10 阵列平均单点占位 92.73(8)%，单阱 96.0(1.4)%。图 4 检查退相干，原文 Raman 偏振模型另有勘误。[APS 刊版](../library/171yb/yb-jenkins-nuclear-spin.pdf) | 分开记录单点占位率、单阱结果和全阵列填满概率。旋转模块使用勘误确定偏振相位。 |
| `yb-jenkins-erratum` | 方程 (1)–(3) 和图 1 修正 Raman Rabi 频率随偏振相位关系所用的相位因子。重新测量在约 +2.1 GHz 失谐下接近圆偏振处有最大耦合。原实验的测量保留。[APS 勘误](../library/171yb/yb-jenkins-erratum.pdf) | Jones 分量转入球基矢时保留复相位约定，光移和耦合单元测试引用勘误方程。束腰、强度和偏振校准独立保存。 |
| `yb-ma-universal` | ¹⁷¹Yb 两种版本的图 1、§§II–V 均给出 30 位点阵列、约 486.78 nm 的成像魔术条件、RF 单比特旋转、经 ³P₁ 到 6s74s ³S₁ 的双光子里德堡阻塞门。刊版图 1(d) 比较 ³P₁ 磁分量的差分光移，后续图给出基准和纠缠。[APS 刊版](../library/171yb/yb-ma-universal-publisher.pdf) · [arXiv v1](../library/171yb/yb-ma-universal.pdf) | ¹S₀ 至 ³P₁ 成像参数携带 F′、mF′ 和偏振，486.78 nm 与 483 nm 的条件各自保存。读出包含主动从里德堡态自动电离移除的判别。 |
| `yb-lis-omg` | ¹⁷¹Yb 实验。图 1、附录 B.2–B.3 和图 A3 分别给出 759 nm 固定阱、532 nm 局域 Stark 位移、578 nm 钟跃迁和 556 nm 读出。g/m 架的自旋位号相对 Muniz 反向。局域光位移随强度并会引入加热。[APS 刊版](../library/171yb/yb-lis-omg.pdf) | 显式保留各实验的 mF 与位号映射。532 nm 光的显微镜入口功率需经测量或传输模型转换为原子位置强度。 |
| `yb-ma-metastable` | ¹⁷¹Yb 实验。两版图 1–3 和 Methods 展示 ³P₀ 核自旋编码、RF 和单光子里德堡门，通过短时 ¹S₀–¹P₁ 荧光发现部分泄漏。刊版给出 20 µs 检查，约 33% 的双比特门错误可被检测为擦除。[Nature 刊版](../library/171yb/yb-ma-metastable-publisher.pdf) · [arXiv v1](../library/171yb/yb-ma-metastable.pdf) | 原始错误、已标记擦除和未被观测到的丢失分别保存。基态成像的检测率绑定串扰、阱深与成像基准。 |
| `yb-huie-repetitive` | ¹⁷¹Yb 实验。图 1、表 I、§III 和实时前馈实验在 58 G 下用窄线重复测量，区分态判别保真度 0.993(4)、平均存活 0.994(3) 和去极化率，并将相机结果用于条件 AC 脉冲。[arXiv v4](../library/171yb/yb-huie-repetitive.pdf) | 相机阈值、重复读出状态改变和真实丢失分别记录。成功前馈由判决、命令与后续动作组成。58 G 数据独立于 500 G 平台。 |
| `yb-reichardt-logical` | ¹⁷¹Yb 实验预印本。图 1、图 3、附录 A.2–A.5 展示 256 物理位容量、寄存器和双比特交互区、784 nm 晶格读出。24 逻辑位纠缠使用 48 个原子。附录 A 的并行移动要求保持形状以避免鬼影阱路径。[arXiv v3](../library/171yb/yb-reichardt-logical.pdf) | 容量、占位、参加线路的原子数和逻辑块数量分别存储。运动保存起终点、并行组、等待及成像。逻辑指标记录丢失样本如何进入统计或擦除解码。 |
| `yb-zhang-erasure` | ¹⁷¹Yb 实验。图 1、§II、图 4 展示存储/门区，SLM↔AOD 交接，302 nm 门，以及 EMCCD→主机→FPGA 的条件选择。适当阱偏振和偏磁相对方向下，在存活原子中推得每单程退相干和翻转小于 6×10⁻⁴，首回程离开 ³P₀ 的漏失合计 1.1(4)%。[arXiv v2](../library/171yb/yb-zhang-erasure.pdf) | 单程与往返、两种统计分母分别跟踪。按位点、轨迹和搬运历史记录加热及损失，条件动作保留实际探测结果与擦除标记。 |
| `yb-li-reloading` | ¹⁷¹Yb 实验。图 1–4 使用 ODT 输运到科学腔、连续喂给储备、光镊提取及 ³P₀ 存储。提取最高约 500 次/s，新阵列单原子制备、成像和初始化约 30 次/s，复用原子重复测量约 50 次/s。[arXiv v1](../library/171yb/yb-li-reloading.pdf) · [刊版题录](https://doi.org/10.1126/science.adz9952) | 供应、提取、制备、读出和复用的速率各有分母和阻塞时间。各阶段可分别驱动仿真事件。 |
| `yb-senoo-mapping` | ¹⁷¹Yb 实验。两版图 1–4 区分 o、m、r 编码，光镊约 767 nm，UV 约 302 nm。图 2 使用映射与顺次成像区分两种自旋与丢失，图 4 分别给出布居与相干。刊版图 2d 和扩展数据图 5b 的标签顺序与 Methods 的列举不同，需和已核实源表交叉核对。[Nature Physics 刊版](../library/171yb/yb-senoo-mapping-publisher.pdf) · [arXiv v2](../library/171yb/yb-senoo-mapping.pdf) | 单次读出、损失筛选、布居与奇偶校验分别保存。46(2) µs 与图 2(e) 的实验寿命条件相连，观测恢复分量仅约束对应的检测路径。 |
| `yb-senoo-peer-review` | 同行评审往返材料。Reviewer #2 关于图 1(c–d)、扩展数据图 5、初始化和大阵列的问答说明作者补充有效寿命、相干与损失的口径。[评审附件](../library/171yb/yb-senoo-peer-review.pdf) | 用于解释版次和测量边界。实验数值回到主文与源表版本，保留确有冲突的表述及定位。 |
| `yb-chen-omg` | ¹⁷¹Yb 实验和理论。图 1–4 与附录分析 o/m/g 操作，测量部分 S 系能级及单原子里德堡 Rabi 振荡，用模型讨论通道与串扰。[arXiv v3](../library/171yb/yb-chen-omg.pdf) | 分别保存有实测约束的跃迁和理论门序列。模型记录偏磁场、偏振和强度条件，转用耦合时需要同类条件。 |
| `yb-liu-dual-metastable` | ¹⁷¹Yb 理论方案。图 1–4、§§II–IV 给出 ³P₀ 核自旋和 ³P₂ 超精细编码，探索 ³P₂ 的约 6.7 GHz 超精细分裂、Raman 旋转、两架相干转移和分区纠错。[arXiv v1](../library/171yb/yb-liu-dual-metastable.pdf) | 可表达双亚稳架的候选流程与事件，设计点和保真度保持理论标识。 |
| `yb-wu-erasure` | ¹⁷¹Yb 擦除转换理论。图 1–4 讨论亚稳态核自旋、里德堡衰变到可见流形的探测、故障与逻辑门模型，以及 XZZX 编码性能。[Nature Communications 刊版](../library/171yb/yb-wu-erasure.pdf) | 模拟分别采样位置已知的擦除、未探测误差和粒子丢失。理论阈值的证据包含指定噪声模型和解码策略。 |
| `yb-wu-erasure-supplement` | 理论补充。补图 1、4 和表 I 分解衰变到各流形、光学探测与 CZ 状态依赖跃迁率，并讨论超精细近似。[出版方补充](../library/171yb/yb-wu-erasure-supplement.pdf) | 适合作为按通道的仿真用例。所有率需随原子态、外场、黑体条件和计算方法版本保存。 |

## 能级、场、光阱与相互作用

| 条目 | 直接证据与阅读定位 | 模型要求与使用边界 |
| --- | --- | --- |
| `yb-kroeze-reference` | ¹⁷¹Yb 汇编预印本。正文表 1–4、各跃迁分节和能级图汇总物理常数、同位素、低能态、线宽、偏振、超精细结构与矩阵元，来源包括实测和推算。[arXiv v2](../library/171yb/yb-kroeze-reference.pdf) | 建立量子数、频率单位、参考态和数据血缘字段。数值追到原始行和来源，误差、舍入及超精细解释按各条保留。 |
| `yb-nist-asd` | NIST SRD 78 v5.12，在线数据库。Yb I Levels 查询区分中性谱与 Yb II，输出组态、谱项、J、能量及原始参考。离化限和谱线另有入口。[Yb I 查询](https://physics.nist.gov/cgi-bin/ASD/energy1.pl?biblio=on&conf_out=on&format=0&j_out=on&lande_out=on&level_out=on&output=0&page_size=15&perc_out=on&spectrum=Yb+I&submit=Retrieve+Data&term_out=on&unc_out=1&units=0) · [SRD 78](https://doi.org/10.18434/T4W30F) | 适合能级布置与跨来源单位校验。未分同位素和 F、mF 的条目按组态能级保存。 |
| `yb-cipm-clock` | CIPM 推荐标准，2025 批准、2026 生效。PDF p. 1 §1 给出未微扰 ¹⁷¹Yb 6s² ¹S₀–6s6p ³P₀ 频率 518 295 836 590 863.632 Hz，相对标准不确定度 1.7×10⁻¹⁶，§2 说明全球频率比最小二乘调整。[机构 PDF](../library/171yb/yb-cipm-clock.pdf) | 存参考零点、版次和不确定度。受光移、Zeeman 移或锁定偏移影响的实验驱动频率另存。 |
| `yb-lemke-clock` | ¹⁷¹Yb 光晶格钟实验。摘要、表 I 和图 1–2 给出相对 Cs 喷泉的早期绝对频率测量及密度、晶格光、黑体和磁场系统移频。[APS 刊版](../library/171yb/yb-lemke-clock.pdf) | 可核对频率测量分开登记零点和系统移频的方法。当前推荐零点与早期测量均保留各自不确定度。 |
| `yb-hohn-potentials` | 两版的摘要、光谱与极化率分节均报告 ¹⁷⁴Yb 一维晶格的两处 ¹S₀–³P₀ 差分魔术频率和一个基态调零频率，并拟合出动态极化率随波长变化的经验模型。[APS 刊版](../library/171yb/yb-hohn-potentials-publisher.pdf) · [arXiv v2](../library/171yb/yb-hohn-potentials.pdf) | ¹⁷⁴Yb 实验点用于校验该同位素模型。用于 ¹⁷¹Yb 532 nm 场景时标成同位素代理，光强、偏振、F/mF 和待测误差分别登记。 |
| `yb-hohn-thesis` | 玻色 Yb 光晶格/光镊装置与理论。第 2 章覆盖真空、线圈、激光和物镜，第 3 章为冷却，第 4 章为魔术、基态和钟态调零测量，§1.2 说明 AC 极化率。[LMU 学位论文](../library/171yb/yb-hohn-thesis.pdf) | 用于装置模块边界、测量步骤和光场几何。机械/光路布置与微观阱内参数分别保存，实测条件按同位素、方向和冷却阶段区分。 |
| `yb-hohn-tuneout` | ¹⁷⁴Yb 实验。§II、图 2–5 以三维 triple-magic 光晶格实现成像冷却与钟激发，图 5 用调制加热确定 ³P₀ 调零频率 519.920(9) THz。[APS 刊版](../library/171yb/yb-hohn-tuneout.pdf) | 调零是单态极化率零点，魔术是两态差分为零。多束偏振与磁场夹角是核对光移的输入条件。 |
| `yb-barber-clock-shifts` | ¹⁷⁴Yb 光晶格钟实验。摘要与光移结果图表征 ¹S₀–³P₀ 魔术频率及两光子共振附近的高阶晶格光移。[APS 刊版](../library/171yb/yb-barber-clock-shifts.pdf) | 检查强光下只保留线性 Stark 项的近似。高阶系数绑定频率、偏振、阱深和测量误差。 |
| `yb-dzuba-polarizabilities` | 中性 Yb 理论。表 2–4、动态极化率和黑体位移分节给出 E1 矩阵元、静/动态极化率、魔术波长和黑体辐射位移，使用相对论多体方法。[IOP 刊版](../library/171yb/yb-dzuba-polarizabilities.pdf) | 对照模型中静态和动态极化率的来源。保留近似和波长范围，α(ω) 与静态值分开。 |
| `yb-guo-polarizabilities` | Sr 与 Yb 理论。方法与 §3、表 3–4 用组态混合和半经验芯极化势计算能级、偶极矩阵元、魔术波长和黑体移频。[IOP 刊版](../library/171yb/yb-guo-polarizabilities.pdf) | 独立计算可比对光移符号、单位和模型预测。两物种及理论近似分别入库。 |
| `yb-kroeze-cooling` | ¹⁷¹Yb/¹⁷⁴Yb 实验。图 1、3–4 用三维或二维魔术晶格、钟边带频率扫描和再泵浦进行运动冷却。¹⁷¹Yb 二维振动基态分数约 97%，平均模式占据约 0.015。[APS 刊版](../library/171yb/yb-kroeze-cooling.pdf) · [Edmond V1.1 源数据](../library/171yb/yb-kroeze-edmond-v1.1.zip) · [数据 DOI](https://doi.org/10.17617/3.Y9HP0F) | 保存维度、各轴边带、热或非热态分布与读出模型。晶格测得的占据数适用于相应阱和序列。 |
| `yb-saskin-imaging` | ¹⁷⁴Yb 实验。两版图 1–4 中 532 nm 阱配合 556 nm 窄线冷却/成像，图 2 示 ¹S₀–³P₁ 分量光移与散射，图 3 比较光子数、阈值及亮暗轨迹。[APS 刊版](../library/171yb/yb-saskin-imaging-publisher.pdf) · [arXiv v1](../library/171yb/yb-saskin-imaging.pdf) | 提供荧光直方图和读出阈值的形状对照。¹⁷¹Yb 超精细结构及差分光移另行核对，暗结果可能来自多种物理机制。 |
| `yb-yamamoto-imaging` | ¹⁷⁴Yb 光晶格实验。图 1、装置和成像分节给出 266 nm 间距二维晶格、399 nm 荧光探测及 556 nm 冷却，二者同时作用。[IOP 刊版](../library/171yb/yb-yamamoto-imaging.pdf) | 分开表达物镜、冷却束和相机像点的作用。晶格的极化率与动力学保持自己的几何参数。 |
| `yb-wilson-rydberg-trap` | ¹⁷⁴Yb 实验。图 1–4 对照 532 nm 阱内 ³S₁ 态离子芯吸引与电子 ponderomotive 排斥，图 2a 给出 n=75 开阱/关阱的存活时间常数，另有微波谱与相干测试。[APS 刊版](../library/171yb/yb-wilson-rydberg-trap.pdf) | 阱态存活、自由空间辐射寿命和相干时间分别存储。有效阱深随 n、几何、束腰与阱开关配置。 |
| `yb-fang-lifetimes` | Yb 实验和计算。方法、表 1 记录低 n S/D 系的延迟电场电离实验和含黑体修正的理论对照，表头 300 K。同位素在正文未明确。[Elsevier 刊版](../library/171yb/yb-fang-lifetimes.pdf) | 可比较寿命测量方法、量级和温度条件。装置仿真须匹配同位素、态、场、探测与损失事件。 |
| `yb-hunt-rydberg-spectroscopy` | ¹⁷¹Yb 等的实验预印本和原子结构理论。摘要、方法和光谱结果讨论 6s² ¹S₀→6s23s ¹S₀ 单重态双光子无多普勒线及 ¹P₁ 中间态。[arXiv v1](../library/171yb/yb-hunt-rydberg-spectroscopy.pdf) | 独立表示低 n 单重态光谱。经 ³P₀ 激发至高 n 三重态的门方案有自己独立的目标态和耦合。 |
| `yb-peper-mqdt` | 两版 §§II–III、图 1–3、图 7 和门应用分节覆盖 ¹⁷¹Yb/¹⁷⁴Yb S/P/D 谱、超精细阈值混合、Zeeman/Stark 校验、配对相互作用与门演示。arXiv 版还收附录和表。[APS 刊版](../library/171yb/yb-peper-mqdt-publisher.pdf) · [arXiv v2](../library/171yb/yb-peper-mqdt.pdf) | 里德堡态保留 n/ν、F/mF、通道成分及阈值约定。配对势与门有效耦合依赖 R、磁场强度和方向、所选支系。拟合和实测分别标识。 |
| `yb-peper-supplement` | 正式补充第 SI 节对 ¹⁷⁴Yb、¹⁷¹Yb 分列量子缺陷和通道旋转，第 SII 节的光谱表给出参考线和谱线，表 S36–37 给出部分 ¹⁷¹Yb P 系超精细分裂。[APS 补充](../library/171yb/yb-peper-supplement.pdf) | 定义原子模型版次与拟合复现基准。记录通道次序、参考跃迁和偏差，数学通道标记对应其原始耦合方式。 |
| `yb-peper-dataset` | Harvard Dataverse DOI 与 Peper [正文和附录](../library/171yb/yb-peper-mqdt.pdf) 所指 ¹⁷¹Yb/¹⁷⁴Yb 光谱拟合输入。32 份原始格式文件已逐文件核对校验值。[Harvard Dataverse V1.1 源数据](../library/171yb/yb-peper-dataverse-v1.1.zip) · [数据 DOI](https://doi.org/10.7910/DVN/WOGVSN) | 可做拟合输入复核。比对数据版本、原始文件清单、各列参考线后，再与独立验证样本分开存储。 |
| `yb-kuroda-mqdt` | 两种 Yb 同位素的微波光谱和 MQDT 拓展。§II 图 1 说明原子束装置，图 2、4、7 和附录分开 F/G 和修订 P 系、两种同位素及各自拟合。[APS 刊版](../library/171yb/yb-kuroda-mqdt.pdf) · [Harvard Dataverse V1.0 源数据](../library/171yb/yb-kuroda-dataverse-v1.0.zip) · [数据 DOI](https://doi.org/10.7910/DVN/YEKTRN) | 高角动量模型与 Peper 低 L 数据按版本和谱线匹配，核对原子束场条件与适用近阈值范围。 |
| `yb-pairinteraction-mqdt` | 官方手册 v2.4.0 的 Zeeman Map 和 Pair Potentials 小节给出含抗磁项的 ¹⁷⁴Yb Zeeman 图，以及 B 沿 z、原子间轴沿 x 的 ¹⁷¹Yb 双原子势。该几何配置下的总磁量子数不守恒。[MQDT 示例](https://www.pairinteraction.org/pairinteraction/v2.4.0/tutorials/examples_python/mqdt.html) | 固定物种标识、量子数、外场方向、距离、基底和求解器版本。同输入复现、数值收敛和独立实验分别验证。 |

## 阅读覆盖与数据边界

登记 41 个资料条目，含 38 个本地 PDF 条目及 3 个在线入口。44 份 PDF 包含 6 组同时存在的刊版／作者稿，本轮核对每组的主要装置、方法和图表定位。NIST ASD 核对 Yb I 查询的条目结构，PairInteraction 核对两种示例的条件和实现，Peper 数据 DOI 核对题录与正文定位。Muniz 两套装置图、Ma 2022 装置和 Senoo 图 2 已渲染核对。阅读按装置、方法、结果、关键图表和适用边界展开。补充材料逐值复算、数据集导入、原始数据拟合和数值验证是独立工作。

同一波长的功能、同位素、目标态、F/mF、偏振及外场应一起保存。不同装置的阱、读出光路和场定标各自有版本。原始观测、分类规则、后选择和重载事件分开保存，可区分未占位、读出暗态、泄漏和真实离阱。

逐次占位、搬运帧、换阱功率时序和多帧荧光原始记录仍需按装置补齐。Peper、Kuroda、Kroeze 及 Senoo 图 3、4 已有公开数据归档。各数据只约束对应条件下的观测量。 [公开数据与 DOI](../MANUAL_DOWNLOAD.md#按组件归档的公开数据) · [Senoo 首批实测数据](../../docs/SENOO_APPARATUS.md#首批实测数据)
