import { equipmentIds, type EquipmentId } from '../data/machineEquipment';

export const equipmentHref = (id: EquipmentId) => `#machine/equipment/${id}`;

export function equipmentAt(hash: string) {
  return equipmentIds.find(id => equipmentHref(id) === hash) ?? null;
}

export function openEquipment(id: EquipmentId) {
  const next = equipmentHref(id);
  const previous = location.hash;
  if (previous === next) return;
  if (equipmentAt(previous)) {
    history.replaceState(history.state, '', next);
  } else {
    history.pushState({ equipmentReturn: previous || '#machine' }, '', next);
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function closeEquipment() {
  if (history.state?.equipmentReturn) history.back();
  else location.replace('#machine/scene');
}
