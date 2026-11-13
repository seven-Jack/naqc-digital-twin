import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SITE_COUNT, type Model } from '../physics/model';
import { um } from '../physics/units';
import { axisLabel, beamGeometry, beamMaterial, disposeGroup, glowTexture, makePlatform, sceneColors, sitePositions } from './arrayGeometry';
import { potentialSurface, type PotentialView } from './potentialSurface';

export type SceneView = 'array' | 'focus' | 'potential';
export type Quality = 'Low' | 'Medium' | 'High';
export interface SceneOptions {
  view: SceneView;
  potential: PotentialView;
  quality: Quality;
  tweezers: boolean;
  clock: boolean;
  glow: boolean;
}

const ground = new T.Color(sceneColors.ground);
const excited = new T.Color(sceneColors.excited);
const matrix = new T.Matrix4();
const position = new T.Vector3();

export class InstrumentScene {
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(38, 1, 0.1, 300);
  private renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  private controls: OrbitControls;
  private array = new T.Group();
  private platform = makePlatform();
  private beams: T.InstancedMesh<T.LatheGeometry, T.ShaderMaterial> | undefined;
  private waists = new T.InstancedMesh(new T.TorusGeometry(1, 0.024, 6, 48).rotateX(Math.PI / 2),
    new T.MeshBasicMaterial({ color: '#69f5bf', transparent: true, opacity: 0.39 }), SITE_COUNT);
  private atoms = new T.InstancedMesh(new T.SphereGeometry(0.275, 24, 16),
    new T.MeshStandardMaterial({ color: 'white', emissive: '#174765', roughness: 0.22, metalness: 0.2 }), SITE_COUNT);
  private halos = new T.InstancedMesh(new T.PlaneGeometry(2.65, 2.65),
    new T.MeshBasicMaterial({
      map: glowTexture(), transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending,
    }), SITE_COUNT);
  private ring = new T.Group();
  private guide = new T.Group();
  private clockSheet: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
  private clockAxis: T.Line;
  private clockArrow: T.ArrowHelper;
  private surface: ReturnType<typeof potentialSurface> | undefined;
  private surfaceKey = '';
  private resize: ResizeObserver;
  private selected = 12;
  private hovered: number | undefined;
  private drawFrame = 0;
  private pointerDown = new T.Vector2();
  private raycaster = new T.Raycaster();
  private options: SceneOptions | undefined;
  private model: Model | undefined;
  private previousPopulation = -1;
  private clockActive = false;

  constructor(private host: HTMLDivElement, private onSelect: (site: number) => void, private onHover: (site?: number) => void) {
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', '可交互的三维光镊场景');
    canvas.setAttribute('data-testid', 'scene-canvas');
    this.renderer.setClearColor('#08101b', 0);
    host.appendChild(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.13;
    this.controls.maxPolarAngle = Math.PI * 0.89;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 165;
    this.controls.addEventListener('change', this.invalidate);

    const key = new T.DirectionalLight('#dcfaff', 3.0);
    key.position.set(-8, 18, 15);
    const fill = new T.DirectionalLight('#52c9ff', 1.1);
    fill.position.set(10, 2, -10);
    this.scene.add(new T.HemisphereLight('#a6dcee', '#253353', 1.25), key, fill, this.array);
    this.array.add(this.platform, this.waists, this.atoms, this.halos, this.ring, this.guide);
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 3;
    for (let index = 0; index < SITE_COUNT; index++) {
      this.atoms.setMatrixAt(index, matrix.makeTranslation(sitePositions[index]));
      this.halos.setColorAt(index, ground);
    }
    this.atoms.instanceMatrix.needsUpdate = true;
    const ringMesh = new T.Mesh(new T.RingGeometry(0.82, 0.89, 64).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: '#8bf3ff', side: T.DoubleSide, transparent: true, opacity: 0.88, depthWrite: false }));
    const outer = new T.Mesh(new T.RingGeometry(1.15, 1.17, 64).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: '#8bf3ff', side: T.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false }));
    this.ring.add(ringMesh, outer);
    this.guide.add(new T.ArrowHelper(new T.Vector3(0, 1, 0), new T.Vector3(0, 1.45, 0), 5.6, '#66eac4', 0.62, 0.43),
      axisLabel('+z', '#71e7ca', new T.Vector3(0, 7.7, 0), 2.5));

    this.clockAxis = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(-19, 0, 0), new T.Vector3(19, 0, 0)]),
      new T.LineBasicMaterial({ color: '#fbd383', transparent: true, opacity: 0.33, depthWrite: false }));
    this.clockArrow = new T.ArrowHelper(new T.Vector3(1, 0, 0), new T.Vector3(14, 0, 0), 5, '#fbd383', 0.85, 0.56);
    this.clockSheet = new T.Mesh(new T.PlaneGeometry(41, 28), new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
      uniforms: { strength: { value: 0.10 } },
      vertexShader: `
        varying vec2 st;
        void main() { st = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        uniform float strength;
        varying vec2 st;
        void main() {
          float envelope = smoothstep(0.0,0.12,st.x)*(1.0-smoothstep(0.83,1.0,st.x));
          float transverse = exp(-19.0*pow(st.y-0.5,2.0));
          float edges = smoothstep(0.0,0.18,st.y)*(1.0-smoothstep(0.82,1.0,st.y));
          gl_FragColor = vec4(1.0,0.61,0.19,envelope*transverse*edges*strength);
        }
      `,
    }));
    this.clockSheet.rotation.x = -Math.PI / 2;
    this.array.add(this.clockSheet, this.clockAxis, this.clockArrow);
    const labels = new T.Group();
    labels.add(axisLabel('+x', '#82aabc', new T.Vector3(17.25, -1.8, 14.7), 3.3));
    labels.add(axisLabel('+y', '#82aabc', new T.Vector3(13.8, -1.8, -17.3), 3.3));
    this.platform.add(labels);
    this.resize = new ResizeObserver(this.resizeCanvas);
    this.resize.observe(host);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  private resizeCanvas = () => {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    this.camera.aspect = width / height;
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
    if (this.halos.visible && this.array.visible) {
      const scale = new T.Vector3(1, 1, 1);
      for (let i = 0; i < SITE_COUNT; i++) {
        this.halos.setMatrixAt(i, matrix.compose(sitePositions[i], this.camera.quaternion, scale));
      }
      this.halos.instanceMatrix.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  };

  update(model: Model, options: SceneOptions) {
    const previous = this.model;
    const oldOptions = this.options;
    this.model = model;
    this.options = options;
    this.selected = model.parameters.site;
    this.array.visible = options.view !== 'potential';
    this.platform.visible = this.array.visible;
    this.waists.visible = options.tweezers;
    this.halos.visible = options.glow;
    this.clockSheet.visible = options.clock && options.glow && model.parameters.laserEnabled;
    this.clockAxis.visible = this.clockArrow.visible = options.clock && model.parameters.laserEnabled;
    this.guide.visible = options.tweezers;
    this.ring.position.copy(sitePositions[this.selected]);
    this.guide.position.copy(sitePositions[this.selected]);
    this.clockAxis.position.z = this.clockArrow.position.z = sitePositions[this.selected].z;
    if (oldOptions?.quality !== options.quality) {
      const cap = { Low: 1, Medium: 1.5, High: 2 }[options.quality];
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
      this.resizeCanvas();
    }
    if (!this.beams || previous?.beam.waistM !== model.beam.waistM) {
      if (this.beams) {
        this.array.remove(this.beams);
        disposeGroup(this.beams);
        this.beams.dispose();
      }
      this.beams = new T.InstancedMesh(beamGeometry(model.beam), beamMaterial(), SITE_COUNT);
      const waist = model.beam.waistM / um(1);
      for (let i = 0; i < SITE_COUNT; i++) {
        this.beams.setMatrixAt(i, matrix.makeTranslation(sitePositions[i]));
        matrix.makeScale(waist, 1, waist).setPosition(sitePositions[i]);
        this.waists.setMatrixAt(i, matrix);
      }
      this.beams.instanceMatrix.needsUpdate = true;
      this.waists.instanceMatrix.needsUpdate = true;
      this.waists.computeBoundingSphere();
      this.array.add(this.beams);
    }
    this.beams.visible = options.tweezers;
    this.beams.material.uniforms.intensity.value = Math.min(1.45, 0.34 + 0.5 * Math.log1p(model.centerIntensityWm2 / 2e8));
    this.beams.material.uniforms.rayleigh.value = model.rayleighM / um(1);
    const surfaceKey = [options.potential, model.beam.powerW, model.beam.waistM].join(':');
    if (options.view === 'potential' && this.surfaceKey !== surfaceKey) {
      this.surfaceKey = surfaceKey;
      if (this.surface) {
        this.scene.remove(this.surface.root);
        disposeGroup(this.surface.root);
      }
      this.surface = potentialSurface(model, options.potential);
      this.scene.add(this.surface.root);
      if (oldOptions?.view === 'potential') this.resetCamera();
    }
    if (this.surface) this.surface.root.visible = options.view === 'potential';
    if (options.view !== oldOptions?.view || (options.view === 'focus' && model.parameters.site !== previous?.parameters.site)) {
      this.resetCamera();
    }
    this.paintAtoms(this.previousPopulation < 0 ? 0 : this.previousPopulation);
    this.host.dataset.waistUm = model.parameters.waistUm.toString();
    this.host.dataset.intensity = model.centerIntensityWm2.toString();
    this.host.dataset.groundHz = model.groundHz.toString();
    this.host.dataset.excitedHz = model.excitedHz.toString();
    this.invalidate();
  }

  setEvolution(population: number, active: boolean) {
    if (population !== this.previousPopulation) this.paintAtoms(population);
    if (active !== this.clockActive) {
      this.clockActive = active;
      this.clockSheet.material.uniforms.strength.value = active ? 0.36 : 0.10;
      (this.clockAxis.material as T.LineBasicMaterial).opacity = active ? 0.8 : 0.33;
      this.invalidate();
    }
  }

  private paintAtoms(population: number) {
    this.previousPopulation = population;
    const color = ground.clone().lerp(excited, population);
    for (let i = 0; i < SITE_COUNT; i++) {
      const emphasis = i === this.selected || i === this.hovered ? 1 : 0.69;
      this.atoms.setColorAt(i, color.clone().multiplyScalar(emphasis));
      this.halos.setColorAt(i, color.clone().multiplyScalar(emphasis * 0.8));
    }
    if (this.atoms.instanceColor) this.atoms.instanceColor.needsUpdate = true;
    if (this.halos.instanceColor) this.halos.instanceColor.needsUpdate = true;
    this.invalidate();
  }

  resetCamera = () => {
    // Flush any residual orbit inertia before applying the canonical camera pose.
    this.controls.enableDamping = false;
    this.controls.update();
    const narrow = this.host.clientWidth < 560 ? 1.17 : 1;
    if (this.options?.view === 'focus') {
      position.copy(sitePositions[this.selected]);
      this.controls.target.copy(position).add(new T.Vector3(0, 1.2, 0));
      this.camera.position.copy(position).add(new T.Vector3(6.6, 5.4, 9.8).multiplyScalar(narrow));
    } else if (this.options?.view === 'potential') {
      const { minHeight = 0, maxHeight = 0 } = this.surface ?? {};
      this.controls.target.set(0, (minHeight + maxHeight) * 0.45, 0);
      const distance = Math.max(1, (maxHeight - minHeight) / 17);
      this.camera.position.copy(this.controls.target).add(new T.Vector3(12, 8.5, 20).multiplyScalar(distance * narrow));
    } else {
      this.controls.target.set(0, 1.55, 0);
      this.camera.position.set(29, 27, 41).multiplyScalar(narrow);
    }
    this.controls.update();
    this.controls.enableDamping = true;
    this.camera.updateMatrixWorld();
    this.invalidate();
  };

  private pick(event: PointerEvent) {
    if (!this.array.visible) return undefined;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2), this.camera);
    return this.raycaster.intersectObject(this.atoms)[0]?.instanceId;
  }
  private onPointerDown = (event: PointerEvent) => this.pointerDown.set(event.clientX, event.clientY);
  private onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0 || this.pointerDown.distanceTo(new T.Vector2(event.clientX, event.clientY)) > 4) return;
    const site = this.pick(event);
    if (site !== undefined) this.onSelect(site);
  };
  private onPointerMove = (event: PointerEvent) => {
    if (event.buttons) return;
    const site = this.pick(event);
    if (site === this.hovered) return;
    this.hovered = site;
    this.onHover(site);
    this.renderer.domElement.style.cursor = site === undefined ? 'grab' : 'pointer';
    this.paintAtoms(this.previousPopulation);
  };
  private onPointerLeave = () => {
    this.hovered = undefined;
    this.onHover();
    this.paintAtoms(this.previousPopulation);
  };

  dispose() {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    cancelAnimationFrame(this.drawFrame);
    this.resize.disconnect();
    this.controls.dispose();
    disposeGroup(this.scene);
    this.scene.traverse(object => { if (object instanceof T.InstancedMesh) object.dispose(); });
    this.renderer.dispose();
    canvas.remove();
  }
}
