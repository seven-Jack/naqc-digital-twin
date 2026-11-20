import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MachineProfile } from '../data/machineProfile';
import type { MachineSceneProfile } from '../data/machineSceneProfile';
import { glowTexture, gridLines } from './arrayGeometry';
import type { MachineSceneFrame } from './machineSceneFrame';

import { positionEquipmentLabels } from './machineSceneLabels';
import { EquipmentAssembly } from './machineEquipmentAssembly';
import { atomicSource, aodSystem, basic, box, colors, imagingSystem, laserSystem, outline, segment, slmSystem, table, tableY, vacuumChamber, vector } from './machineHardware';
import type { EquipmentId } from '../data/machineEquipment';

export type MachineView = 'machine' | 'array';

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

export class QuantumMachineRenderer {
  private scene = new T.Scene();
  private hardware = new T.Group();
  private array = new EquipmentAssembly('array');
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

  constructor(private host: HTMLDivElement, private profile: MachineProfile,
    private labels: Record<string, HTMLElement | null>, private onPick?: (module: EquipmentId, part?: string) => void) {
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
    this.assemblies = {
      table: table(), source: atomicSource(), vacuum: vacuumChamber(this.haloMap, paths.reservoir.color),
      slm: slmSystem(paths.reservoir.color, paths.science.color), aod: aodSystem(paths.transport.color),
      gate: laserSystem(profile.scene), imaging: imagingSystem(paths.probe.color), array: this.array,
    };
    this.scene.add(this.hardware, ...Object.values(this.assemblies));
    const floor = gridLines(21, 0.75, '#416787', 0.23);
    floor.position.y = tableY - 0.83;
    const floorGlow = new T.Sprite(new T.SpriteMaterial({
      map: this.haloMap, color: '#294266', transparent: true, opacity: 0.23, blending: T.AdditiveBlending, depthWrite: false,
    }));
    floorGlow.position.set(0, -1.85, -4);
    floorGlow.scale.set(30, 13.0, 1);
    this.hardware.add(floorGlow, floor);
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

    const plane = this.array.part('plane', [0, -0.85, 0]);
    const sites = this.array.part('sites', [0, 0, 0]);
    const atomLayer = this.array.part('atoms', [0, 0.85, 0]);
    this.gridGlow = new T.Mesh(new T.PlaneGeometry((columns + 2) * pitch, (rows + 2) * pitch).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: '#238b80', map: this.haloMap, transparent: true, opacity: 0.20, blending: T.AdditiveBlending, depthWrite: false }));
    this.gridGlow.position.y = arrayY - 0.08;
    this.gridGlow.userData.ignorePick = true;
    plane.add(this.gridGlow);
    const arrayWidth = columns * pitch;
    const arrayDepth = rows * pitch;
    const boundary = box(arrayWidth + 0.12, 0.018, arrayDepth + 0.12, basic('#132e38', 0.45), 0, arrayY - 0.13, 0);
    plane.add(outline(boundary, '#388981', 0.42));
    const gridPoints: number[] = [];
    for (let column = 0; column <= columns; column++) {
      const x = column * pitch - arrayWidth / 2;
      gridPoints.push(x, arrayY - 0.116, -arrayDepth / 2, x, arrayY - 0.116, arrayDepth / 2);
    }
    for (let row = 0; row <= rows; row++) {
      const z = row * pitch - arrayDepth / 2;
      gridPoints.push(-arrayWidth / 2, arrayY - 0.116, z, arrayWidth / 2, arrayY - 0.116, z);
    }
    plane.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(gridPoints, 3)),
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
    else this.camera.position.set(0.83, 11, 7.7);
    this.controls.update();
    this.resize();
  }

  private setVisibleModules() {
    this.hardware.visible = !this.inspection && this.view === 'machine';
    for (const assembly of Object.values(this.assemblies)) {
      assembly.visible = this.inspection ? assembly === this.inspection : this.view === 'machine' || assembly === this.array;
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
      }
      this.selectedPart = null;
      this.inspection = next;
      this.setVisibleModules();
      // Consume orbit inertia before installing either camera pose.
      this.controls.enableDamping = false;
      this.controls.update();
      this.controls.enableDamping = true;
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
    this.invalidate();
  }

  private focusAssembly(assembly: EquipmentAssembly) {
    const bounds = assembly.inspectionBounds();
    bounds.getCenter(this.controls.target);
    // The chamber pump port faces the rear; look toward that side to expose the flange.
    const direction = assembly.equipmentId === 'vacuum' ? vector(11, 5.5, -8) : vector(-6.2, 6.4, 12);
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
    const frameHeight = this.inspection ? 0.56 * Math.max(this.inspectionSize.y, this.inspectionSize.x / aspect)
      : this.view === 'machine' ? Math.max(5.5, 10.7 / aspect) : Math.max(2.68, 3.2 / aspect);
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
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
