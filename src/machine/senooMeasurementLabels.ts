export const sourceLabels = { synthetic: '合成数据', measured: '实测标记', unknown: '来源待核实' };
export const groupLabels = { m1: '制备 m₁', m0: '制备 m₀', empty_control: '空位对照' };
export const preparationLabels = { pass: '通过', fail: '失败', not_run: '未执行', unknown: '未知' };
export const selectionLabels = { included: '纳入', excluded: '剔除', pending: '待确认' };
export const decisionLabels: Readonly<Record<string, string>> = {
  m1: 'm₁', m0: 'm₀', loss: '丢失', ambiguous: '歧义', unclassified: '未分类', not_available: '未产生判决',
};
export const eventLabels = {
  prep_erasure: '制备擦除', clock_pi: '578 nm 钟态映射', raman_pi: 'Raman 翻转', illumination_399: '399 nm 照明',
  trap_ramp: '767 nm 阱斜坡', other: '其他事件',
};
