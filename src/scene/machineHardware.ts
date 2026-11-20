import * as T from 'three';
import type { MachineSceneProfile } from '../data/machineSceneProfile';
import { EquipmentAssembly } from './machineEquipmentAssembly';

export const colors = {
  atom: '#63f6cd', qubit: '#b49dff', bright: '#ffc081', dark: '#586887',
  edge: '#647f99',
};

export const tableY = -1.75;

export const vector = (x: number, y: number, z: number) => new T.Vector3(x, y, z);

export function basic(color: string, opacity = 1) {
  return new T.MeshBasicMaterial({ color, opacity, transparent: opacity < 1, depthWrite: opacity === 1 });
}

function metal(color: string, metalness = 0.42) {
  return new T.MeshStandardMaterial({ color, roughness: 0.38, metalness });
}

export function box(width: number, height: number, depth: number, material: T.Material, x: number, y: number, z: number) {
  const mesh = new T.Mesh(new T.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function outline(mesh: T.Mesh, color: string, opacity = 0.37) {
  mesh.add(new T.LineSegments(new T.EdgesGeometry(mesh.geometry, 24),
    new T.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })));
  return mesh;
}

function cylinder(radius: number, height: number, material: T.Material, x: number, y: number, z: number, sides = 48) {
  const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, height, sides), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function ring(radius: number, tube: number, material: T.Material, x: number, y: number, z: number, sides = 64) {
  const mesh = new T.Mesh(new T.TorusGeometry(radius, tube, 8, sides).rotateX(-Math.PI / 2), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function segment(from: T.Vector3, to: T.Vector3, radius: number, material: T.Material, sides = 12) {
  const difference = to.clone().sub(from);
  const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, difference.length(), sides), material);
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.quaternion.setFromUnitVectors(vector(0, 1, 0), difference.normalize());
  return mesh;
}

export function table() {
  const table = new EquipmentAssembly('table');
  const surface = table.part('surface', [0, 1.6, 0]);
  const frame = table.part('frame', [0, 0, 0]);
  const supports = table.part('feet', [0, -1.8, 0]);
  const rails = metal('#29384e');
  const panels = metal('#18283d');
  const plate = metal('#182538', 0.13);
  const bolts = metal('#66859e');
  frame.add(
    outline(box(18.95, 0.18, 7.36, rails, 0, tableY, 0), '#638ca9', 0.5),
    outline(box(18.78, 0.43, 7.18, panels, 0, tableY - 0.3, 0), '#38516d', 0.7),
  );
  surface.add(
    outline(box(18.72, 0.09, 7.10, plate, 0, tableY + 0.13, 0), '#426683', 0.75),
  );
  const mountingLines: number[] = [];
  const top = tableY + 0.177;
  for (let x = -9.2; x <= 9.3; x += 0.5) mountingLines.push(x, top, -3.46, x, top, 3.46);
  for (let z = -3.44; z <= 3.45; z += 0.5) mountingLines.push(-9.23, top, z, 9.23, top, z);
  surface.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(mountingLines, 3)),
    new T.LineBasicMaterial({ color: '#405b74', transparent: true, opacity: 0.32 })));
  const feet = metal('#203245');
  for (const x of [-8.56, 8.56]) {
    for (const z of [-2.88, 2.88]) {
      surface.add(cylinder(0.13, 0.035, bolts, x, top, z, 8));
      supports.add(box(0.72, 0.29, 0.69, feet, x, tableY - 0.64, z));
    }
  }
  frame.add(box(17.4, 0.018, 0.015, basic('#254a68'), 0, tableY - 0.21, 3.6));
  const tableSignal = basic('#46a4b8');
  for (const x of [-8.9, -8.76, -8.62, 8.9]) {
    frame.add(box(0.055, 0.07, 0.025, tableSignal, x, tableY - 0.33, 3.60));
  }
  return table;
}

export function vacuumChamber(glowMap: T.Texture, reservoirColor: string) {
  const assembly = new EquipmentAssembly('vacuum');
  const chamber = assembly.part('chamber', [0, 0.7, 0]);
  const port = assembly.part('pump', [0, 0, -1.9]);
  const objective = assembly.part('objective', [0, -1.9, 0]);
  const wall = new T.Mesh(new T.CylinderGeometry(2.41, 2.41, 2.29, 12, 1, true),
    new T.MeshBasicMaterial({ color: '#7cb8e2', transparent: true, opacity: 0.055, side: T.DoubleSide, depthWrite: false }));
  // Pick through the transparent viewport to the array; the solid chamber and flanges remain selectable.
  wall.userData.ignorePick = true;
  wall.position.y = 0.15;
  chamber.add(wall);
  const supports = metal('#445d73');
  const base = metal('#273d51');
  chamber.add(
    outline(cylinder(2.67, 0.23, base, 0, -1.36, 0, 12), colors.edge),
    outline(cylinder(2.49, 0.18, supports, 0, -1.17, 0, 12), colors.edge),
    ring(2.42, 0.05, basic('#79a2bc', 0.71), 0, -0.98, 0, 12),
    ring(2.43, 0.10, supports, 0, 1.21, 0, 12),
    ring(2.52, 0.042, basic('#658fab', 0.8), 0, 1.29, 0, 12),
    ring(2.35, 0.018, basic('#7da3c9', 0.41), 0, 1.27, 0, 12),
  );
  const seamMaterial = basic('#7299b3', 0.37);
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6;
    const x = Math.sin(angle) * 2.43;
    const z = Math.cos(angle) * 2.43;
    chamber.add(segment(vector(x, -0.98, z), vector(x, 1.24, z), 0.018, seamMaterial, 4));
    chamber.add(cylinder(0.062, 0.055, base, x, 1.305, z, 6));
  }
  const pumpDirection = vector(0, 0, -1);
  const collar = metal('#354d67');
  port.add(segment(vector(0, 0.39, -2.14), vector(0, 0.39, -3.16), 0.40, base, 24),
    segment(vector(0, 0.39, -2.91), vector(0, 0.39, -3.16), 0.50, collar, 24));
  const pump = cylinder(0.32, 0.09, basic('#19283d'), 0, 0.39, -3.18);
  pump.quaternion.setFromUnitVectors(vector(0, 1, 0), pumpDirection);
  port.add(pump);
  const trapObjective = metal('#335464');
  objective.add(cylinder(0.57, 0.36, trapObjective, 0, -1.1, 0),
    cylinder(0.45, 0.33, trapObjective, 0, -0.79, 0), ring(0.38, 0.041, basic(reservoirColor, 0.49), 0, -0.605, 0));
  const halo = new T.Sprite(new T.SpriteMaterial({
    map: glowMap, color: reservoirColor, transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false,
  }));
  halo.position.set(0, 0.12, 0);
  halo.scale.set(4.6, 2.8, 1);
  chamber.add(halo);
  return assembly;
}

export function atomicSource() {
  const source = new EquipmentAssembly('source');
  const body = source.part('body', [-0.8, 0.4, -0.4]);
  const nozzle = source.part('nozzle', [0.8, 0.4, 0.4]);
  const mount = source.part('mount', [0, -0.7, 0]);
  const housing = metal('#304761');
  const flange = metal('#4a6784');
  const opening = vector(-2.1, 0.34, -1.15);
  const rear = vector(-5.44, 0.34, -2.44);
  const bodyEnd = rear.clone().lerp(opening, 0.48);
  body.add(
    segment(rear, bodyEnd, 0.36, housing, 24),
    segment(rear, rear.clone().lerp(opening, 0.06), 0.42, flange, 24),
  );
  nozzle.add(
    segment(bodyEnd, opening, 0.14, flange, 20),
    segment(bodyEnd, bodyEnd.clone().lerp(opening, 0.11), 0.32, flange, 24),
    segment(opening.clone().lerp(bodyEnd, 0.12), opening, 0.26, flange, 24),
  );
  mount.add(
    outline(box(1.25, 0.16, 0.78, housing, -4.69, -1.43, -2.17), '#55748c'),
    box(0.33, 1.57, 0.36, housing, -4.69, -0.64, -2.17),
  );
  return source;
}

export function slmSystem(reservoirColor: string, scienceColor: string) {
  const system = new EquipmentAssembly('slm');
  const modulator = system.part('modulator', [-0.5, 0, 0]);
  const ports = system.part('ports', [0.65, 1.2, 0.1]);
  const relay = system.part('relay', [0.85, -0.45, 0]);
  const body = metal('#243f51');
  const trim = metal('#416473');
  const screen = new T.Group();
  const x = -7.25;
  const z = 1.33;
  modulator.add(outline(box(2.17, 0.20, 1.56, body, x, -1.44, z), '#517482'),
    outline(box(1.83, 1.42, 1.36, body, x, -0.69, z), '#557585'),
    outline(box(1.88, 0.12, 1.38, trim, x, 0.06, z), '#498b8a'),
    box(1.48, 0.41, 0.028, basic('#101e2b'), x, -0.43, z + 0.69),
    box(1.38, 0.019, 0.028, basic('#597b84'), x, -0.12, z + 0.694));
  relay.add(outline(box(0.69, 0.19, 0.68, trim, -4.25, -1.43, z), '#4a7186'),
    segment(vector(-4.25, -1.36, z), vector(-4.25, -0.24, z), 0.12, body),
    outline(box(0.44, 0.50, 0.18, trim, -4.25, 0.02, z), '#68acb4'));
  const pixel = basic('#73e0b5', 0.66);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 14; column++) {
      if ((row * 7 + column * 5 + 3) % 17 > 10) continue;
      screen.add(box(0.039, 0.028, 0.012, pixel, x - 0.59 + column * 0.09, -0.53 + row * 0.065, z + 0.708));
    }
  }
  for (const [offset, color] of [[-0.26, reservoirColor], [0.26, scienceColor]] as const) {
    ports.add(segment(vector(x + 0.95, 0.02, z + offset), vector(x + 1.26, 0.02, z + offset), 0.16, trim),
      segment(vector(x + 1.26, 0.02, z + offset), vector(x + 1.31, 0.02, z + offset), 0.10, basic(color, 0.68)));
  }
  modulator.add(screen);
  return system;
}

export function aodSystem(transportColor: string) {
  const system = new EquipmentAssembly('aod');
  const deflector = system.part('deflector', [0, 0.45, 0]);
  const port = system.part('port', [0.85, 0.45, 0]);
  const mount = system.part('mount', [0, -0.6, 0]);
  const body = metal('#284357');
  const trim = metal('#42637b');
  const x = -7.08;
  const z = -1.17;
  mount.add(
    outline(box(1.85, 0.18, 0.94, body, x, -1.44, z), '#557a94'),
    box(0.27, 0.87, 0.35, body, x, -0.93, z),
  );
  deflector.add(
    outline(box(1.61, 0.66, 0.76, body, x, -0.21, z), '#557a94'),
    outline(box(0.48, 0.53, 0.79, trim, x + 0.43, -0.21, z), '#648ba1'),
    box(0.31, 0.04, 0.02, basic(transportColor, 0.71), x - 0.38, -0.15, z + 0.39),
  );
  port.add(segment(vector(x + 0.78, 0.02, z), vector(x + 1.06, 0.02, z), 0.12, body));
  return system;
}

export function laserSystem({ sidePathX, paths, arrayY }: MachineSceneProfile) {
  const system = new EquipmentAssembly('gate');
  const mount = system.part('mount', [0, -1.0, 0]);
  const body = metal('#3a3658');
  const trim = metal('#534a75');
  const x = sidePathX[0] + 1.66;
  const z = paths.rydberg.entranceZ;
  const channelOffsets = { clock: -1.45, rydberg: 0, probe: 1.45 };
  for (const id of ['clock', 'rydberg', 'probe'] as const) {
    const { entranceZ: centerZ, color: beamColor } = paths[id];
    const channel = system.part(id, [0, id === 'rydberg' ? 1.1 : 0.5, channelOffsets[id]]);
    const color = basic(beamColor);
    channel.add(outline(box(2.13, 0.85, 0.74, body, x, 0.08, centerZ), '#6b5a91'),
      outline(box(2.17, 0.11, 0.78, trim, x, 0.54, centerZ), '#7a63a4'),
      segment(vector(x - 1.64, arrayY, centerZ), vector(x - 1, arrayY, centerZ), 0.16, trim),
      segment(vector(x - 1.66, arrayY, centerZ), vector(x - 1.63, arrayY, centerZ), 0.10, color));
  }
  mount.add(
    outline(box(2.63, 0.19, 2.56, body, x, -1.44, z), '#68628a'),
    outline(box(1.65, 1.16, 1.19, trim, x, -0.87, z), '#675987'),
  );
  const probe = system.parts.get('probe')!.group;
  const vents = basic('#191f34');
  for (let index = 0; index < 8; index++) {
    probe.add(box(0.106, 0.25, 0.026, vents, x - 0.61 + index * 0.18, 0.00, z + 1.184));
  }
  return system;
}

export function imagingSystem(probeColor: string) {
  const system = new EquipmentAssembly('imaging');
  const objective = system.part('objective', [0, -1, 0.7]);
  const camera = system.part('camera', [0, 0.85, 0]);
  const mount = system.part('mount', [1.0, 0, -0.8]);
  const dark = metal('#25374c');
  const lintel = metal('#4c687e');
  const warm = metal('#74594a');
  mount.add(
    outline(box(0.96, 0.18, 0.83, dark, 2.88, -1.43, -1.87), '#5b7790'),
    outline(box(0.31, 4.74, 0.36, lintel, 2.88, 1.0, -1.87), '#7898b0'),
    outline(box(2.87, 0.27, 0.31, lintel, 1.47, 3.41, -1.87), '#738fac'),
    outline(box(0.31, 0.26, 1.68, lintel, 0.13, 3.41, -0.92), '#738fac'),
  );
  camera.add(
    outline(box(1.44, 0.89, 1.46, dark, 0, 3.44, 0), '#829eb4', 0.64),
    outline(box(1.18, 0.075, 1.29, lintel, 0, 3.93, 0), '#6b8fa3', 0.52),
    box(0.28, 0.075, 0.019, basic('#e4a96d', 0.74), 0.31, 3.59, 0.736),
  );
  objective.add(
    cylinder(0.63, 0.31, warm, 0, 2.90, 0),
    cylinder(0.49, 0.26, dark, 0, 2.65, 0),
    ring(0.40, 0.048, basic(probeColor, 0.79), 0, 2.50, 0),
    cylinder(0.36, 0.038, basic('#94593c', 0.66), 0, 2.493, 0),
  );
  const vents = basic('#142335');
  for (let index = 0; index < 5; index++) {
    camera.add(box(0.08, 0.24, 0.018, vents, -0.50 + index * 0.14, 3.38, 0.735));
  }
  return system;
}
