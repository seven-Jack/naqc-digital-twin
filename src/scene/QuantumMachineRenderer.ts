import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MachineProfile } from '../data/machineProfile';
import { interactionPath, type MachineSceneProfile } from '../data/machineSceneProfile';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { axisLabel, glowTexture } from './arrayGeometry';
import { interactionSiteXUm, munizEvidence, norciaTransport } from '../data/hardwareEvidence';
import { publishedInteractionRow, sceneUnitsPerMicrometre } from './munizInteractionRow';
import type { MachineSceneFrame } from './machineSceneFrame';

import { positionEquipmentLabels } from './machineSceneLabels';
import { EquipmentAssembly } from './machineEquipmentAssembly';
import { atomicSource, aodSystem, basic, box, colors, imagingSystem, laserSystem, outline, segment, slmSystem, table, tableY, vacuumChamber, vector } from './machineHardware';
import type { EquipmentId } from '../data/machineEquipment';

export type MachineView = 'machine' | 'array' | 'published';

const beamAxis = vector(0, 1, 0);
const beamDirection = new T.Vector3();

function opticalPath(parent: T.Group, points: T.Vector3[], color: string, width = 0.12) {
  const core = new T.MeshBasicMaterial({
    color, transparent: true, opacity: 0.24, depthWrite: false, blending: T.AdditiveBlending,
  });
  const envelope = core.clone();
  envelope.opacity = 0.04;
  const line = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({
    color, transparent: true, opacity: 0.54, depthWrite: false, blending: T.AdditiveBlending,
  }));
  const group = new T.Group();
  parent.add(group);
  group.add(line);
  const firstSegment: T.Mesh[] = [];
  for (let index = 1; index < points.length; index++) {
    const solids = [segment(points[index - 1], points[index], width * 0.31, core),
      segment(points[index - 1], points[index], width, envelope)];
    group.add(...solids);
    if (index === 1) firstSegment.push(...solids);
  }
  // A direction marker follows the polyline by distance, using playback time alone.
  const route = new T.CurvePath<T.Vector3>();
  for (let i = 1; i < points.length; i++) route.add(new T.LineCurve3(points[i - 1], points[i]));
  const marker = new T.Mesh(new T.ConeGeometry(width * 0.95, width * 3, 12), basic(color));
  marker.visible = false;
  group.add(marker);
  return { core, envelope, line: line.material, group, route, marker, firstSegment, polyline: line, start: points[0].clone() };
}

// The collimator lifts away with its channel. Subsequent fold mirrors stay on the common mount.
function connectCollimator(path: ReturnType<typeof opticalPath>, output: T.Vector3, mount: T.Vector3) {
  const first = path.route.curves[0] as T.LineCurve3;
  const start = path.start.clone().add(output).sub(mount);
  path.group.position.copy(mount);
  if (first.v1.equals(start)) return;
  first.v1.copy(start);
  const direction = first.v2.clone().sub(start);
  const scale = direction.length() / path.start.distanceTo(first.v2);
  direction.normalize();
  for (const mesh of path.firstSegment) {
    mesh.position.copy(start).lerp(first.v2, 0.5);
    mesh.scale.y = scale;
    mesh.quaternion.setFromUnitVectors(beamAxis, direction);
  }
  const positions = path.polyline.geometry.getAttribute('position');
  positions.setXYZ(0, start.x, start.y, start.z);
  positions.needsUpdate = true;
  path.polyline.geometry.computeBoundingSphere();
  first.updateArcLengths();
  path.route.updateArcLengths();
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

export class QuantumMachineRenderer {
  private scene = new T.Scene();
  private environment: T.WebGLRenderTarget;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private lastFrame: MachineSceneFrame | null = null;
  private motionChanged = () => { if (this.lastFrame) this.update(this.lastFrame); };
  private hardware = new T.Group();
  private array = new EquipmentAssembly('array');
  private publishedRow: T.Group;
  private rowLabels: T.Sprite[];
  private assemblies: Record<EquipmentId, EquipmentAssembly>;
  private inspection: EquipmentAssembly | null = null;
  private selectedPart: string | null = null;
  private inspectionSize = new T.Vector2();
  private renderSize = new T.Vector2();
  private savedCamera: { position: T.Vector3; target: T.Vector3; zoom: number } | null = null;
  private pointer: { id: number; x: number; y: number } | null = null;
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
  private pathRaman;
  private pathClock;
  private pathRydberg;
  private pathProbe;
  private pathCooling;
  private elevatorBeam;
  private sampleCloud;
  private transportLabel;
  private gateChannels;
  private slmInspectionLight = new T.Group();
  private slmChannels;
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

  constructor(private host: HTMLDivElement, private profile: MachineProfile,
    private labels: Record<string, HTMLElement | null>, private onPick?: (module: EquipmentId, part?: string) => void) {
    const { rows, columns, registerRow } = profile.array;
    const { arrayY, arrayPitch: pitch, paths } = profile.scene;
    this.delivery = vector(...profile.scene.delivery);
    this.collection = vector(...profile.scene.collection);
    this.reservoirColor = new T.Color(paths.reservoir.color);
    this.scienceColor = new T.Color(paths.science.color);
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', '可旋转和缩放的三维整机光路');
    canvas.setAttribute('role', 'img');
    canvas.dataset.testid = 'quantum-scene-canvas';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.setClearColor('#1a1c1d', 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    host.appendChild(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    // Keep the projected labels and pick ray at the pose where the user released the pointer.
    this.controls.enableDamping = false;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minZoom = 0.75;
    this.controls.maxZoom = 4;
    this.controls.addEventListener('change', this.invalidate);

    const room = new RoomEnvironment();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 64 });
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.62;
    room.dispose();
    pmrem.dispose();
    const key = new T.DirectionalLight('#fff0da', 2.1);
    key.position.set(-8, 15, 9);
    key.castShadow = true;
    Object.assign(key.shadow.camera, { left: -11, right: 11, top: 8, bottom: -8, near: 0.5, far: 48 });
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.normalBias = 0.018;
    key.shadow.bias = -0.00025;
    const fill = new T.DirectionalLight('#c3d7e1', 0.98);
    fill.position.set(9, -2, -8);
    this.scene.add(new T.HemisphereLight('#e4ded2', '#666a6b', 1.05), key, fill);
    const rowOffset = (registerRow - (rows - 1) / 2) * pitch;
    this.assemblies = {
      table: table(), source: atomicSource(profile.scene), vacuum: vacuumChamber(profile.scene),
      slm: slmSystem(profile.scene), aod: aodSystem(paths.transport.color),
      gate: laserSystem(profile.scene, rowOffset), imaging: imagingSystem(profile.scene), array: this.array,
    };
    for (const assembly of Object.values(this.assemblies)) {
      assembly.traverse(object => {
        if (!(object instanceof T.Mesh) || object.userData.ignorePick || object.material.transparent) return;
        object.castShadow = assembly.equipmentId !== 'table';
        object.receiveShadow = true;
      });
    }
    this.scene.add(this.hardware, ...Object.values(this.assemblies));
    this.publishedRow = publishedInteractionRow(arrayY);
    const { gatePitchUm, interactionRowGapUm } = munizEvidence;
    this.rowLabels = [
      axisLabel(`${gatePitchUm} μm`, '#e6d5b3', vector(interactionSiteXUm[0] + gatePitchUm / 2, 2.15, 0), 7.5),
      axisLabel(`${interactionRowGapUm} μm`, '#e6d5b3', vector(interactionSiteXUm[interactionSiteXUm.length - 1] + 2.9, -interactionRowGapUm / 2, 0), 7.5),
    ];
    this.publishedRow.add(...this.rowLabels);
    this.scene.add(this.publishedRow);
    this.slmChannels = (['reservoir', 'science'] as const).map(channel => {
      const { points, color } = paths[channel];
      const beam = focusBeam(color, 0.055, 0.055, 0);
      this.slmInspectionLight.add(beam);
      return { channel, beam, from: vector(...points[0]), to: vector(...points[points.length - 1]) };
    });
    this.scene.add(this.slmInspectionLight);
    const shadow = new T.Mesh(new T.PlaneGeometry(25, 13).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ map: this.haloMap, color: '#070807', transparent: true, opacity: 0.62, depthWrite: false }));
    shadow.position.y = tableY - 1.33;
    this.hardware.add(shadow);
    // Common delivery objective for fixed/moving tweezers and local Raman beams.
    const createPath = ({ points, color, width }: MachineSceneProfile['paths']['reservoir']) =>
      opticalPath(this.hardware, points.map(point => vector(...point)), color, width);
    this.pathReservoir = createPath(paths.reservoir);
    this.pathScience = createPath(paths.science);
    this.pathTransport = createPath(paths.transport);
    this.pathObjective = createPath(paths.objective);
    this.pathRaman = createPath({ ...paths.raman, points: [...paths.raman.points, ...paths.objective.points.slice(1)] });

    // Side illumination runs along the interaction row, not through the camera.
    const sidePath = (path: MachineSceneProfile['paths']['clock']) => createPath(interactionPath(path, arrayY, rowOffset));
    this.pathClock = sidePath(paths.clock);
    this.pathRydberg = sidePath(paths.rydberg);
    this.pathProbe = sidePath(paths.probe);
    this.gateChannels = { clock: this.pathClock, rydberg: this.pathRydberg, probe: this.pathProbe };
    this.pathCooling = paths.cooling.map(createPath);
    this.elevatorBeam = createPath({ points: [[0, profile.scene.motY, 0], [0, arrayY, 0]], color: '#a2ddb3', width: 0.105 });
    // The cutaway overlay shows the sample through the opaque differential pumping tube.
    this.sampleCloud = new T.Sprite(new T.SpriteMaterial({ map: this.haloMap, color: '#bbfce3', transparent: true,
      depthTest: false, depthWrite: false, blending: T.AdditiveBlending }));
    this.sampleCloud.scale.set(0.6, 0.49, 1);
    this.sampleCloud.renderOrder = 4;
    this.scene.add(this.sampleCloud);
    const { motY } = profile.scene;
    const rulerX = 2.95, rulerZ = 0.24;
    const ticks = [vector(rulerX, motY, rulerZ), vector(rulerX, arrayY, rulerZ)];
    for (let i = 0; i <= 6; i++) {
      const y = motY + i * (arrayY - motY) / 6;
      const halfWidth = i % 2 === 0 ? 0.12 : 0.07;
      ticks.push(vector(rulerX - halfWidth, y, rulerZ), vector(rulerX + halfWidth, y, rulerZ));
    }
    this.transportLabel = axisLabel(`${norciaTransport.separationM * 1000} mm`, '#e6d5b3',
      vector(rulerX + 0.67, (motY + arrayY) / 2, rulerZ), 3.2);
    this.hardware.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(ticks),
      new T.LineBasicMaterial({ color: '#cbb792' })), this.transportLabel);
    this.transportFocus = focusBeam(paths.transport.color, 0.035, 0.17, 0.54);
    this.collectionCone = focusBeam(paths.probe.color, 0.36, 0.04, 0.11);
    this.ramanFocus = Array.from({ length: columns }, () => focusBeam(paths.raman.color, 0.04, 0.15, 0.50));
    this.hardware.add(this.transportFocus, this.collectionCone, ...this.ramanFocus);

    const featureScale = pitch / 0.5;
    const plane = this.array.part('plane', [0, 0, -0.85 * featureScale]);
    const sites = this.array.part('sites', [0, 0, 0]);
    const atomLayer = this.array.part('atoms', [0, 0, 0.85 * featureScale]);
    this.gridGlow = new T.Mesh(new T.PlaneGeometry((columns + 2) * pitch, (rows + 2) * pitch),
      new T.MeshBasicMaterial({ color: '#238b80', map: this.haloMap, transparent: true, opacity: 0.20, blending: T.AdditiveBlending, depthWrite: false }));
    this.gridGlow.position.set(0, arrayY, -0.08 * featureScale);
    this.gridGlow.userData.ignorePick = true;
    plane.add(this.gridGlow);
    const arrayWidth = columns * pitch;
    const arrayDepth = rows * pitch;
    const boundary = box(arrayWidth + 0.12 * featureScale, arrayDepth + 0.12 * featureScale, 0.018 * featureScale, basic('#132e38', 0.45), 0, arrayY, -0.13 * featureScale);
    plane.add(outline(boundary, '#388981', 0.42));
    const gridPoints: number[] = [];
    for (let column = 0; column <= columns; column++) {
      const x = column * pitch - arrayWidth / 2;
      gridPoints.push(x, arrayY - arrayDepth / 2, -0.116 * featureScale, x, arrayY + arrayDepth / 2, -0.116 * featureScale);
    }
    for (let row = 0; row <= rows; row++) {
      const y = arrayY + arrayDepth / 2 - row * pitch;
      gridPoints.push(-arrayWidth / 2, y, -0.116 * featureScale, arrayWidth / 2, y, -0.116 * featureScale);
    }
    plane.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(gridPoints, 3)),
      new T.LineBasicMaterial({ color: '#478d85', transparent: true, opacity: 0.29 })));

    const tweezerRays: number[] = [];
    const siteGeometry = new T.TorusGeometry(0.103 * featureScale, 0.011 * featureScale, 5, 16);
    const siteMaterial = basic('#4a908a', 0.63);
    const atomGeometry = new T.SphereGeometry(0.092 * featureScale, 20, 14);
    const addressGeometry = new T.TorusGeometry(0.157 * featureScale, 0.013 * featureScale, 6, 32);
    const addressMaterial = basic('#d4bfff', 0.90);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const site = new T.Mesh(siteGeometry, siteMaterial);
        site.position.set((column - (columns - 1) / 2) * pitch, arrayY - (row - (rows - 1) / 2) * pitch, -0.085 * featureScale);
        tweezerRays.push(this.delivery.x, this.delivery.y, this.delivery.z,
          site.position.x, site.position.y, -0.055 * featureScale);
        const atom = new T.Mesh(atomGeometry, basic(colors.atom));
        atom.visible = false;
        const halo = new T.Sprite(new T.SpriteMaterial({
          map: this.haloMap, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false,
        }));
        halo.scale.setScalar(0.63 * featureScale);
        halo.visible = false;
        const qubitRing = new T.Mesh(addressGeometry, addressMaterial);
        qubitRing.visible = false;
        sites.add(site);
        atomLayer.add(atom, halo, qubitRing);
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
    atomLayer.add(this.interactionLink);

    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerCancel);

    this.reducedMotion.addEventListener('change', this.motionChanged);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.setView('machine');
  }

  setView(view: MachineView) {
    this.view = view;
    if (this.inspection) return;
    this.setVisibleModules();
    this.camera.zoom = 1;
    this.controls.target.set(0, view === 'machine' ? 0.35 : this.profile.scene.arrayY, 0);
    if (view === 'machine') this.camera.position.set(9.4, 13.8, 24.6);
    else if (view === 'published') {
      this.controls.target.y -= 2.1 * sceneUnitsPerMicrometre;
      this.camera.position.copy(this.controls.target).add(vector(0.04, 0.10, 0.8));
    } else this.camera.position.set(0.45, this.profile.scene.arrayY + 0.7, 12);
    this.controls.update();
    this.resize();
  }

  private setVisibleModules() {
    this.hardware.visible = !this.inspection && this.view === 'machine';
    this.publishedRow.visible = !this.inspection && this.view === 'published';
    this.updateSampleCloud();
    // Regenerate a static contact shadow on return to the overview. Inspection modules can move freely.
    this.renderer.shadowMap.enabled = this.hardware.visible;
    this.renderer.shadowMap.needsUpdate = this.hardware.visible;
    this.array.parts.get('plane')!.group.visible = !this.hardware.visible;
    const inspectingGate = this.inspection?.equipmentId === 'gate';
    for (const path of Object.values(this.gateChannels)) (inspectingGate ? this.scene : this.hardware).add(path.group);
    this.slmInspectionLight.visible = this.inspection?.equipmentId === 'slm';
    for (const assembly of Object.values(this.assemblies)) {
      assembly.visible = this.inspection ? assembly === this.inspection : this.view === 'machine' || (this.view === 'array' && assembly === this.array);
    }
  }

  setInspection(id: EquipmentId | null, explosion = 0, part: string | null = null) {
    const next = id ? this.assemblies[id] : null;
    const { dataset } = this.renderer.domElement;
    if (next !== this.inspection) {
      if (!this.inspection) {
        this.savedCamera = { position: this.camera.position.clone(), target: this.controls.target.clone(), zoom: this.camera.zoom };
      } else {
        this.inspection.selectPart(null);
        this.inspection.setExplosion(0);
        if (this.inspection.equipmentId === 'gate') this.alignGateChannels();
      }
      this.selectedPart = null;
      this.inspection = next;
      this.setVisibleModules();
      if (next) this.focusAssembly(next);
      else if (this.savedCamera) {
        this.camera.position.copy(this.savedCamera.position);
        this.controls.target.copy(this.savedCamera.target);
        this.camera.zoom = this.savedCamera.zoom;
        this.savedCamera = null;
      }
      this.controls.update();
      this.resize();
    }
    if (next) {
      const amount = Math.max(0, Math.min(1, explosion));
      next.setExplosion(amount);
      if (id === 'gate') this.alignGateChannels();
      if (id === 'slm') {
        const ports = next.parts.get('ports')!.group.position;
        const relay = next.parts.get('relay')!.group.position;
        for (const { beam, from, to } of this.slmChannels) {
          steerBeam(beam, from.clone().add(ports), to.clone().add(relay));
        }
      }
      if (part !== this.selectedPart) {
        next.selectPart(part);
        this.selectedPart = part;
      }
      dataset.inspectionModule = next.equipmentId;
      dataset.explosion = String(amount);
      if (part) dataset.inspectionPart = part;
      else delete dataset.inspectionPart;
      dataset.partLayout = JSON.stringify(Object.fromEntries([...next.parts].map(([key, { group }]) => [key, group.position.toArray()])));
    } else {
      delete dataset.inspectionModule;
      delete dataset.explosion;
      delete dataset.inspectionPart;
      delete dataset.partLayout;
    }
    this.updateSampleCloud();
    this.invalidate();
  }

  private alignGateChannels() {
    const parts = this.assemblies.gate.parts;
    const mount = parts.get('mount')!.group.position;
    for (const channel of ['clock', 'rydberg', 'probe'] as const) {
      const path = this.gateChannels[channel];
      connectCollimator(path, parts.get(channel)!.group.position, mount);
      if (this.lastFrame) this.setPath(path, this.lastFrame.strengths[channel]);
    }
  }

  private focusAssembly(assembly: EquipmentAssembly) {
    const bounds = assembly.inspectionBounds();
    bounds.getCenter(this.controls.target);
    // Look past the open coil bore toward the rear manifold.
    const direction = assembly.equipmentId === 'vacuum' ? vector(8, 5.5, 10) : vector(-6.2, 6.4, 12);
    this.camera.position.copy(this.controls.target).add(direction);
    this.camera.zoom = 1;
    this.camera.lookAt(this.controls.target);
    this.camera.updateMatrixWorld();
    // Measure the bounding box in camera space so a long table fits a narrow screen.
    const size = bounds.applyMatrix4(this.camera.matrixWorldInverse).getSize(new T.Vector3());
    this.inspectionSize.set(size.x, size.y);
  }

  private pointerDown = (event: PointerEvent) => {
    this.pointer = event.isPrimary && event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  };

  private pointerMove = (event: PointerEvent) => {
    if (this.pointer?.id === event.pointerId && Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y) > 5) this.pointer = null;
  };

  private pointerCancel = () => { this.pointer = null; };

  private pointerUp = (event: PointerEvent) => {
    this.pointerMove(event);
    const isTap = this.pointer?.id === event.pointerId;
    this.pointer = null;
    if (!isTap || !this.onPick) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cursor = new T.Vector2(2 * (event.clientX - rect.left) / rect.width - 1, 1 - 2 * (event.clientY - rect.top) / rect.height);
    const ray = new T.Raycaster();
    ray.setFromCamera(cursor, this.camera);
    if (this.publishedRow.visible) {
      const hits = ray.intersectObjects(this.publishedRow.children.filter(child => child instanceof T.Mesh), false);
      if (hits.length) this.onPick('array');
      return;
    }
    const solidMeshes: T.Mesh[] = [];
    for (const assembly of Object.values(this.assemblies)) assembly.traverseVisible(object => {
      if (object instanceof T.Mesh && !object.userData.ignorePick) solidMeshes.push(object);
    });
    const hit = ray.intersectObjects(solidMeshes, false)[0];
    if (!hit) return;
    let part = hit.object;
    while (part.parent && !(part.parent instanceof EquipmentAssembly)) part = part.parent;
    if (part.parent instanceof EquipmentAssembly) this.onPick(part.parent.equipmentId, this.inspection ? part.name : undefined);
  };

  update(frame: MachineSceneFrame) {
    const { atoms, activeQubits, strengths, scienceWeight, readout, raman, blockade, transport, collecting, emittingAtoms } = frame;
    const { rows, columns } = this.profile.array;
    const { arrayY, arrayPitch: pitch, paths } = this.profile.scene;
    this.lastFrame = frame;
    this.setPath(this.pathReservoir, strengths.reservoir);
    this.setPath(this.pathScience, strengths.science);
    for (const { channel, beam } of this.slmChannels) {
      beam.visible = frame.stage !== 'cooling' && strengths[channel] > 0;
      beam.material.opacity = strengths[channel];
    }
    this.setPath(this.pathTransport, strengths.transport);
    this.setPath(this.pathObjective, strengths.objective);
    this.setPath(this.pathRaman, raman ? 0.94 : 0);
    this.pathObjective.core.color.copy(this.reservoirColor).lerp(this.scienceColor, scienceWeight);
    this.pathObjective.line.color.copy(this.pathObjective.core.color);
    this.pathObjective.envelope.color.copy(this.pathObjective.core.color);
    this.pathObjective.marker.material.color.copy(this.pathObjective.core.color);
    this.trapFan.material.color.copy(this.pathObjective.core.color);
    this.trapFan.material.opacity = strengths.trapFan;
    this.setPath(this.pathClock, strengths.clock);
    this.setPath(this.pathRydberg, strengths.rydberg);
    this.setPath(this.pathProbe, strengths.probe);
    for (const path of this.pathCooling) this.setPath(path, strengths.cooling);
    this.setPath(this.elevatorBeam, frame.elevatorProgress === null ? 0 : 0.8);
    this.updateSampleCloud();
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
      const y = arrayY - (data.row - (rows - 1) / 2) * pitch;
      const emitting = emittingAtoms.has(data.id);
      atom.position.set(x, y, 0);
      halo.position.copy(atom.position);
      qubitRing.position.set(x, y, 0.088 * pitch);
      const color = emitting ? colors.bright : data.bright === false ? colors.dark
        : data.moving ? paths.transport.color : qubitRing.visible && !readout ? colors.qubit : colors.atom;
      atom.material.color.set(color);
      atom.scale.setScalar(data.bright === false ? 0.82 : qubitRing.visible || data.moving ? 1.29 : 1.0);
      halo.material.color.set(color);
      halo.material.opacity = data.bright === false ? 0.20 : qubitRing.visible || data.moving ? 0.9 : 0.66;
      if (qubitRing.visible) addressed.push(atom.position);
      if (emitting) fluorescing.push(atom.position);
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
      positions.setXYZ((index - 1) * 2, from.x, from.y, from.z + 0.03);
      positions.setXYZ((index - 1) * 2 + 1, to.x, to.y, to.z + 0.03);
    }
    positions.needsUpdate = true;
    this.interactionLink.geometry.setDrawRange(0, Math.max(0, activeAtoms.length - 1) * 2);
    this.pendingFrame = frame;
    this.invalidate();
  }

  private updateSampleCloud() {
    const frame = this.lastFrame;
    // In the source close-up the vacuum tube is a movable exploded part.
    const source = this.inspection?.equipmentId === 'source';
    this.sampleCloud.visible = Boolean(frame?.illustratedSupply && (this.hardware.visible || source));
    if (!this.sampleCloud.visible || !frame) return;
    const { motY, arrayY } = this.profile.scene;
    const progress = frame.elevatorProgress ?? 0;
    this.sampleCloud.position.set(0, motY + (arrayY - motY) * progress, 0);
    if (source) {
      const parts = this.inspection!.parts;
      this.sampleCloud.position.addScaledVector(parts.get('body')!.group.position, 1 - progress);
      this.sampleCloud.position.addScaledVector(parts.get('nozzle')!.group.position, progress);
    }
  }

  private setPath(path: ReturnType<typeof opticalPath>, strength: number) {
    const frame = this.lastFrame!;
    path.marker.visible = !!frame.activePath && !frame.skipped && strength > 0.25;
    if (path.marker.visible) {
      const progress = this.reducedMotion.matches ? 0.65 : frame.stageProgress;
      path.route.getPoint(progress, path.marker.position);
      // CurvePath's generic tangent uses a finite difference at corners.
      path.marker.quaternion.setFromUnitVectors(beamAxis, path.route.getTangent(progress, beamDirection));
    }
    path.line.opacity = strength * 0.83;
    path.core.opacity = strength * 0.64;
    path.envelope.opacity = strength * 0.15;
  }

  private resize = () => {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    const aspect = width / height;
    const frameHeight = this.inspection ? 0.56 * Math.max(this.inspectionSize.y, this.inspectionSize.x / aspect)
      : this.view === 'published' ? sceneUnitsPerMicrometre * Math.max(6.7, 14 / aspect)
      : this.view === 'machine' ? Math.max(5.5, 10.7 / aspect) : this.profile.scene.arrayPitch * Math.max(5.36, 6.4 / aspect);
    const offset = !this.inspection && this.view === 'machine' ? 0.53 : 0;
    this.camera.left = -frameHeight * aspect;
    this.camera.right = frameHeight * aspect;
    this.camera.bottom = -frameHeight - offset;
    this.camera.top = frameHeight - offset;
    this.camera.updateProjectionMatrix();
    this.renderer.getSize(this.renderSize);
    if (this.renderSize.x !== width || this.renderSize.y !== height) {
      this.renderer.setSize(width, height, false);
      // Resizing clears the WebGL buffer. Redraw before this resize observation is painted.
      cancelAnimationFrame(this.drawFrame);
      this.draw();
    } else this.invalidate();
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
      dataset.attempt = String(this.pendingFrame.attemptNumber);
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
    positionEquipmentLabels(this.host, this.profile.scene, this.labels, this.camera, this.projected,
      !this.inspection && this.view === 'machine');
  };

  dispose() {
    cancelAnimationFrame(this.drawFrame);
    this.reducedMotion.removeEventListener('change', this.motionChanged);
    this.environment.dispose();
    this.scene.traverse(object => { if (object instanceof T.DirectionalLight) object.shadow.dispose(); });
    this.observer.disconnect();
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.pointerDown);
    canvas.removeEventListener('pointermove', this.pointerMove);
    canvas.removeEventListener('pointerup', this.pointerUp);
    canvas.removeEventListener('pointercancel', this.pointerCancel);
    for (const assembly of Object.values(this.assemblies)) assembly.disposeHighlight();
    const geometries = new Set<T.BufferGeometry>();
    const materials = new Set<T.Material>();
    this.scene.traverse(object => {
      if ('geometry' in object && object.geometry instanceof T.BufferGeometry) geometries.add(object.geometry);
      if ('material' in object && object.material instanceof T.Material) materials.add(object.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.haloMap.dispose();
    this.transportLabel.material.map?.dispose();
    for (const label of this.rowLabels) label.material.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
