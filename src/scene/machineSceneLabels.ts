import type { Camera, Vector3 } from 'three';
import type { MachineSceneProfile } from '../data/machineSceneProfile';

interface Bounds { left: number; right: number; top: number; bottom: number }
const overlaps = (a: Bounds, b: Bounds) => a.left < b.right + 4 && a.right > b.left - 4 && a.top < b.bottom + 4 && a.bottom > b.top - 4;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Find the nearest unobstructed label position measured in CSS pixels. DOM tab order stays fixed. */
function place(x: number, y: number, w: number, h: number, viewport: Bounds, occupied: Bounds[]): Bounds | null {
  const left = clamp(x - w / 2, viewport.left, viewport.right - w);
  const bottom = clamp(y, viewport.top + h, viewport.bottom);
  // If the preferred position overlaps, the closest free placement touches an obstacle edge.
  const xs = [left, ...occupied.flatMap(b => [b.left - w - 5, b.right + 5])];
  const ys = [bottom, ...occupied.flatMap(b => [b.top - 5, b.bottom + h + 5])];
  let best: Bounds | null = null;
  let distance = Infinity;
  for (const cx of xs) for (const cy of ys) {
    const box = { left: cx, right: cx + w, top: cy - h, bottom: cy };
    if (box.left < viewport.left || box.right > viewport.right || box.top < viewport.top || box.bottom > viewport.bottom) continue;
    const score = (cx - left) ** 2 + (cy - bottom) ** 2;
    if (score >= distance || occupied.some(other => overlaps(box, other))) continue;
    if (score === 0) return box;
    best = box;
    distance = score;
  }
  return best;
}

export function positionEquipmentLabels(host: HTMLElement, profile: MachineSceneProfile, refs: Record<string, HTMLElement | null>,
  camera: Camera, projected: Vector3, show: boolean) {
  const width = host.clientWidth, height = host.clientHeight;
  const viewport = { left: 4, right: width - 4, top: 4, bottom: height - 4 };
  const occupied: Bounds[] = [];
  const scene = host.parentElement;
  if (show && scene) {
    const rect = host.getBoundingClientRect();
    for (const item of scene.querySelectorAll<HTMLElement>('.qc-scene-tools, .qc-scene-footer > span')) {
      const b = item.getBoundingClientRect();
      if (b.width && b.height) occupied.push({ left: b.left - rect.left, right: b.right - rect.left, top: b.top - rect.top, bottom: b.bottom - rect.top });
    }
  }
  const anchors = profile.labels.flatMap(({ id, position }) => {
    const label = refs[id];
    if (!label) return [];
    projected.set(...position).project(camera);
    const x = (projected.x / 2 + 0.5) * width, y = (0.5 - projected.y / 2) * height;
    if (!show || x < 0 || x > width || y < 0 || y > height) {
      label.style.visibility = 'hidden';
      return [];
    }
    return [{ label, x, y, width: label.offsetWidth, height: label.offsetHeight }];
  });
  for (const anchor of anchors) {
    const { label, x, y } = anchor;
    const box = place(x, y, anchor.width, anchor.height, viewport, occupied);
    if (!box) { label.style.visibility = 'hidden'; continue; }
    occupied.push(box);
    const cx = Math.round((box.left + box.right) / 2), cy = Math.round(box.bottom);
    label.style.visibility = 'visible';
    label.style.transform = `translate(${cx}px, ${cy}px)`;
    label.style.setProperty('--leader-length', `${Math.hypot(x - cx, y + 8 - cy)}px`);
    label.style.setProperty('--leader-angle', `${Math.atan2(cx - x, y + 8 - cy)}rad`);
  }
}
