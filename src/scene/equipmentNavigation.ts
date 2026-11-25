import { equipmentIds, type EquipmentId } from '../data/machineEquipment';

export const equipmentHref = (id: EquipmentId) => `#machine/equipment/${id}`;

// The scene canvas and its controls move into the modal. Capture focus before reparenting them.
let opener: HTMLElement | null = null;

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
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    history.pushState({ equipmentReturn: previous || '#machine' }, '', next);
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function restoreEquipmentFocus(fallback: Element | null) {
  const target = opener ?? fallback;
  opener = null;
  if (!(target instanceof HTMLElement) || target === document.body) return;
  requestAnimationFrame(() => {
    if (target.isConnected && !document.querySelector('dialog[open]')) target.focus({ preventScroll: true });
  });
}

export function closeEquipment() {
  if (history.state?.equipmentReturn) history.back();
  else location.replace('#machine/scene');
}
