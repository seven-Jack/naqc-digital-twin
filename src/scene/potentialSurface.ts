import * as T from 'three';
import type { Model } from '../physics/model';
import { joulesToHz, um } from '../physics/units';
import { axisLabel, gridLines, sceneColors } from './arrayGeometry';

export type PotentialView = 'both' | 'ground' | 'excited' | 'difference' | 'radial' | 'axial';

const heightPerMhz = 5;
const spatialHalfWidth = 5.5;

function fieldHz(model: Model, x: number, y: number, axial: number, field: 'ground' | 'excited' | 'difference') {
  const p = model.potentials(um(Math.hypot(x, y)), um(axial));
  return joulesToHz(p[`${field}J`]);
}

export function potentialSurface(model: Model, mode: PotentialView) {
  const root = new T.Group();
  const color = { ground: sceneColors.ground, excited: sceneColors.excited, difference: sceneColors.clock };
  const fields = mode === 'ground' || mode === 'excited' || mode === 'difference' ? [mode] as const : ['ground', 'excited'] as const;
  const axial = mode === 'axial';
  const cut = axial || mode === 'radial';
  const halfWidthUm = axial ? model.rayleighM / um(1) * 3 : spatialHalfWidth;
  const positionY = (hz: number) => hz / 1e6 * heightPerMhz;
  const minHeight = mode === 'difference' ? 0 : positionY(mode === 'excited' ? model.excitedHz : model.groundHz);
  const maxHeight = mode === 'difference' ? positionY(model.starkHz) : 0;
  const energyOrigin = new T.Vector3(-spatialHalfWidth, minHeight, spatialHalfWidth);
  const grid = gridLines(spatialHalfWidth, 1.1, '#537f91', 0.34);
  grid.position.y = 0;
  root.add(grid);

  const axes = [
    new T.Vector3(-spatialHalfWidth, 0, spatialHalfWidth), new T.Vector3(spatialHalfWidth, 0, spatialHalfWidth),
    new T.Vector3(-spatialHalfWidth, 0, spatialHalfWidth), new T.Vector3(-spatialHalfWidth, 0, -spatialHalfWidth),
    energyOrigin, new T.Vector3(energyOrigin.x, maxHeight + 1, energyOrigin.z),
  ];
  root.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(axes), new T.LineBasicMaterial({ color: '#6c9eaa' })));
  root.add(axisLabel('U/h (MHz)', '#8fc1cf', new T.Vector3(-7.4, maxHeight + 0.55, 5.5), 6));
  root.add(axisLabel(`${axial ? 'z' : 'x'} (µm)`, '#8fc1cf', new T.Vector3(3.9, 0, 6.6), 5.5));
  if (!cut) root.add(axisLabel('y (µm)', '#8fc1cf', new T.Vector3(-6.2, 0, -4.2), 5));
  for (let tick = 0; tick <= 4; tick++) {
    const x = -spatialHalfWidth + spatialHalfWidth * tick / 2;
    const physicalX = -halfWidthUm + halfWidthUm * tick / 2;
    root.add(axisLabel(Number(physicalX.toFixed(axial ? 1 : 2)).toString(), '#83aeba', new T.Vector3(x, -0.2, 5.55), 2.7));
    if (tick > 0 && !cut) root.add(axisLabel(Number(physicalX.toFixed(2)).toString(), '#83aeba', new T.Vector3(-5.8, -0.2, -x), 2.7));
    const energyY = minHeight + (maxHeight - minHeight) * tick / 4;
    root.add(axisLabel((energyY / heightPerMhz).toFixed(2), '#83aeba', new T.Vector3(-6.3, energyY, 5.5), 2.7));
  }

  for (const field of fields) {
    if (cut) {
      const points = Array.from({ length: 161 }, (_, i) => {
        const fraction = -1 + i / 80;
        const displacement = fraction * halfWidthUm;
        return new T.Vector3(fraction * spatialHalfWidth, positionY(fieldHz(model, axial ? 0 : displacement, 0, axial ? displacement : 0, field)), 0);
      });
      const curve = new T.CatmullRomCurve3(points);
      root.add(new T.Mesh(new T.TubeGeometry(curve, 160, 0.035, 6, false), new T.MeshBasicMaterial({ color: color[field] })));
      const curtain: number[] = [];
      for (let i = 1; i < points.length; i++) {
        const left = points[i - 1], right = points[i];
        curtain.push(left.x, left.y, 0, right.x, right.y, 0, right.x, 0, 0, left.x, left.y, 0, right.x, 0, 0, left.x, 0, 0);
      }
      root.add(new T.Mesh(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(curtain, 3)),
        new T.MeshBasicMaterial({ color: color[field], side: T.DoubleSide, transparent: true, opacity: 0.12, depthWrite: false })));
      continue;
    }

    const geometry = new T.PlaneGeometry(spatialHalfWidth * 2, spatialHalfWidth * 2, 48, 48);
    geometry.rotateX(-Math.PI / 2);
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) vertices.setY(i, positionY(fieldHz(model, vertices.getX(i), vertices.getZ(i), 0, field)));
    geometry.computeVertexNormals();
    const surface = new T.Mesh(geometry, new T.MeshStandardMaterial({
      color: color[field], emissive: color[field], emissiveIntensity: 0.23,
      side: T.DoubleSide, transparent: true, opacity: fields.length === 1 ? 0.35 : 0.12, depthWrite: false,
    }));
    root.add(surface);
    const contours: number[] = [];
    for (let j = 0; j <= 24; j++) {
      const axis = -spatialHalfWidth + j / 24 * spatialHalfWidth * 2;
      for (let i = 0; i < 80; i++) {
        const a = -spatialHalfWidth + i / 80 * spatialHalfWidth * 2;
        const b = a + spatialHalfWidth / 40;
        contours.push(a, positionY(fieldHz(model, a, axis, 0, field)), axis, b, positionY(fieldHz(model, b, axis, 0, field)), axis);
        contours.push(axis, positionY(fieldHz(model, axis, a, 0, field)), a, axis, positionY(fieldHz(model, axis, b, 0, field)), b);
      }
    }
    root.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(contours, 3)),
      new T.LineBasicMaterial({ color: color[field], transparent: true, opacity: fields.length === 1 ? 0.42 : 0.22 })));
  }
  return { root, minHeight, maxHeight };
}
