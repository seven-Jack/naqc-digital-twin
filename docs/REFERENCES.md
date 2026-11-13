# 文献与数据来源

## 运行时输入

- αᵍ = 257.91 a.u.、αₑ = 99.98 a.u. 源自本机 Calculation R009 的 Höhn ¹⁷⁴Yb 经验模型 532 nm 结果（257.907537 与 99.978832 a.u.），舍入后用作 ¹⁷¹Yb 标量代理，标签为 `conditional_theory`。核对工件为 `runs/R009_yb171_clock_polarizability/results/20261031T112331.757267Z/tables/clock_532_summary.md` 与同批 `data/isotope_hfs_532.json`，本地 checkout HEAD 为 `6ebfe051b380da9d897e525bf9ee0cf10f83b8a0`。使用运行时的两个 α 计算 Δα = −157.93 a.u.。
- R009 给出的 −157.925083 a.u. 来自四个已知同位素位移／对角超精细通道，其他通道冻结。保留其独立来源和不同精度。完整标准不确定度仍待确定。Calculation #23 正文中的阶段估算约为 −158 a.u. 和 +7.4 Hz/(W/cm²)。更细的数值核对以本机 R009 工件为准。 [Calculation #23](https://github.com/seven-Jack/Calculation/issues/23)
- 本地 171YbDatabase 的 `references/audits/clock-rabi-578-audit-20261030.md` 区分了 π 偏振固定 mF 的耦合矩阵元、入射功率与实际动力学。本应用以 Ω/2π 为独立的探索参数。 [171YbDatabase](https://github.com/seven-Jack/171YbDatabase)
- ν₀ 的标称十进制值为 518295836590863.632 Hz。应用保存原始十进制字符串及 JS 浮点表示。真空波长由 c/ν₀ 求得，界面用约 578 nm。 [CIPM 2025 ¹⁷¹Yb 推荐频率](https://www.bipm.org/documents/20126/288516347/171Yb_518THz_2025/73007ecc-49f5-4d1d-d8ee-6793a4748598)
- c、h、ħ、ε₀、u 与极化率换算用 CODATA 2022。¹⁷¹Yb 质量采用 NIST 表中的 170.936323 u。 [NIST CODATA 2022](https://physics.nist.gov/cuu/Constants/) · [NIST Yb 同位素表](https://physics.nist.gov/PhysRefData/Handbook/Tables/ytterbiumtable1.htm)

## 论文核对

| 文献 | 已核对位置及使用范围 |
|---|---|
| [Lis et al., PRX 13, 041035](https://doi.org/10.1103/PhysRevX.13.041035) | [作者全文](https://arxiv.org/html/2305.19266)中 Fig. 1、Appendix B.2–B.3 与 Fig. A3。759 nm 为该装置的束缚，532 nm 局域光束用于失谐控制。报告 2.4 mW **显微镜入口**功率对应约 3 MHz 位移，并测量光移操作加热。应用参数定义为原子处功率，实验使用脉冲整形及不同阱条件。该工作点提供定性比较。 |
| [Höhn et al., PRA 108, 053325](https://doi.org/10.1103/PhysRevA.108.053325) | [作者全文](https://arxiv.org/html/2305.20084)的波长依赖经验模型及补充材料引用，并核对本机 R009 归档的刊版第 11–12 页文本。单独的 APS 补充材料链接未能直接获取。测量对象为 ¹⁷⁴Yb。运行时 532 nm 数值由 R009 保存的模型求值提供。 |
| [Norcia et al., PRX 13, 041034](https://doi.org/10.1103/PhysRevX.13.041034) | [期刊全文](https://harvest.aps.org/v2/journals/articles/10.1103/PhysRevX.13.041034/fulltext) Appendix F。用 Ramsey-echo 寻找差分光移零点，报告 459.5960(5) nm 的 ¹⁷¹Yb 钟态魔术波长。该波长不属于运行时输入。 |
| [Muniz et al., PRX Quantum 6, 020334](https://doi.org/10.1103/PRXQuantum.6.020334) | [期刊全文](https://harvest.aps.org/v2/journals/articles/10.1103/PRXQuantum.6.020334/fulltext) clock-control 部分与 Appendices C、G。核对 Blackman 整形复合脉冲、运动相关耦合、激光噪声及 shelving 误差预算。保留为实验背景。 |

## 界面与实现参考

从 Terrain Mixer 取同步剖面与主视图、Modeling Studio 取优先视口、Architecture Studio 取同一模型的不同观察方式、Material Lab 取低噪声灯光与轨道交互。场景资产由本项目的高斯几何、程序化材质和光照构建。 [Terrain Mixer](https://developers.openai.com/showcase/terrain-mixer) · [Modeling Studio](https://developers.openai.com/showcase/codex-modeling-studio) · [Architecture Studio](https://developers.openai.com/showcase/architecture-studio) · [Material Lab](https://developers.openai.com/showcase/material-lab)

工程接口参见 [Vite](https://vite.dev/guide/)、[Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) 和 [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)。
