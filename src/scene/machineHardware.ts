import * as T from 'three';
import { interactionPath, type MachineSceneProfile, type ScenePoint } from '../data/machineSceneProfile';
import { EquipmentAssembly } from './machineEquipmentAssembly';

export const colors = {
  atom: '#63f6cd', qubit: '#b49dff', bright: '#ffc081', dark: '#586887',
  edge: '#868b89',
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

const finish = { graphite: '#3e4547', black: '#24292b', steel: '#a5aba9', titanium: '#777e7e', gold: '#bc9f70', copper: '#ac714b' };
const deck = tableY + 0.18;

// Annular solids leave a clear optical bore, including both end faces.
function sleeve(outer: number, inner: number, height: number, material: T.Material) {
  const h = height / 2;
  const profile = [[inner, -h], [outer, -h], [outer, h], [inner, h], [inner, -h]];
  return new T.Mesh(new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), 48), material);
}

function axial(mesh: T.Object3D, center: ScenePoint, normal: ScenePoint = [0, 1, 0]) {
  mesh.position.set(...center);
  mesh.quaternion.setFromUnitVectors(vector(0, 1, 0), vector(...normal).normalize());
  return mesh;
}

function flange(radius: number, bore: number, depth: number, center: ScenePoint, normal: ScenePoint) {
  const flange = new T.Group();
  flange.add(sleeve(radius, bore, depth, metal(finish.steel, 0.76)));
  const bolts = new T.InstancedMesh(new T.CylinderGeometry(radius * 0.085, radius * 0.085, 0.04, 6), metal(finish.black), 8);
  const matrix = new T.Matrix4();
  for (let n = 0; n < bolts.count; n++) {
    const a = n * Math.PI / 4;
    bolts.setMatrixAt(n, matrix.makeTranslation(0.81 * radius * Math.cos(a), depth / 2 + 0.013, 0.81 * radius * Math.sin(a)));
  }
  flange.add(bolts);
  return axial(flange, center, normal);
}

function mountPost(x: number, z: number, top: number, size = 0.54) {
  const post = new T.Group();
  const height = top - deck;
  post.add(box(size, 0.12, size * 0.84, metal(finish.graphite), x, deck + 0.06, z),
    cylinder(0.11, height, metal(finish.steel), x, deck + height / 2, z),
    cylinder(0.16, height * 0.46, metal(finish.black), x, deck + height * 0.23, z));
  return post;
}

function turningMirror(before: ScenePoint, at: ScenePoint, after: ScenePoint, radius = 0.19) {
  const point = vector(...at);
  const incoming = point.clone().sub(vector(...before)).normalize();
  const outgoing = vector(...after).sub(point).normalize();
  const side = incoming.clone().cross(outgoing).normalize();
  const normal = incoming.sub(outgoing).normalize().toArray() as [number, number, number];
  const optic = new T.Group();
  optic.add(sleeve(radius, radius * 0.79, 0.054, metal(finish.gold)),
    cylinder(radius * 0.79, 0.022, basic('#9cd0d0', 0.38), 0, 0, 0));
  const x = at[0] + side.x * radius * 1.85, z = at[2] + side.z * radius * 1.85;
  const bracketY = at[1] - radius * 0.68;
  const mount = mountPost(x, z, bracketY, 0.38);
  if (Math.hypot(side.x, side.z) > 0.1) {
    mount.add(segment(vector(x, bracketY, z), vector(at[0], bracketY, at[2]), 0.036, metal(finish.graphite)));
  }
  mount.add(axial(optic, at, normal));
  return mount;
}

export function table() {
  const table = new EquipmentAssembly('table');
  const surface = table.part('surface', [0, 1.1, 0]);
  const frame = table.part('frame', [0, 0, 0]);
  const feet = table.part('feet', [0, -1.25, 0]);
  surface.add(outline(box(18.65, 0.14, 8.6, metal('#555b5b', 0.62), 0, deck - 0.07, 0), '#b1b4ac', 0.56));
  // Threaded mounting pattern in a single draw call. The discs depict the bore mouths.
  const holes = new T.InstancedMesh(new T.CircleGeometry(0.041, 10).rotateX(-Math.PI / 2), basic('#333839'), 46 * 21);
  const matrix = new T.Matrix4();
  for (let i = 0; i < holes.count; i++) {
    holes.setMatrixAt(i, matrix.makeTranslation(((i % 46) - 22.5) * 0.40, deck + 0.003, (Math.floor(i / 46) - 10) * 0.40));
  }
  holes.userData.ignorePick = true;
  surface.add(holes);
  frame.add(box(18.60, 0.48, 8.55, metal(finish.black), 0, deck - 0.38, 0),
    box(18.58, 0.025, 8.54, metal(finish.gold), 0, deck - 0.57, 0));
  for (const x of [-7.5, 7.5]) for (const z of [-3.0, 3.0]) {
    feet.add(cylinder(0.42, 0.80, metal(finish.graphite), x, deck - 0.99, z),
      cylinder(0.48, 0.14, metal(finish.black), x, deck - 1.38, z));
  }
  return table;
}

function objectiveBarrel(tip: ScenePoint, direction: 1 | -1) {
  const barrel = new T.Group();
  const alloy = metal(finish.titanium, 0.75);
  const dark = metal(finish.black, 0.58);
  const brass = metal(finish.gold, 0.72);
  for (const [y, outer, height, mat] of [
    [0.09, 0.32, 0.18, alloy], [0.25, 0.42, 0.16, brass], [0.51, 0.52, 0.38, dark],
    [0.72, 0.55, 0.09, alloy],
  ] as const) barrel.add(axial(sleeve(outer, 0.245, height, mat), [0, y, 0]));
  for (let i = 0; i < 4; i++) barrel.add(ring(0.52, 0.012, alloy, 0, 0.38 + 0.07 * i, 0));
  const lens = new T.Mesh(new T.SphereGeometry(0.247, 40, 12), metal('#678e94', 0.56));
  lens.position.y = 0.04;
  lens.scale.y = 0.16;
  barrel.add(lens);
  return axial(barrel, tip, [0, 0, direction]);
}

// Front and rear optical windows are normal to the microscope axis. The
// bottom opening and its annular flange leave the vertical atom path clear.
export function vacuumChamber(scene: MachineSceneProfile) {
  const assembly = new EquipmentAssembly('vacuum');
  const chamber = assembly.part('chamber', [0, 0.65, 0]);
  const port = assembly.part('pump', [0.95, 0, -0.8]);
  const objective = assembly.part('objective', [0, 0, -1.2]);
  const y = scene.arrayY;
  const glass = new T.MeshPhysicalMaterial({ color: '#9bbdb9', metalness: 0.12, roughness: 0.12,
    transparent: true, opacity: 0.16, depthWrite: false });
  const steel = metal(finish.titanium, 0.74);
  const width = 2.48, height = 1.22, depth = 1.38, wall = 0.032;
  const cell = new T.Group();
  cell.position.y = y;
  // Ports occupy the rear window's right-hand edge and the base respectively.
  function windowWithPort(w: number, h: number, x: number, radius: number) {
    const face = new T.Shape();
    face.moveTo(-w / 2, -h / 2);
    face.lineTo(w / 2, -h / 2);
    face.lineTo(w / 2, h / 2);
    face.lineTo(-w / 2, h / 2);
    face.closePath();
    const aperture = new T.Path();
    aperture.absarc(x, 0, radius, 0, Math.PI * 2, true);
    face.holes.push(aperture);
    return new T.Mesh(new T.ExtrudeGeometry(face, { depth: wall, bevelEnabled: false }), glass);
  }
  const floor = windowWithPort(width, depth, 0, 0.21);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -height / 2;
  const rear = windowWithPort(width, height, 0.93, 0.18);
  rear.position.z = -depth / 2;
  cell.add(floor, rear, box(width, wall, depth, glass, 0, height / 2, 0),
    box(width, height, wall, glass, 0, 0, depth / 2));
  for (const sign of [-1, 1]) cell.add(box(wall, height, depth, glass, sign * width / 2, 0, 0));
  const envelope = new T.BoxGeometry(width, height, depth);
  cell.add(new T.LineSegments(new T.EdgesGeometry(envelope), new T.LineBasicMaterial({ color: '#bcc9c1', transparent: true, opacity: 0.72 })));
  envelope.dispose();
  cell.traverse(object => { object.userData.ignorePick = true; });
  chamber.add(cell, flange(0.33, 0.19, 0.09, [0, y - height / 2, 0], [0, 1, 0]));
  for (const sign of [-1, 1]) {
    const x = sign * 1.52;
    const coil = new T.Group();
    const copper = metal(finish.copper, 0.67);
    coil.add(sleeve(0.98, 0.80, 0.32, metal(finish.black)));
    for (let n = -3; n <= 3; n++) coil.add(ring(0.975, 0.035, copper, 0, n * 0.046, 0));
    for (const yy of [-0.18, 0.18]) coil.add(axial(sleeve(1.02, 0.78, 0.055, metal(finish.graphite)), [0, yy, 0]));
    chamber.add(axial(coil, [x, y, 0], [sign, 0, 0]), mountPost(x, -0.70, y - 0.68, 0.68));
  }
  port.add(axial(sleeve(0.26, 0.17, 1.52, steel), [0.93, y, -1.45], [0, 0, 1]),
    flange(0.36, 0.17, 0.11, [0.93, y, -1.15], [0, 0, 1]),
    axial(sleeve(0.32, 0.18, 1.04, steel), [1.45, y, -2.13], [1, 0, 0]),
    flange(0.42, 0.18, 0.12, [1.84, y, -2.13], [1, 0, 0]),
    axial(sleeve(0.42, 0.15, 0.64, steel), [2.23, y, -2.13], [1, 0, 0]),
    box(0.61, 0.80, 0.22, metal(finish.graphite), 2.23, y, -1.76),
    box(0.61, 0.80, 0.22, metal(finish.graphite), 2.23, y, -2.50),
    mountPost(2.23, -2.13, y - 0.4));
  objective.add(objectiveBarrel(scene.delivery, -1), mountPost(0, -1.43, y - 0.45));
  const path = scene.paths.objective.points;
  for (let n = 1; n < path.length - 1; n++) objective.add(turningMirror(path[n - 1], path[n], path[n + 1], 0.16));
  return assembly;
}

export function atomicSource(scene: MachineSceneProfile) {
  const source = new EquipmentAssembly('source');
  const body = source.part('body', [-0.85, 0, 0]);
  const nozzle = source.part('nozzle', [0.6, 0.36, 0]);
  const mount = source.part('mount', [0, -0.75, 0]);
  const y = scene.motY;
  const steel = metal(finish.steel, 0.73);
  const graphite = metal(finish.graphite);
  // Feed the MOT from the side. Only the vertical displacement from the MOT
  // sample to the science sample carries a published mechanical-scale length.
  body.add(axial(sleeve(0.37, 0.13, 1.08, steel), [-3.07, y, 0], [1, 0, 0]),
    flange(0.43, 0.14, 0.10, [-3.64, y, 0], [-1, 0, 0]),
    axial(sleeve(0.20, 0.13, 2.05, steel), [-1.53, y, 0], [1, 0, 0]),
    flange(0.34, 0.14, 0.12, [-2.27, y, 0], [1, 0, 0]));
  for (let n = 0; n < 6; n++) body.add(axial(sleeve(0.39, 0.36, 0.07, metal(finish.copper)), [-3.48 + 0.15 * n, y, 0], [1, 0, 0]));
  // An open window cage reveals the MOT sample and both ends of the elevator.
  for (const sign of [-1, 1]) {
    body.add(axial(sleeve(0.63, 0.27, 0.13, steel), [0, y + sign * 0.40, 0]));
    for (const z of [-0.36, 0.36]) body.add(cylinder(0.075, 0.8, graphite, sign * 0.39, y, z));
  }
  for (const azimuth of [-0.70, 0.70, Math.PI - 0.70, Math.PI + 0.70]) {
    const dx = Math.cos(azimuth), dz = Math.sin(azimuth);
    body.add(flange(0.28, 0.20, 0.10, [dx * 0.56, y, dz * 0.56], [dx, 0, dz]));
  }
  const lower = y + 0.43, upper = scene.arrayY - 0.61;
  nozzle.add(axial(sleeve(0.22, 0.17, upper - lower, steel), [0, (upper + lower) / 2, 0]),
    flange(0.36, 0.17, 0.11, [0, lower + 0.05, 0], [0, 1, 0]),
    flange(0.33, 0.17, 0.10, [0, upper - 0.05, 0], [0, 1, 0]));
  mount.add(mountPost(-3.08, 0, y - 0.35, 0.69), mountPost(0, 0, y - 0.47, 0.7));
  return source;
}

export function slmSystem(scene: MachineSceneProfile) {
  const reservoirColor = scene.paths.reservoir.color, scienceColor = scene.paths.science.color;
  const system = new EquipmentAssembly('slm');
  const modulator = system.part('modulator', [-0.5, 0, 0]);
  const ports = system.part('ports', [0.65, 1.2, 0.1]);
  const relay = system.part('relay', [0.85, -0.45, 0]);
  const body = metal('#363c3e');
  const trim = metal('#9f9d90');
  const x = -7.25;
  const z = 1.33;
  modulator.add(outline(box(2.32, 0.18, 1.56, body, x, deck + 0.09, z), '#676c67'));
  const chip = metal('#647979', 0.68);
  for (const dz of [-0.31, 0.31]) {
    const center = z + dz;
    modulator.add(mountPost(x, center, -0.38, 0.46),
      box(1.63, 0.63, 0.54, body, x, -0.08, center),
      box(0.57, 0.27, 0.032, chip, x - 0.10, -0.05, center + 0.285),
      box(0.09, 0.68, 0.56, trim, x + 0.83, -0.08, center));
    for (let i = 0; i < 8; i++) modulator.add(box(0.065, 0.12, 0.50, body, x - 0.68 + i * 0.16, 0.25, center));
  }
  relay.add(outline(box(0.69, 0.19, 0.68, trim, -4.25, -1.43, z), '#747873'),
    segment(vector(-4.25, -1.36, z), vector(-4.25, -0.18, z), 0.12, body));
  const [rx, ry, rz] = scene.paths.raman.points[0];
  relay.add(axial(sleeve(0.13, 0.078, 0.35, trim), [rx, ry, rz + 0.175], [0, 0, 1]),
    mountPost(rx, rz + 0.18, ry - 0.12, 0.37));
  // The relay represents the dichroic combiner. Plate angles and spacing are illustrative.
  for (const offset of [-0.16, 0.16]) {
    const holder = new T.Group();
    holder.position.set(-4.25 + offset, 0.02, z);
    holder.rotation.y = -Math.PI / 4;
    const glass = cylinder(0.25, 0.025, basic('#85c3cd', 0.53), 0, 0, 0);
    const rim = ring(0.28, 0.035, trim, 0, 0, 0);
    glass.rotation.z = rim.rotation.z = Math.PI / 2;
    holder.add(glass, rim);
    relay.add(holder);
  }
  for (const [offset, color] of [[-0.26, reservoirColor], [0.26, scienceColor]] as const) {
    ports.add(segment(vector(x + 0.95, 0.02, z + offset), vector(x + 1.26, 0.02, z + offset), 0.16, trim),
      segment(vector(x + 1.26, 0.02, z + offset), vector(x + 1.31, 0.02, z + offset), 0.10, basic(color, 0.68)));
  }
  // Compact relay lens on each output before the combiner.
  for (const offset of [-0.22, 0.22]) {
    const centerZ = z + offset;
    const optic = new T.Group();
    optic.add(sleeve(0.18, 0.135, 0.07, body), cylinder(0.135, 0.018, basic('#b2d3ce', 0.37), 0, 0, 0));
    relay.add(axial(optic, [-5.53, 0.02, centerZ], [1, 0, 0]), mountPost(-5.53, centerZ, -0.15, 0.34));
  }
  return system;
}

export function aodSystem(transportColor: string) {
  const system = new EquipmentAssembly('aod');
  const deflector = system.part('deflector', [0, 0.45, 0]);
  const port = system.part('port', [0.85, 0.45, 0]);
  const mount = system.part('mount', [0, -0.6, 0]);
  const body = metal('#373e40');
  const trim = metal('#838986');
  const x = -7.08;
  const z = -1.17;
  mount.add(
    outline(box(1.85, 0.18, 0.94, body, x, -1.44, z), '#92948e'),
    box(0.27, 0.87, 0.35, body, x - 0.44, -0.93, z),
    box(0.27, 0.87, 0.35, body, x + 0.44, -0.93, z),
  );
  deflector.add(
    outline(box(0.71, 0.66, 0.76, body, x - 0.45, -0.21, z), '#92948e'),
    outline(box(0.71, 0.76, 0.66, trim, x + 0.45, -0.21, z), '#9c9e94'),
    box(0.32, 0.045, 0.025, basic(transportColor, 0.82), x - 0.45, -0.15, z + 0.39),
    box(0.045, 0.32, 0.025, basic(transportColor, 0.82), x + 0.45, -0.15, z + 0.34),
  );
  const input = vector(-4.25, 0.02, -1.17);
  port.add(turningMirror([x + 1.06, 0.02, z], input.toArray(), [-4.25, 0.02, 1.33]));
  port.add(segment(vector(x + 0.78, 0.02, z), vector(x + 1.06, 0.02, z), 0.12, body));
  return system;
}

export function laserSystem(scene: MachineSceneProfile, rowOffset: number) {
  const system = new EquipmentAssembly('gate');
  const mount = system.part('mount', [0, -0.9, 0]);
  const steel = metal(finish.steel, 0.72);
  const graphite = metal(finish.graphite);
  mount.add(box(2.82, 0.16, 2.38, graphite, 6.53, deck + 0.09, 2.55));
  const fitted = new Set<string>();
  for (const [i, id] of (['clock', 'rydberg', 'probe'] as const).entries()) {
    const path = interactionPath(scene.paths[id], scene.arrayY, rowOffset);
    const [x, y, z] = path.points[0];
    const channel = system.part(id, [0, 0.4 + 0.42 * i, (i - 1) * 0.82]);
    channel.add(axial(sleeve(0.23, 0.11, 0.79, steel), [x + 0.40, y, z], [1, 0, 0]),
      axial(sleeve(0.256, 0.12, 0.12, metal(finish.gold)), [x + 0.10, y, z], [1, 0, 0]),
      box(0.75, 0.64, 0.54, graphite, x + 1.08, y, z),
      mountPost(x + 1.1, z, y - 0.30),
      axial(sleeve(0.14, 0.06, 0.48, steel), [x + 1.65, y, z], [1, 0, 0]));
    for (let n = 1; n < path.points.length - 1; n++) {
      const at = path.points[n], key = at.join(',');
      if (fitted.has(key)) continue;
      fitted.add(key);
      mount.add(turningMirror(path.points[n - 1], at, path.points[n + 1]));
    }
    const cable = new T.CatmullRomCurve3([vector(x + 1.86, y, z), vector(x + 2.32, y - 0.12, z),
      vector(x + 2.65, deck + 0.19, z), vector(8.98, deck + 0.08, z - 0.35)]);
    channel.add(new T.Mesh(new T.TubeGeometry(cable, 22, 0.042, 6, false), metal('#464a46')));
  }
  return system;
}

export function imagingSystem(scene: MachineSceneProfile) {
  const system = new EquipmentAssembly('imaging');
  const objective = system.part('objective', [0, 0, -0.5]);
  const camera = system.part('camera', [0, 0, 0.92]);
  const mount = system.part('mount', [0.65, -0.6, 0]);
  const [, y, z] = scene.collection;
  const black = metal(finish.black), steel = metal(finish.titanium, 0.68);
  objective.add(objectiveBarrel(scene.collection, 1),
    axial(sleeve(0.36, 0.23, 0.49, steel), [0, y, z + 0.99], [0, 0, 1]));
  camera.add(outline(box(0.94, 0.74, 0.71, black, 0, y, z + 1.59), '#9d9f96', 0.5));
  for (let n = 0; n < 7; n++) camera.add(box(0.06, 0.47, 0.07, steel, -0.36 + n * 0.12, y, z + 1.96));
  mount.add(mountPost(0, z + 1.40, y - 0.39, 0.76),
    axial(sleeve(0.43, 0.36, 0.15, black), [0, y, z + 1.08], [0, 0, 1]),
    box(0.22, 0.13, 0.54, steel, 0, y - 0.42, z + 1.25));
  return system;
}
