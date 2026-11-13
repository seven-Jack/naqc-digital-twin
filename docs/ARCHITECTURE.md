# 架构

React 和 TypeScript 提供面板及单一参数状态。Vite 打包静态文件。主场景直接使用 Three.js，便于显式控制渲染帧与资源释放。科学曲线使用 SVG，保持轴、图例及探针可读。

- `src/data/atomicData.ts` 保存可替换的带版本原子输入和假设。
- `src/physics/` 包含常数、单位、高斯束、势能、阱频、复振幅和 SI 快照。物理代码可从测试或未来的计算适配器独立调用。
- `src/App.tsx` 更新 `PhysicsParameterState`，统一校验输入，由 `calculateModel` 生成参数快照。改动动力学参数时复位时间。阵列的所有位点同参，选择位点时保留时间。
- `src/state/usePlayback.ts` 维护唯一的模拟时刻。布居、曲线游标、Bloch 球、原子颜色与 JSON 使用该时刻。
- `src/scene/` 接收同一模型。原子、光束、束腰环及发光 billboard 使用 GPU instancing。轨道操作和模拟动态触发按需渲染。束腰改变才重建光束几何，势面以类型和光镊参数为键。
- `src/plots/` 在模型或剖面改变时生成数据。Rabi 迹线与时间游标分开渲染。快速参数输入时，低优先级图表更新以整份快照为单位。
- `src/panels/` 实现输入、科研读数、补偿比较和脉冲时间轴。
- `tests/` 验证数值基准、解析不变量、渲染和用户交互。

画质控制限制 WebGL 像素比例。Glow 关闭后保留束腰环、光束几何和科学读数。解析传播和曲线采样可在未来由同一输入输出约定下的 Worker 或计算适配器扩展。
