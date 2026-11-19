import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MachineProfile } from '../data/machineProfile';
import type { MachineSceneProfile } from '../data/machineSceneProfile';
import { glowTexture, gridLines } from './arrayGeometry';
import type { MachineSceneFrame } from './machineSceneFrame';

export type MachineView = 'machine' | 'array';

const colors = {
  atom: '#63f6cd', qubit: '#b49dff', bright: '#ffc081', dark: '#586887',
  edge: '#647f99',
};

const tableY = -1.75;

const vector = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
const beamAxis = vector(0, 1, 0);
const beamDirection = new T.Vector3();

function basic(color: string, opacity = 1) {
  return new T.MeshBasicMaterial({ color, opacity, transparent: opacity < 1, depthWrite: opacity === 1 });
}

function metal(color: string, metalness = 0.42) {
  return new T.MeshStandardMaterial({ color, roughness: 0.38, metalness });
}

function box(width: number, height: number, depth: number, material: T.Material, x: number, y: number, z: number) {
  const mesh = new T.Mesh(new T.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function outline(mesh: T.Mesh, color: string, opacity = 0.37) {
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

function segment(from: T.Vector3, to: T.Vector3, radius: number, material: T.Material, sides = 12) {
  const difference = to.clone().sub(from);
  const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, difference.length(), sides), material);
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.quaternion.setFromUnitVectors(vector(0, 1, 0), difference.normalize());
  return mesh;
}

function opticalPath(parent: T.Group, points: T.Vector3[], color: string, width = 0.12) {
  const core = new T.MeshBasicMaterial({
    color, transparent: true, opacity: 0.24, depthWrite: false, blending: T.AdditiveBlending,
  });
  const envelope = core.clone();
  envelope.opacity = 0.04;
  const line = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({
    color, transparent: true, opacity: 0.54, depthWrite: false, blending: T.AdditiveBlending,
  }));
  parent.add(line);
  for (let index = 1; index < points.length; index++) {
    parent.add(segment(points[index - 1], points[index], width * 0.31, core),
      segment(points[index - 1], points[index], width, envelope));
  }
  return { core, envelope, line: line.material };
}

function steerBeam(mesh: T.Mesh, from: T.Vector3, to: T.Vector3) {
  beamDirection.subVectors(to, from);
  mesh.scale.y = beamDirection.length();
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.quaternion.setFromUnitVectors(beamAxis, beamDirection.normalize());
}

function focusBeam(color: string, endRadius: number, startRadius: number, opacity: number) {
  const material = new T.MeshBasicMaterial({
    color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending,
  });
  const beam = new T.Mesh(new T.CylinderGeometry(endRadius, startRadius, 1, 20, 1, true), material);
  beam.visible = false;
  return beam;
}

function table() {
  const table = new T.Group();
  const rails = metal('#29384e');
  const panels = metal('#18283d');
  const plate = metal('#182538', 0.13);
  const bolts = metal('#66859e');
  table.add(
    outline(box(18.95, 0.18, 7.36, rails, 0, tableY, 0), '#638ca9', 0.5),
    outline(box(18.78, 0.43, 7.18, panels, 0, tableY - 0.3, 0), '#38516d', 0.7),
    outline(box(18.72, 0.09, 7.10, plate, 0, tableY + 0.13, 0), '#426683', 0.75),
  );
  const mountingLines: number[] = [];
  const top = tableY + 0.177;
  for (let x = -9.2; x <= 9.3; x += 0.5) mountingLines.push(x, top, -3.46, x, top, 3.46);
  for (let z = -3.44; z <= 3.45; z += 0.5) mountingLines.push(-9.23, top, z, 9.23, top, z);
  table.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(mountingLines, 3)),
    new T.LineBasicMaterial({ color: '#405b74', transparent: true, opacity: 0.32 })));
  const feet = metal('#203245');
  for (const x of [-8.56, 8.56]) {
    for (const z of [-2.88, 2.88]) {
      table.add(cylinder(0.13, 0.035, bolts, x, top, z, 8),
        box(0.72, 0.29, 0.69, feet, x, tableY - 0.64, z));
    }
  }
  table.add(box(17.4, 0.018, 0.015, basic('#254a68'), 0, tableY - 0.21, 3.6));
  const tableSignal = basic('#46a4b8');
  for (const x of [-8.9, -8.76, -8.62, 8.9]) {
    table.add(box(0.055, 0.07, 0.025, tableSignal, x, tableY - 0.33, 3.60));
  }
  return table;
}

function vacuumChamber(glowMap: T.Texture, reservoirColor: string) {
  const chamber = new T.Group();
  const wall = new T.Mesh(new T.CylinderGeometry(2.41, 2.41, 2.29, 12, 1, true),
    new T.MeshBasicMaterial({ color: '#7cb8e2', transparent: true, opacity: 0.055, side: T.DoubleSide, depthWrite: false }));
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
  chamber.add(segment(vector(0, 0.39, -2.14), vector(0, 0.39, -3.16), 0.40, base, 24),
    segment(vector(0, 0.39, -2.91), vector(0, 0.39, -3.16), 0.50, collar, 24));
  const pump = cylinder(0.32, 0.09, basic('#19283d'), 0, 0.39, -3.18);
  pump.quaternion.setFromUnitVectors(vector(0, 1, 0), pumpDirection);
  chamber.add(pump);
  const trapObjective = metal('#335464');
  chamber.add(cylinder(0.57, 0.36, trapObjective, 0, -1.1, 0),
    cylinder(0.45, 0.33, trapObjective, 0, -0.79, 0), ring(0.38, 0.041, basic(reservoirColor, 0.49), 0, -0.605, 0));
  const halo = new T.Sprite(new T.SpriteMaterial({
    map: glowMap, color: reservoirColor, transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false,
  }));
  halo.position.set(0, 0.12, 0);
  halo.scale.set(4.6, 2.8, 1);
  chamber.add(halo);
  return chamber;
}

function atomicSource() {
  const source = new T.Group();
  const housing = metal('#304761');
  const flange = metal('#4a6784');
  const opening = vector(-2.1, 0.34, -1.15);
  const rear = vector(-5.44, 0.34, -2.44);
  const bodyEnd = rear.clone().lerp(opening, 0.48);
  source.add(
    segment(rear, bodyEnd, 0.36, housing, 24),
    segment(bodyEnd, opening, 0.14, flange, 20),
    segment(rear, rear.clone().lerp(opening, 0.06), 0.42, flange, 24),
    segment(bodyEnd, bodyEnd.clone().lerp(opening, 0.11), 0.32, flange, 24),
    segment(opening.clone().lerp(bodyEnd, 0.12), opening, 0.26, flange, 24),
    outline(box(1.25, 0.16, 0.78, housing, -4.69, -1.43, -2.17), '#55748c'),
    box(0.33, 1.57, 0.36, housing, -4.69, -0.64, -2.17),
  );
  return source;
}

function slmSystem(reservoirColor: string, scienceColor: string) {
  const system = new T.Group();
  const body = metal('#243f51');
  const trim = metal('#416473');
  const screen = new T.Group();
  const x = -7.25;
  const z = 1.33;
  system.add(outline(box(2.17, 0.20, 1.56, body, x, -1.44, z), '#517482'),
    outline(box(1.83, 1.42, 1.36, body, x, -0.69, z), '#557585'),
    outline(box(1.88, 0.12, 1.38, trim, x, 0.06, z), '#498b8a'),
    box(1.48, 0.41, 0.028, basic('#101e2b'), x, -0.43, z + 0.69),
    box(1.38, 0.019, 0.028, basic('#597b84'), x, -0.12, z + 0.694),
    outline(box(0.69, 0.19, 0.68, trim, -4.25, -1.43, z), '#4a7186'),
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
    system.add(segment(vector(x + 0.95, 0.02, z + offset), vector(x + 1.26, 0.02, z + offset), 0.16, trim),
      segment(vector(x + 1.26, 0.02, z + offset), vector(x + 1.31, 0.02, z + offset), 0.10, basic(color, 0.68)));
  }
  system.add(screen);
  return system;
}

function aodSystem(transportColor: string) {
  const system = new T.Group();
  const body = metal('#284357');
  const trim = metal('#42637b');
  const x = -7.08;
  const z = -1.17;
  system.add(
    outline(box(1.85, 0.18, 0.94, body, x, -1.44, z), '#557a94'),
    box(0.27, 0.87, 0.35, body, x, -0.93, z),
    outline(box(1.61, 0.66, 0.76, body, x, -0.21, z), '#557a94'),
    outline(box(0.48, 0.53, 0.79, trim, x + 0.43, -0.21, z), '#648ba1'),
    segment(vector(x + 0.78, 0.02, z), vector(x + 1.06, 0.02, z), 0.12, body),
    box(0.31, 0.04, 0.02, basic(transportColor, 0.71), x - 0.38, -0.15, z + 0.39),
  );
  return system;
}

function laserSystem({ sidePathX, paths, arrayY }: MachineSceneProfile) {
  const system = new T.Group();
  const body = metal('#3a3658');
  const trim = metal('#534a75');
  const x = sidePathX[0] + 1.66;
  const z = paths.rydberg.entranceZ;
  for (const { entranceZ: centerZ, color: beamColor } of [paths.clock, paths.rydberg, paths.probe]) {
    const color = basic(beamColor);
    system.add(outline(box(2.13, 0.85, 0.74, body, x, 0.08, centerZ), '#6b5a91'),
      outline(box(2.17, 0.11, 0.78, trim, x, 0.54, centerZ), '#7a63a4'),
      segment(vector(x - 1.64, arrayY, centerZ), vector(x - 1, arrayY, centerZ), 0.16, trim),
      segment(vector(x - 1.66, arrayY, centerZ), vector(x - 1.63, arrayY, centerZ), 0.10, color));
  }
  system.add(
    outline(box(2.63, 0.19, 2.56, body, x, -1.44, z), '#68628a'),
    outline(box(1.65, 1.16, 1.19, trim, x, -0.87, z), '#675987'),
  );
  const vents = basic('#191f34');
  for (let index = 0; index < 8; index++) {
    system.add(box(0.106, 0.25, 0.026, vents, x - 0.61 + index * 0.18, 0.00, z + 1.184));
  }
  return system;
}

function imagingSystem(probeColor: string) {
  const system = new T.Group();
  const dark = metal('#25374c');
  const lintel = metal('#4c687e');
  const warm = metal('#74594a');
  system.add(
    outline(box(0.96, 0.18, 0.83, dark, 2.88, -1.43, -1.87), '#5b7790'),
    outline(box(0.31, 4.74, 0.36, lintel, 2.88, 1.0, -1.87), '#7898b0'),
    outline(box(2.87, 0.27, 0.31, lintel, 1.47, 3.41, -1.87), '#738fac'),
    outline(box(0.31, 0.26, 1.68, lintel, 0.13, 3.41, -0.92), '#738fac'),
    outline(box(1.44, 0.89, 1.46, dark, 0, 3.44, 0), '#829eb4', 0.64),
    outline(box(1.18, 0.075, 1.29, lintel, 0, 3.93, 0), '#6b8fa3', 0.52),
    cylinder(0.63, 0.31, warm, 0, 2.90, 0),
    cylinder(0.49, 0.26, dark, 0, 2.65, 0),
    ring(0.40, 0.048, basic(probeColor, 0.79), 0, 2.50, 0),
    cylinder(0.36, 0.038, basic('#94593c', 0.66), 0, 2.493, 0),
    box(0.28, 0.075, 0.019, basic('#e4a96d', 0.74), 0.31, 3.59, 0.736),
  );
  const vents = basic('#142335');
  for (let index = 0; index < 5; index++) {
    system.add(box(0.08, 0.24, 0.018, vents, -0.50 + index * 0.14, 3.38, 0.735));
  }
  return system;
}

export class QuantumMachineRenderer {
  private scene = new T.Scene();
  private hardware = new T.Group();
  private array = new T.Group();
  private camera = new T.OrthographicCamera(-10, 10, 5, -5, 0.1, 180);
  private renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private view: MachineView = 'machine';
  private drawFrame = 0;
  private haloMap = glowTexture();
  private atomSlots: { atom: T.Mesh<T.SphereGeometry, T.MeshBasicMaterial>; halo: T.Sprite; ring: T.Mesh }[] = [];
  private pathReservoir;
  private pathScience;
  private pathTransport;
  private pathObjective;
  private pathClock;
  private pathRydberg;
  private pathProbe;
  private pathCooling;
  private trapFan;
  private transportFocus: ReturnType<typeof focusBeam>;
  private collectionCone: ReturnType<typeof focusBeam>;
  private ramanFocus: ReturnType<typeof focusBeam>[];
  private interactionLink;
  private gridGlow;
  private delivery: T.Vector3;
  private collection: T.Vector3;
  private reservoirColor: T.Color;
  private scienceColor: T.Color;
  private pendingFrame: MachineSceneFrame | null = null;
  private projected = new T.Vector3();

  constructor(private host: HTMLDivElement, private profile: MachineProfile, private labels: Record<string, HTMLSpanElement | null>) {
    const { rows, columns, registerRow } = profile.array;
    const { arrayY, arrayPitch: pitch, paths, sidePathX } = profile.scene;
    this.delivery = vector(...profile.scene.delivery);
    this.collection = vector(...profile.scene.collection);
    this.reservoirColor = new T.Color(paths.reservoir.color);
    this.scienceColor = new T.Color(paths.science.color);
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', '可旋转和缩放的三维整机光路');
    canvas.setAttribute('role', 'img');
    canvas.dataset.testid = 'quantum-scene-canvas';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.setClearColor('#08121d', 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.appendChild(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.14;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minZoom = 0.75;
    this.controls.maxZoom = 4;
    this.controls.addEventListener('change', this.invalidate);

    const key = new T.DirectionalLight('#c7e7ff', 2.4);
    key.position.set(-8, 15, 10);
    const fill = new T.DirectionalLight('#96b9ff', 1.18);
    fill.position.set(9, -2, -8);
    this.scene.add(new T.HemisphereLight('#b5cae3', '#536075', 1.8), key, fill);
    this.scene.add(this.hardware, this.array);
    const floor = gridLines(21, 0.75, '#416787', 0.23);
    floor.position.y = tableY - 0.83;
    const floorGlow = new T.Sprite(new T.SpriteMaterial({
      map: this.haloMap, color: '#294266', transparent: true, opacity: 0.23, blending: T.AdditiveBlending, depthWrite: false,
    }));
    floorGlow.position.set(0, -1.85, -4);
    floorGlow.scale.set(30, 13.0, 1);
    this.hardware.add(
      floorGlow, floor, table(), vacuumChamber(this.haloMap, paths.reservoir.color), atomicSource(),
      slmSystem(paths.reservoir.color, paths.science.color), aodSystem(paths.transport.color),
      laserSystem(profile.scene), imagingSystem(paths.probe.color),
    );
    // Common delivery objective for fixed/moving tweezers and local Raman beams.
    const createPath = ({ points, color, width }: MachineSceneProfile['paths']['reservoir']) =>
      opticalPath(this.hardware, points.map(point => vector(...point)), color, width);
    this.pathReservoir = createPath(paths.reservoir);
    this.pathScience = createPath(paths.science);
    this.pathTransport = createPath(paths.transport);
    this.pathObjective = createPath(paths.objective);

    // Side illumination runs along the interaction row, not through the camera.
    const rowZ = (registerRow - (rows - 1) / 2) * pitch;
    const sidePath = ({ entranceZ, color, width }: MachineSceneProfile['paths']['clock']) => createPath({
      points: [[sidePathX[0], arrayY, entranceZ], [sidePathX[1], arrayY, rowZ], [sidePathX[2], arrayY, rowZ]],
      color, width,
    });
    this.pathClock = sidePath(paths.clock);
    this.pathRydberg = sidePath(paths.rydberg);
    this.pathProbe = sidePath(paths.probe);
    this.pathCooling = paths.cooling.map(createPath);
    this.transportFocus = focusBeam(paths.transport.color, 0.035, 0.17, 0.54);
    this.collectionCone = focusBeam(paths.probe.color, 0.36, 0.04, 0.11);
    this.ramanFocus = Array.from({ length: columns }, () => focusBeam(profile.scene.ramanColor, 0.04, 0.15, 0.50));
    this.hardware.add(this.transportFocus, this.collectionCone, ...this.ramanFocus);

    this.gridGlow = new T.Mesh(new T.PlaneGeometry((columns + 2) * pitch, (rows + 2) * pitch).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: '#238b80', map: this.haloMap, transparent: true, opacity: 0.20, blending: T.AdditiveBlending, depthWrite: false }));
    this.gridGlow.position.y = arrayY - 0.08;
    this.array.add(this.gridGlow);
    const arrayWidth = columns * pitch;
    const arrayDepth = rows * pitch;
    const boundary = box(arrayWidth + 0.12, 0.018, arrayDepth + 0.12, basic('#132e38', 0.45), 0, arrayY - 0.13, 0);
    this.array.add(outline(boundary, '#388981', 0.42));
    const gridPoints: number[] = [];
    for (let column = 0; column <= columns; column++) {
      const x = column * pitch - arrayWidth / 2;
      gridPoints.push(x, arrayY - 0.116, -arrayDepth / 2, x, arrayY - 0.116, arrayDepth / 2);
    }
    for (let row = 0; row <= rows; row++) {
      const z = row * pitch - arrayDepth / 2;
      gridPoints.push(-arrayWidth / 2, arrayY - 0.116, z, arrayWidth / 2, arrayY - 0.116, z);
    }
    this.array.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(gridPoints, 3)),
      new T.LineBasicMaterial({ color: '#478d85', transparent: true, opacity: 0.29 })));

    const tweezerRays: number[] = [];
    const siteGeometry = new T.TorusGeometry(0.103, 0.011, 5, 16).rotateX(-Math.PI / 2);
    const siteMaterial = basic('#4a908a', 0.63);
    const atomGeometry = new T.SphereGeometry(0.092, 20, 14);
    const addressGeometry = new T.TorusGeometry(0.157, 0.013, 6, 32).rotateX(-Math.PI / 2);
    const addressMaterial = basic('#d4bfff', 0.90);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const site = new T.Mesh(siteGeometry, siteMaterial);
        site.position.set((column - (columns - 1) / 2) * pitch, arrayY - 0.085, (row - (rows - 1) / 2) * pitch);
        tweezerRays.push(this.delivery.x, this.delivery.y + 0.03, this.delivery.z,
          site.position.x, arrayY - 0.055, site.position.z);
        const atom = new T.Mesh(atomGeometry, basic(colors.atom));
        atom.visible = false;
        const halo = new T.Sprite(new T.SpriteMaterial({
          map: this.haloMap, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false,
        }));
        halo.scale.setScalar(0.63);
        halo.visible = false;
        const qubitRing = new T.Mesh(addressGeometry, addressMaterial);
        qubitRing.visible = false;
        this.array.add(site, atom, halo, qubitRing);
        this.atomSlots.push({ atom, halo, ring: qubitRing });
      }
    }
    this.trapFan = new T.LineSegments(
      new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(tweezerRays, 3)),
      new T.LineBasicMaterial({ color: paths.reservoir.color, transparent: true, opacity: 0.12, depthWrite: false, blending: T.AdditiveBlending }),
    );
    this.hardware.add(this.trapFan);
    this.interactionLink = new T.LineSegments(
      new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(new Float32Array(rows * columns * 6), 3)),
      new T.LineBasicMaterial({ color: '#d4bfff', transparent: true, opacity: 0.8 }),
    );
    this.interactionLink.geometry.setDrawRange(0, 0);
    this.interactionLink.frustumCulled = false;
    this.array.add(this.interactionLink);

    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.setView('machine');
  }

  setView(view: MachineView) {
    this.view = view;
    this.hardware.visible = view === 'machine';
    this.camera.zoom = 1;
    this.controls.target.set(0, view === 'machine' ? 0.35 : this.profile.scene.arrayY, 0);
    if (view === 'machine') this.camera.position.set(9.4, 13.8, 24.6);
    else this.camera.position.set(0.83, 11, 7.7);
    this.controls.update();
    this.resize();
  }

  update(frame: MachineSceneFrame) {
    const { atoms, activeQubits, strengths, scienceWeight, readout, raman, blockade, transport, collecting, occupancyExposure } = frame;
    const { rows, columns, registerRow } = this.profile.array;
    const { arrayY, arrayPitch: pitch, paths } = this.profile.scene;
    this.setPath(this.pathReservoir, strengths.reservoir);
    this.setPath(this.pathScience, strengths.science);
    this.setPath(this.pathTransport, strengths.transport);
    this.setPath(this.pathObjective, strengths.objective);
    this.pathObjective.core.color.copy(this.reservoirColor).lerp(this.scienceColor, scienceWeight);
    this.pathObjective.line.color.copy(this.pathObjective.core.color);
    this.pathObjective.envelope.color.copy(this.pathObjective.core.color);
    this.trapFan.material.color.copy(this.pathObjective.core.color);
    this.trapFan.material.opacity = strengths.trapFan;
    this.setPath(this.pathClock, strengths.clock);
    this.setPath(this.pathRydberg, strengths.rydberg);
    this.setPath(this.pathProbe, strengths.probe);
    for (const path of this.pathCooling) this.setPath(path, strengths.cooling);
    this.gridGlow.material.opacity = strengths.grid;

    let movingPosition: T.Vector3 | undefined;
    const addressed: T.Vector3[] = [];
    const fluorescing: T.Vector3[] = [];
    this.atomSlots.forEach(({ atom, halo, ring: qubitRing }, index) => {
      const data = atoms[index];
      atom.visible = halo.visible = Boolean(data);
      qubitRing.visible = data?.qubit !== undefined && activeQubits.includes(data.qubit);
      if (!data) return;
      const x = (data.column - (columns - 1) / 2) * pitch;
      const z = (data.row - (rows - 1) / 2) * pitch;
      const occupancyLit = occupancyExposure && Math.abs(data.row - registerRow) < 0.001;
      atom.position.set(x, arrayY, z);
      halo.position.copy(atom.position);
      qubitRing.position.set(x, arrayY - 0.044, z);
      const color = data.bright === true || occupancyLit ? colors.bright : data.bright === false ? colors.dark
        : data.moving ? paths.transport.color : qubitRing.visible && !readout ? colors.qubit : colors.atom;
      atom.material.color.set(color);
      atom.scale.setScalar(data.bright === false ? 0.82 : qubitRing.visible || data.moving ? 1.29 : 1.0);
      halo.material.color.set(color);
      halo.material.opacity = data.bright === false ? 0.20 : qubitRing.visible || data.moving ? 0.9 : 0.66;
      if (qubitRing.visible) addressed.push(atom.position);
      if (data.bright || occupancyLit) fluorescing.push(atom.position);
      if (data.moving) movingPosition = atom.position;
    });
    this.transportFocus.visible = transport && Boolean(movingPosition);
    if (movingPosition) steerBeam(this.transportFocus, this.delivery, movingPosition);

    this.ramanFocus.forEach((beam, index) => {
      beam.visible = raman && Boolean(addressed[index]);
      if (beam.visible) steerBeam(beam, this.delivery, addressed[index]);
    });
    this.collectionCone.visible = collecting && fluorescing.length > 0;
    if (this.collectionCone.visible) {
      const source = this.projected.set(0, 0, 0);
      for (const atom of fluorescing) source.add(atom);
      source.divideScalar(fluorescing.length);
      steerBeam(this.collectionCone, source, this.collection);
    }

    const activeAtoms = blockade ? addressed : [];
    const positions = this.interactionLink.geometry.getAttribute('position');
    for (let index = 1; index < activeAtoms.length; index++) {
      const from = activeAtoms[index - 1];
      const to = activeAtoms[index];
      positions.setXYZ((index - 1) * 2, from.x, from.y + 0.03, from.z);
      positions.setXYZ((index - 1) * 2 + 1, to.x, to.y + 0.03, to.z);
    }
    positions.needsUpdate = true;
    this.interactionLink.geometry.setDrawRange(0, Math.max(0, activeAtoms.length - 1) * 2);
    this.pendingFrame = frame;
    this.invalidate();
  }

  private setPath(path: ReturnType<typeof opticalPath>, strength: number) {
    path.line.opacity = strength * 0.83;
    path.core.opacity = strength * 0.64;
    path.envelope.opacity = strength * 0.15;
  }

  private resize = () => {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    const aspect = width / height;
    const frameHeight = this.view === 'machine' ? Math.max(5.5, 10.7 / aspect) : Math.max(2.68, 3.2 / aspect);
    this.camera.left = -frameHeight * aspect;
    this.camera.right = frameHeight * aspect;
    this.camera.bottom = -frameHeight - (this.view === 'machine' ? 0.53 : 0);
    this.camera.top = frameHeight - (this.view === 'machine' ? 0.53 : 0);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.invalidate();
  };

  private invalidate = () => {
    if (!this.drawFrame) this.drawFrame = requestAnimationFrame(this.draw);
  };

  private draw = () => {
    this.drawFrame = 0;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (this.pendingFrame) {
      const { stage, activePath, fluorescence, occupancy, occupancyPhase, movingAtom, skipped } = this.pendingFrame;
      const { dataset } = this.renderer.domElement;
      dataset.stage = stage;
      if (activePath?.id) dataset.activePath = activePath.id;
      else delete dataset.activePath;
      if (fluorescence !== null) dataset.fluorescence = fluorescence;
      else delete dataset.fluorescence;
      if (occupancy !== null) dataset.occupancy = occupancy;
      else delete dataset.occupancy;
      if (occupancyPhase !== null) dataset.occupancyPhase = occupancyPhase;
      else delete dataset.occupancyPhase;
      if (movingAtom !== null) dataset.movingAtom = movingAtom;
      else delete dataset.movingAtom;
      if (skipped) dataset.stageSkipped = 'true';
      else delete dataset.stageSkipped;
      dataset.atomLayout = this.pendingFrame.atoms.map((atom, index) => {
        const { x, y, z } = this.atomSlots[index].atom.position;
        return `${atom.id}:${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      }).join(';');
      this.pendingFrame = null;
    }
    if (this.view !== 'machine') return;
    const { clientWidth: width, clientHeight: height } = this.host;
    for (const { id, position } of this.profile.scene.labels) {
      const label = this.labels[id];
      if (!label) continue;
      this.projected.set(...position).project(this.camera);
      const x = (this.projected.x / 2 + 0.5) * width;
      const y = (0.5 - this.projected.y / 2) * height;
      const visible = x >= 27 && x <= width - 27 && y >= 25 && y <= height - 27;
      label.style.visibility = visible ? 'visible' : 'hidden';
      label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  };

  dispose() {
    cancelAnimationFrame(this.drawFrame);
    this.observer.disconnect();
    this.controls.dispose();
    const geometries = new Set<T.BufferGeometry>();
    const materials = new Set<T.Material>();
    this.scene.traverse(object => {
      if ('geometry' in object && object.geometry instanceof T.BufferGeometry) geometries.add(object.geometry);
      if ('material' in object && object.material instanceof T.Material) materials.add(object.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.haloMap.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
