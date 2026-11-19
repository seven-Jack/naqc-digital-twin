# Ma 与 Kim 的公开读出数据复现

**证据等级为跨装置对照。** 2026-11-19 归档 Ma 的 24 个已发表阈值点，以及 Kim 的 96 对真实实验双帧 ROI 计数及重算判决。Senoo 正式 CAL／VAL 按当前安排继续暂缓，验收仍需同装置逐轮数据与冻结后的独立采集。 [Senoo 读出资料与验收缺项](senoo-readout-calibration.md)

## Ma 等图 2g 的 24 个阈值

Ma 的装置将 ¹⁷¹Yb 核自旋编码在亚稳态 ³P₀，以 486.8 nm 光镊俘获。基态擦除检测用 399 nm 的 ¹S₀ ↔ ¹P₁ 快速荧光，图 2d 所示曝光为 20 µs。图 2g 扫描快成像的相机计数阈值，观察单比特随机基准测试中的擦除检测效果。 [论文图 2 及 Methods](https://doi.org/10.1038/s41586-023-06438-1) · [本地刊版](../library/171yb/yb-ma-metastable-publisher.pdf)

归档 Harvard Dataverse V2 的 6 份原始 CSV（CC0 1.0）。`Fig2.csv` 为文件 7100034，图 2g 使用 `T2:Y25`。两条序列的 24 个横坐标逐点相等，阈值范围为 262.5–4000 counts，间隔 162.5 counts。复现表保留每个点的源行、两项中心值和 ±1 标准差，逐字段与原始小数文本核对。 [原始 Fig2.csv](../library/171yb/yb-ma-erasure-dataverse-v2/Fig2.csv) · [下载与校验清单](../library/171yb/yb-ma-erasure-dataverse-v2/provenance.json) · [官方数据集 DOI](https://doi.org/10.7910/DVN/TJ6OIF) · [24 点 CSV](data/ma-fig2g-threshold-scan.csv)

图 2g 的 $P(\mathrm{err}\mid\mathrm{det})$ 是检测到擦除时，RB 序列末端存在错误的条件概率。$R_e=(\epsilon-\epsilon_c)/\epsilon$ 用未按擦除筛选和按擦除筛选后的 RB 错误率估计检出的错误份额。阈值上升时，前者在本扫描中升高，后者总体下降。图 2e 的图注给出约 700 counts，图 2g 中最近的公开扫描点为 750 counts。 [图 2g 复现图](data/ma-fig2g-threshold-scan.png) · [论文图 2 口径](https://doi.org/10.1038/s41586-023-06438-1)

| 阈值（counts） | $P(\mathrm{err}\mid\mathrm{det})$ | $R_e$ | 源范围 |
| ---: | ---: | ---: | --- |
| 262.5 | 0.32797 ± 0.01405 | 0.56056 ± 0.06902 | `T2:Y2` |
| 750.0 | 0.67946 ± 0.02400 | 0.52955 ± 0.04137 | `T5:Y5` |
| 4000.0 | 1 ± 0 | 0.02920 ± 0.06237 | `T25:Y25` |

公开表支持复现图点、误差条和阈值权衡。逐阈值纳入分母、逐轮擦除标签及两项统计的原始观测未随该表发布。高阈值端的 `1 ± 0` 和越过零线的误差条均按发表源表保留。图 2d 的亮暗直方图可用于独立查看成像计数分布，逐轮关联仍缺数据。

## Kim 等 Exp34 的真实双帧

Kim 的装置用 813 nm 光镊俘获 ⁸⁷Rb，以 780/480 nm 双光子驱动连接基态 $g=5S_{1/2},F=2,m_F=2$ 与里德堡态 $r=71S_{1/2},m_J=1/2$。每轮第 1 帧在随机装载后拍摄，第 2 帧在绝热演化结束并重新开启光镊后拍摄。表 2 的 Exp34 为 3,479 轮，$\Delta/2\pi$ 从 −4.0 MHz 扫至 2.5 MHz，扫描时长 4.5 µs，使用 SPAM2 组。 [刊版图 2、图 3、表 2 与 Data Records](https://pmc.ncbi.nlm.nih.gov/articles/PMC10805775/) · [论文 DOI](https://doi.org/10.1038/s41597-024-02926-9)

归档 Figshare v1 的 `Exp34.mat`（文件 42976216，约 4.2 MB）和 `Digitize_Data.m`（文件 41930382），两份均按库方 MD5 和本地 SHA-256 核对。`fluoAreshape` 和 `fluodigreshape` 的轴是 **198 位点 × 2 帧 × 3,479 轮**。`threshold` 是 198 × 1，同一位点的两帧共享阈值。作者代码第 96、99 行表明计数 **≥ 阈值** 判为占位，两帧的逻辑列号为 `2r−1` 与 `2r`（`r` 从 1 开始）。 [原件与来源清单](../library/neutral-atoms/kim-mis-figshare-v1/manifest.json) · [Figshare 数据 DOI](https://doi.org/10.6084/m9.figshare.23828004.v1) · [作者代码 DOI](https://doi.org/10.6084/m9.figshare.23911368.v1)

固定取前 8 轮、前 12 位点，按同一轮和同一位点提取两帧。逐帧按各位点阈值重算，**96/96 对和 192/192 个帧判决**与作者数字化结果相同。将帧次对调后有 **15/96 对**发生差异。样本中恰等于阈值的帧有 0/192，等号口径由作者代码确认。第 5 轮第 1 位点的计数为 602.76 和 523.36，阈值为 555.3302903133076，源表与重算均为 `10`。 [逐对 CSV](data/kim-mis-exp34-paired-readout.csv) · [检查汇总](data/kim-mis-exp34-paired-readout.json)

| 初帧／终帧占位 | 双帧对数 |
| --- | ---: |
| `00` | 47/96 |
| `01` | 0/96 |
| `10` | 15/96 |
| `11` | 34/96 |

若按初帧有原子筛选，分母为 49 对，终帧存在 34/49，终帧未重捕 15/49。作者协议将终帧重捕与未重捕作为 $g$ 和 $r$ 的观测代理，存在制备与测量误差。上面的检查从公开 ROI 计数开始。下节对同一批观测逐帧追溯到像素。 [原始 TIFF 数据目录](https://doi.org/10.25452/figshare.plus.24523198.v1)

## Kim 原始 TIFF 像素复算

**跨装置对照，⁸⁷Rb Exp34 原始像素。** 从 Figshare Plus 的 `Exp34_X1.tif`（文件 43077082）读取首 6 MiB。HTTP 返回 `206` 和 `Content-Range: bytes 0-6291455/1640260430`。截取第 1–16 页，保留 541 × 301 的 16 位灰度像素及原页序。为使样本可独立打开，将第 16 页目录的后继指针置零，并在其完整标签之后截断。16 页的解码像素逐页与来源字节核对。来源清单保存下载范围、压缩条带偏移、范围和样本 SHA-256、逐页像素 SHA-256。完整 TIFF 的 MD5 为库方目录值，本次校验覆盖读取范围和样本。 [16 页 TIFF 样本](../library/neutral-atoms/kim-mis-figshare-v1/Exp34_X1-pages-1-16.tif) · [像素来源清单](../library/neutral-atoms/kim-mis-figshare-v1/Exp34_X1-sample-provenance.json) · [原始数据 DOI](https://doi.org/10.25452/figshare.plus.24523198.v1)

作者 `Digitize_Data.m` 第 25–35 行在初始中心的 11 × 11 像素窗口里用整栈平均图找峰，并列峰按 MATLAB 列优先取首个。第 45–55 行取选定中心周围 5 × 5 的 25 个像素求平均，第 96 和 99 行用 `计数 ≥ 阈值` 判为占位。公开 `xxyy_init.mat` 保存 198 个初始中心，一基坐标 `(x, y)` 对应 TIFF 的列、行。Exp34 MAT 提供位点阈值、ROI 计数和判决。 [初始坐标](../library/neutral-atoms/kim-mis-figshare-v1/xxyy_init.mat) · [作者代码](../library/neutral-atoms/kim-mis-figshare-v1/Digitize_Data.m) · [归档 MAT](../library/neutral-atoms/kim-mis-figshare-v1/Exp34.mat)

固定取前 8 轮、前 12 位点。第 `2r−1` 页对应第 `r` 轮的装载后帧，第 `2r` 页对应演化后帧。保留三种处理的逐帧输出。第一种直接使用公开初始中心。第二种用第 1–4 轮的 8 页像素平均图按作者找峰规则定位。第三种在各位点同一个 11 × 11 窗口内，用第 1–4 轮的 8 个已归档 ROI 计数限定像素和，12 个位点各找到唯一中心。固定这些中心后，以第 5–8 轮的 8 页做留出核对，所有方法共用同一批归档位点阈值。 [逐帧像素和、计数残差与判决 CSV](data/kim-mis-exp34-tiff-audit.csv) · [坐标与统计汇总](data/kim-mis-exp34-tiff-audit.json)

| 5–8 轮固定中心核对 | 计数完全一致 | 占位判决一致 | 最大绝对计数差 |
| --- | ---: | ---: | ---: |
| 公开初始中心 | 1/96 | 75/96 | 79.64 counts |
| 仅用 1–4 轮像素均值找峰 | 24/96 | 90/96 | 77.72 counts |
| 用 1–4 轮公开计数反查中心 | 96/96 | 96/96 | 0.00 counts |

以第 5 轮第 2 位点的装载后帧为例，初始中心 `(88, 54)` 算得 557.08 counts，8 页均值找峰 `(86, 56)` 算得 555.68 counts。用前半段反查所得中心 `(85, 51)` 的像素和为 14,770，除以 25 得 590.80，与 MAT 完全一致。按该位点阈值 554.7269847657376，三种处理在这一页都判为 `1`，说明判决相同仍应核对计数。把同轮两页交换后，前 8 轮的 **192/192 个位点帧计数**产生差异，**15/96 对占位序列**发生变化，其中留出段为 **10/48 对**。 [逐帧 CSV](data/kim-mis-exp34-tiff-audit.csv)

小样本验证了像素积分、帧序与占位规则。中心反查使用同一 TIFF 分件的前半段公开计数，后半段用于检验中心能否复用。作者的整栈均值定位和直方图选阈值需覆盖完整帧栈，当前结果限于该分件开头的 12 个位点。Senoo 正式 CAL／VAL 继续暂缓。

## Kim Exp34 整栈分件与阈值核对

**跨装置对照，⁸⁷Rb Exp34。** 三个公开 TIFF 按 `X1 → X2 → X3` 串接，全局页号从 1 开始。每轮先装载成像，再在演化并恢复光镊后成像。先期抽查复用已归档的 X1 首部，另用五次公开 Range 请求获取各接缝及 X3 末尾，共 4,718,592 字节。用各分件首末两页的 12 个位点的 5 × 5 像素和与归档 MAT 计数比对，确定端点页号。Taiyi 两遍顺序遍历完整 TIFF，复核了各分件页数。 [分件来源](https://doi.org/10.25452/figshare.plus.24523198.v1) · [论文 Data Records](https://pmc.ncbi.nlm.nih.gov/articles/PMC10805775/#Sec7) · [范围和端点报告](data/kim-mis-exp34-boundary-audit.json) · [本地范围清单](../library/neutral-atoms/kim-mis-figshare-v1/exp34-boundary-ranges/ranges.json)

| 分件 | Figshare 文件 ID | 端点对应的全局页 | 核对页数 |
| --- | ---: | --- | ---: |
| `Exp34_X1.tif` | 43077082 | 首 1、2，末 5000、5001 | 5,001 |
| `Exp34_X2.tif` | 43097950 | 首 5002、5003，末 6401、6402 | 1,401 |
| `Exp34_X3.tif` | 43097944 | 首 6403、6404，末 6957、6958 | 556 |

第 2501 轮第一帧是 X1 末页，第二帧是 X2 首页。X2 末页是第 3201 轮第二帧，X3 首页是第 3202 轮第一帧。复算按全局页号 $p$ 保存 `ceil(p/2)` 对应的轮次及帧号，分件切换时保留前一帧。 [端点逐页证据](data/kim-mis-exp34-boundary-audit.json)

X1 与 X2 抽查的 8 页各有 12/12 个位点计数完全吻合。沿用 X1 反查中心时，X3 抽查的 4 页有 12/48 个计数完全吻合，最大差 17.84 counts，占位仍一致 48/48。按 X3 首两页在作者的 11 × 11 窗口反查，12 个位点各找到唯一中心。位点 1–8、10 的列坐标相对 X1 增加 1 px，行坐标一致。固定中心后，X3 末两页的计数和占位均吻合 24/24。该位移只在接缝抽样中验证。 [中心与残差明细](data/kim-mis-exp34-boundary-audit.json)

### 阈值选取口径抽查

按作者先设置 `BinEdges = [mean−45, mean+75]`、再设置 `NumBins = 70` 的顺序，复算脚本采用在该区间上构造 70 个等宽箱的数值实现。按 MATLAB 的箱边界约定，各箱左闭右开，末箱含右端。查第 10–25 箱，首个最小频数箱的左边缘作为该位点的阈值。同一位点的两帧均以 `计数 ≥ 阈值` 判占位。 [作者判读代码](https://doi.org/10.6084/m9.figshare.23911368.v1) · [MathWorks 直方图属性](https://www.mathworks.com/help/matlab/ref/matlab.graphics.chart.primitive.histogram-properties.html)

用归档 MAT 的位点 1、2、3、12、198 各 6,958 个已有计数抽查，选中的箱号依次为 25、25、25、24、25，阈值最大差 $1.37\times10^{-12}$ counts。全量阈值复核结果见下文。 [五位点复算结果](data/kim-mis-exp34-threshold-spotcheck.json)

### Taiyi 整栈执行记录

作业在 Taiyi 的 `/home/HXLIU/Exp34/20261119T033716Z` 独立目录完成。分段拼接初次触及下载进程的 512 MiB 内存上限，复用原有分段重新拼接。三个完整 TIFF 共 2,282,132,236 字节，各自的字节数及 Figshare 登记 MD5 均通过校验。 [工作包输入与哈希](data/kim-mis-exp34-stack-work-package.json) · [原件校验](../library/neutral-atoms/kim-mis-figshare-v1/exp34-taiyi-20261119T033716Z/tiff-integrity.json) · [首次拼接日志](../library/neutral-atoms/kim-mis-figshare-v1/exp34-taiyi-20261119T033716Z/fetch-ranges-attempt1-unit.log)

2026-11-19 12:41:46（北京时间）通过资源复核后启动，12:42:25 成功退出。作业限制为 1 CPU、4 GiB 内存和单线程数值库，记录的峰值内存约 119 MiB。四个结果文件回传后均核对了 SHA-256。 [资源准入](../library/neutral-atoms/kim-mis-figshare-v1/exp34-taiyi-20261119T033716Z/resource-admission.json) · [作业退出日志](../library/neutral-atoms/kim-mis-figshare-v1/exp34-taiyi-20261119T033716Z/compute-unit-final.log) · [复算脚本](../../scripts/reproduce-kim-mis-exp34-stack.py)

第一遍计算 6,958 页的平均图像，以 11 × 11 搜索窗口和列优先并列规则确定 198 个固定 ROI 中心。第二遍按这些中心求 5 × 5 像素均值，重建计数、阈值和占位。计数按整数像素和精确比较，阈值容差为 $10^{-9}$ counts，占位按位比较。逐帧文件保存全局页、分件页、轮次和帧号，回传后复核了第 2501 轮跨分件配对及第 3201／3202 轮分界。 [执行摘要](../library/neutral-atoms/kim-mis-figshare-v1/exp34-taiyi-20261119T033716Z/returned-results/summary.json) · [逐帧对照 CSV.gz](../library/neutral-atoms/kim-mis-figshare-v1/exp34-taiyi-20261119T033716Z/returned-results/frame-comparison.csv.gz)

### ROI、阈值、逐帧计数和占位差异

- **ROI 中心。** 197/198 个整栈峰位与 `xxyy_init.mat` 的公开初值有偏移，两个坐标轴各最大偏移 4 px。此前由 X1 早期归档计数反查的 12 个中心全部吻合。归档提供初始坐标，作者最终应用的全阵列 ROI 中心仍待确认。 [逐位点对照 CSV](../library/neutral-atoms/kim-mis-figshare-v1/exp34-taiyi-20261119T033716Z/returned-results/site-comparison.csv) · [前 12 位点中心](data/kim-mis-exp34-tiff-audit.json)
- **阈值。** 直接输入归档计数，198/198 个阈值在容差内重现。改用从 TIFF 复算的计数，56/198 个阈值与归档吻合，最大绝对差为 5.90326 counts。56/198 个位点的整段计数序列完全一致。两种输入的对照显示，归档阈值可以由归档计数复现，整栈像素重算的差异已出现在阈值选取前的计数阶段。 [逐位点对照 CSV](../library/neutral-atoms/kim-mis-figshare-v1/exp34-taiyi-20261119T033716Z/returned-results/site-comparison.csv) · [70 箱边界和频数](../library/neutral-atoms/kim-mis-figshare-v1/exp34-taiyi-20261119T033716Z/returned-results/histograms.json)
- **逐帧计数和占位。** 3,479 轮共 1,377,684 个位点帧，1,172,120 个计数完全一致，最大绝对计数差为 37.40 counts。用复算计数及复算阈值时，占位与归档 `fluodigreshape` 相差 1,409 位。保留复算计数、改用归档阈值时，相差 953 位。 [执行摘要](../library/neutral-atoms/kim-mis-figshare-v1/exp34-taiyi-20261119T033716Z/returned-results/summary.json)

| 分件 | 位点帧分母 | 计数差异 | 占位差异（复算阈值） |
| --- | ---: | ---: | ---: |
| X1 | 990,198 | 104,728（10.58%） | 834（0.084%） |
| X2 | 277,398 | 29,331（10.57%） | 235（0.085%） |
| X3 | 110,088 | 71,505（64.95%） | 340（0.309%） |
| 合计 | 1,377,684 | 205,564（14.92%） | 1,409（0.102%） |

X3 的计数差异比例最高，X1 和 X2 也各有约 10.6% 的差异。X3 接缝抽样的 1 px 偏移能解释该样本中的差异，作者是否按分件应用不同中心仍待确认。占位差异以 Kim 归档判决为比较对象，证据范围是该 ⁸⁷Rb 装置的像素到二值占位流程。Senoo 正式 CAL／VAL 继续暂缓。 [分件端点证据](data/kim-mis-exp34-boundary-audit.json) · [Kim 等，Scientific Data](https://doi.org/10.1038/s41597-024-02926-9)

## Kim Exp34 分件 ROI 反查与留出核对

**跨装置对照，⁸⁷Rb Exp34。** Taiyi 作业 `/home/HXLIU/Exp34/roi-20261119T052352Z` 复用上一轮原件，重新通过三份 TIFF 的字节数和 MD5、两份 MAT 的 SHA-256 校验。作业于 2026-11-19 13:25:07–13:25:38（北京时间）运行，使用 1 CPU、4 GiB 内存上限，峰值约 66 MiB。回传复核了结果哈希、候选评分、分母和页序。 [工作包](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/payload/work-package.json) · [资源准入](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/resource-admission.json) · [执行日志](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/compute-unit-final.log) · [复算脚本](../../scripts/refit-kim-mis-exp34-roi.py)

按全局轮次切分，两帧始终同组。轮号除以 4 余 1 的轮次及此前抽查轮次进入定位，其余 2,599 轮留出。第 2501 轮跨 X1 和 X2，两帧都用于定位，X3 首末两轮也归入定位组。每个分件分别在 198 个公开初值的 ±5 px 窗口内枚举 121 个中心，比较 5 × 5 的整数像素和与归档计数乘以 25 的整数值。先选错配数最少的中心，再按绝对差之和、列优先顺序处理并列。留出帧只用于核对。占位一律使用同一归档位点阈值，计数达到阈值即判占位。整栈固定中心来自上一轮的全图像均值。 [候选评分](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/returned-results/localization-candidate-scores.csv.gz) · [逐页留出对照](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/returned-results/holdout-page-comparison.csv)

| 分件 | 定位页 | 留出页 | 留出位点帧分母 | 计数差异，整栈 → 分件 | 占位差异，整栈 → 分件 |
| --- | ---: | ---: | ---: | ---: | ---: |
| X1 | 1,265 | 3,736 | 739,728 | 78,243 → 0 | 361 → 0 |
| X2 | 353 | 1,048 | 207,504 | 21,945 → 0 | 102 → 0 |
| X3 | 142 | 414 | 81,972 | 53,256 → 0 | 258 → 0 |
| 合计 | 1,760 | 5,198 | 1,029,204 | 153,444 → 0 | 721 → 0 |

X1 和 X2 的 198 个反查中心逐位点相同，各分件的前 12 个坐标也与先前抽查吻合。X3 相对 X1 有 58 个位点坐标相同，77 个仅列坐标加 1，39 个同时列加 1、行减 1，23 个仅行减 1，1 个仅行加 1。相对整栈固定中心，X3 有 78 个位点仅列加 1。下表从同一整栈基线开始，逐行记录在 X3 的 81,972 个留出位点帧上纠正、引入和最终的差异。 [198 位点坐标与位移](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/returned-results/roi-centers.csv) · [逐位点留出对照](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/returned-results/holdout-site-comparison.csv)

| X3 中心方案 | 计数纠正 | 计数新增差异 | 计数最终差异 | 占位纠正 | 占位新增差异 | 占位最终差异 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 整栈中心全阵列列加 1 | 32,249 | 28,509 | 49,516 | 190 | 185 | 253 |
| 仅对定位帧支持列加 1 的 78 个位点应用偏移 | 32,190 | 0 | 21,066 | 133 | 0 | 125 |
| X3 逐位点反查中心 | 53,256 | 0 | 0 | 258 | 0 | 0 |

78 个位点的一像素水平偏移消除了 X3 基线计数差异的 60.44%（32,190/53,256）和占位差异的 51.55%（133/258）。全阵列统一右移的净降幅为 7.02% 和 1.94%。使用 198 个 X3 反查坐标后，所有留出位点帧均复现归档。 [执行摘要](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/returned-results/summary.json)

在指定候选窗口、定位帧和留出帧内，**0/594 个分件 × 位点组合有未解歧义**。每个组合在定位帧上恰有一个候选复现全部计数，固定后在留出帧逐点复现计数及占位。定位和留出均来自 Exp34 同一采集批次，支持按分件固定坐标重建 Kim 的归档处理结果。作者当时的坐标选取记录、分件处理步骤及坐标变化的物理原因仍未确认。Senoo 正式 CAL／VAL 继续暂缓。 [歧义清单](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/returned-results/ambiguities.json) · [回传校验](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/returned-verification.log) · [作者通用判读代码](../library/neutral-atoms/kim-mis-figshare-v1/Digitize_Data.m)

## Kim Exp34 固定分件 ROI 的全帧阈值与双帧复算

**跨装置对照，⁸⁷Rb Exp34 同批次重建。** Taiyi 作业 `/home/HXLIU/Exp34/pairs-20261119T053434Z` 冻结上一轮 594 个分件 ROI，并复核三份完整 TIFF 的 MD5、两份 MAT 和 ROI 表的 SHA-256。2026-11-19 13:37:36–13:37:55（北京时间）完成复算，使用 1 CPU、4 GiB 内存上限，峰值约 129 MiB。回传逐一核对结果 SHA-256、3,479 轮的页序和第 2501 轮的 198 条明细。 [冻结坐标](../library/neutral-atoms/kim-mis-figshare-v1/exp34-roi-taiyi-20261119T052352Z/returned-results/roi-centers.csv) · [工作包](../library/neutral-atoms/kim-mis-figshare-v1/exp34-pairs-taiyi-20261119T053434Z/payload/work-package.json) · [退出日志](../library/neutral-atoms/kim-mis-figshare-v1/exp34-pairs-taiyi-20261119T053434Z/compute-unit-final.log) · [复算脚本](../../scripts/replay-kim-mis-exp34-pairs.py)

按 X1 → X2 → X3 读取 6,958 页，用各页所属分件的中心将 5 × 5 整数像素和除以 25。每个位点用全部 6,958 个计数计算均值，在 `[均值 − 45, 均值 + 75]` 上生成 70 个等宽箱，取第 10–25 箱中最先达到最低频数的箱左边界。每个位点两帧共享这次重选的阈值，计数达到阈值即判占位。阈值比较使用 $10^{-9}$ counts 容差，计数和判决逐项精确比较。所有位点和两帧均纳入分母。 [作者判读代码](../library/neutral-atoms/kim-mis-figshare-v1/Digitize_Data.m) · [198 个阈值及差值](../library/neutral-atoms/kim-mis-figshare-v1/exp34-pairs-taiyi-20261119T053434Z/returned-results/threshold-comparison.csv) · [70 箱边界和频数](../library/neutral-atoms/kim-mis-figshare-v1/exp34-pairs-taiyi-20261119T053434Z/returned-results/histograms.json)

| 核对项 | 分母 | 差异 |
| --- | ---: | ---: |
| 逐位点阈值 | 198 | 超容差 0，最大绝对差 $3.30\times10^{-12}$ counts |
| 逐帧 ROI 计数 | 1,377,684 | 0，最大绝对差 0 counts |
| 逐帧占位判决 | 1,377,684 | 0 |
| 同一位点的有序双帧对 | 688,842 | 0 |
| 整轮至少一个位点对有差异 | 3,479 | 0 |

X1、X2、X3 的计数及帧判决分母分别为 990,198、277,398、110,088，各组差异均为 0。全批次有序占位 `00/01/10/11` 分别为 309,907、8,379、138,923、231,633 对。最接近重选阈值的计数也相差 $1.38\times10^{-4}$ counts。 [执行摘要与分母](../library/neutral-atoms/kim-mis-figshare-v1/exp34-pairs-taiyi-20261119T053434Z/returned-results/summary.json) · [逐轮页码、分母和差异](../library/neutral-atoms/kim-mis-figshare-v1/exp34-pairs-taiyi-20261119T053434Z/returned-results/round-comparison.csv) · [全量位点对](../library/neutral-atoms/kim-mis-figshare-v1/exp34-pairs-taiyi-20261119T053434Z/returned-results/paired-comparison.csv.gz)

**第 2501 轮**的第一帧是 X1 第 5,001 页（全局页 5,001），第二帧是 X2 第 1 页（全局页 5,002）。计数和占位均为 0/396 差异，有序位点对为 0/198 差异。`00/01/10/11` 各有 87、4、35、72 对。只交换这轮的两帧会造成 39/198 个有序位点对与归档不同，逐位点计数与页码也支持原帧序。 [第 2501 轮计数、阈值、坐标和判决](../library/neutral-atoms/kim-mis-figshare-v1/exp34-pairs-taiyi-20261119T053434Z/returned-results/round-2501.csv) · [回传校验](../library/neutral-atoms/kim-mis-figshare-v1/exp34-pairs-taiyi-20261119T053434Z/returned-verification.log)

本轮把 Exp34 同一批次的像素、计数、阈值和占位连到一起。第 2501 轮曾参与上一步 ROI 定位，公开数据仍缺作者的实际定位记录和独立批次证据。Senoo 正式 CAL／VAL 继续暂缓。

## 复核和适用范围

```sh
python3 -B scripts/reproduce-ma-erasure-thresholds.py --check
python3 -B scripts/audit-kim-mis-readout.py --check
python3 -B scripts/audit-kim-mis-tiff.py --check
```

Ma 的 CSV 复核只需 Python 标准库，使用 `--plot` 可借助 Matplotlib 重画误差条。Kim 的复核通过 SciPy 读取公开 MAT，像素部分使用 Pillow 和 NumPy。两组数据可分别用于检查阈值扫描、误差条展示、位点与帧次配对、阈值边界及占位分母。Senoo 的 m₁／m₀／空位三结果读出仍按其自身光路、计数口径和同装置证据验收。 [Senoo 采集方案](../../docs/SENOO_READOUT_ACQUISITION.md)
