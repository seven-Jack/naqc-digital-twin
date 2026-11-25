# 中性原子量子计算机整机数字孪生

**Neutral-Atom Quantum Computer Digital Twin**

首页展示 ¹⁷¹Yb 中性原子量子计算机的整机架构。点击任一设备，可以放大查看内部部件，并播放它在冷却、装载、原子搬运、量子门或荧光读出中的工作片段。装置参考 Muniz / Atom Computing。两腔间距采用同团队前序平台数据，交互行采用 Muniz 的阱心间距。腔壁、镜筒和支架外形为示意。

## 本地启动

需要 Node.js 22.12 或更高版本。3D 需要 WebGL 2。

```sh
npm ci
npm run dev
```

打开终端显示的本机 URL，通常为 http://127.0.0.1:5173/。开发服务器只绑定回环地址。生产构建可用以下命令检查和预览。

```sh
npm run build
npm run preview
```

## 整机演示

1. 在整机三维视图中点击设备本体或标签，也可从设备导航或功能图打开。八台设备共包含 25 个可定位部件。进入设备后可以旋转、拆解、选择部件或播放对应阶段。可用 `/#machine/equipment/aod` 直接打开搬运光镊。[设备与操作](docs/EQUIPMENT_EXPLORER.md)
2. 整机与设备片段均可从 0.1× 到 2× 按 0.1× 调速。「阵列」默认放大论文交互行，可切至「本轮占位」查看 6 × 8 回放。点击「返回整机」，继续同一轮、同一时刻的演示。顶部导航的「门操作」可逐步回放拉曼单比特门和 CZ 的钟跃迁转存、里德堡激发与钟跃迁返回，能级图与同一轮三维光路同步。
3. 在运行配置中选择 Bell、GHZ 或乘积叠加态电路，设置测量基和尝试次数。点击线路图上的 H 或 CZ 可直接查看该门的脉冲。逐阶段查看光路与占位，或跳到批次末帧比较理想概率和模拟读出。运行记录支持本地 JSON 导入与导出。
4. 在「真机实验依据」核对文献的实验条件。整机的 578 nm 态转移属于门序列，483/460 nm 阱间交接采用 Muniz 演示配置。
5. 在设备详情展开「相关文章与视频」，可以边回放边对照真空腔实物、原子重排和态选择成像。[三个片段与资料索引](docs/EQUIPMENT_EXPLORER.md#从真机资料读懂三个片段)

## 验证

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

浏览器测试在本机 5174 端口检验整机生产构建，5175 端口独立检验保留的文献组件。整机运行所需字体、图形和模型随构建打包。

## 文档

- [整机演示模型、参数与实验背景](docs/QUANTUM_COMPUTER.md)
- [Senoo 767 nm 装置与双曝光文献回放](docs/SENOO_APPARATUS.md)
- [钟跃迁物理模型记录](docs/PHYSICS.md)
- [文献与数据来源](docs/REFERENCES.md)
- [整机资料库与方案](references/README.md)
- [整机数字孪生长期项目清单](docs/PROJECT_CHECKLIST.md)
- [演示发布与科研验收执行清单](docs/RELEASE_EXECUTION_CHECKLIST.md)
- [验收记录](docs/VALIDATION.md)
- [架构](docs/ARCHITECTURE.md)
- [扩展路线](docs/ROADMAP.md)
- [整机网站交付清单、工业孪生参考与六项实测依赖](docs/WHOLE_MACHINE_DELIVERY.md)
