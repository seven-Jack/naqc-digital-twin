import { useEffect, useRef, useState, type CSSProperties } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SENOO_APPARATUS_PROFILE } from '../data/senooApparatus';
import { disposeGroup, glowTexture, gridLines } from './arrayGeometry';
import './senoo-optical-scene.css';

const channelColors = {
  tweezer: '#77efbc', loading: '#b5e986', cooling: '#f1d889', clock: '#f69a76',
  raman: '#c5a6fa', rydberg: '#ffa99f', fluorescence: '#78aaff', camera: '#7ce4ed',
} as const satisfies Record<keyof typeof SENOO_APPARATUS_PROFILE.channels, string>;
type ChannelId = keyof typeof channelColors;
const channels = (Object.keys(channelColors) as ChannelId[]).map(id => ({
  id,
  name: SENOO_APPARATUS_PROFILE.channels[id].label,
  color: channelColors[id],
  style: { '--so-channel-color': channelColors[id] } as CSSProperties,
}));
type Channel = typeof channels[number];
const singleSiteChannels = channels.filter(channel => channel.id !== 'rydberg');
type SingleSiteState = 'm0' | 'm1' | 'g0' | 'empty' | 'removed' | 'unknown';
const pairColors = {
  'rydberg-pair': '#ffa99f', 'metastable-pair': '#a8bdd8', 'metastable-odd-pair': '#82e5d1',
  'metastable-even-pair': '#c8aaff', 'clock-pair': '#ffcc92',
};
type PairState = keyof typeof pairColors;
export type SenooSceneState = SingleSiteState | PairState;

interface Props {
  readonly activeChannels: readonly string[];
  readonly state: SenooSceneState;
  readonly stateLabel: string;
  readonly channelCaption?: string;
}

function isPairState(state: SenooSceneState): state is PairState {
  return Object.hasOwn(pairColors, state);
}

const stateColors: Partial<Record<SingleSiteState, string>> = { m0: '#82e5d1', m1: '#c8aaff', g0: '#ffcc92' };
const point = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
const focus = point(0, 0.35, 0);
const cameraTarget = point(0, 0.23, 0);
const overview = point(6.2, 4.5, 8.0);

// Assembly coordinates are local, schematic Three.js units.
const endpoints: Record<ChannelId, readonly T.Vector3[]> = {
  tweezer: [point(0, -1.05, 0)],
  loading: [point(-2.72, 0.35, 1.75)],
  cooling: [point(2.56, 0.35, 1.80)],
  clock: [point(0.75, 0.35, -2.20)],
  raman: [point(-1.75, 0.35, -2.14)],
  rydberg: [point(2.24, 0.35, 1.18)],
  fluorescence: [point(-3.84, 0.35, 0), point(3.84, 0.35, 0)],
  camera: [point(0, 2.42, 0)],
};

function bodyMaterial(color: string) {
  return new T.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.46 });
}

function outline(geometry: T.BufferGeometry, color = '#506b82', opacity = 0.5) {
  return new T.LineSegments(new T.EdgesGeometry(geometry), new T.LineBasicMaterial({ color, transparent: true, opacity }));
}

function slab() {
  const group = new T.Group();
  const geometry = new T.BoxGeometry(9.25, 0.26, 5.48);
  const base = new T.Mesh(geometry, bodyMaterial('#26394c'));
  base.add(outline(geometry));
  base.position.y = -1.4;
  group.add(base);
  const grid = gridLines(2.5, 0.5, '#39576d', 0.39);
  grid.scale.x = 1.8;
  grid.position.y = -1.263;
  group.add(grid);
  return group;
}

function opticalHead(endpoint: T.Vector3, channel: Channel) {
  const head = new T.Group();
  head.quaternion.setFromUnitVectors(point(0, 1, 0), focus.clone().sub(endpoint).normalize());
  head.position.copy(endpoint);

  const radius = channel.id === 'camera' ? 0.33 : channel.id === 'tweezer' ? 0.43 : 0.21;
  const barrel = new T.CylinderGeometry(radius, radius, 0.46, 20);
  const housing = new T.Mesh(barrel, bodyMaterial('#293f57'));
  housing.position.y = -0.225;
  housing.add(outline(barrel, '#69849c', 0.31));
  const lip = new T.Mesh(new T.CylinderGeometry(radius * 1.12, radius * 1.12, 0.1, 24), bodyMaterial('#405a6e'));
  const glassMaterial = new T.MeshBasicMaterial({ color: channel.color, transparent: true, opacity: 0.26 });
  const glass = new T.Mesh(new T.CylinderGeometry(radius * 0.71, radius * 0.71, 0.016, 24), glassMaterial);
  glass.position.y = 0.055;
  head.add(housing, lip, glass);
  if (channel.id === 'camera') {
    const enclosure = new T.BoxGeometry(0.73, 0.36, 0.65);
    const detector = new T.Mesh(enclosure, bodyMaterial('#354c5e'));
    detector.position.y = -0.55;
    detector.add(outline(enclosure, '#697e95'));
    head.add(detector);
  }
  return { head, glassMaterial };
}

function channelGeometry(channel: Channel, pair: boolean) {
  const assembly = new T.Group();
  const lineMaterial = new T.LineBasicMaterial({ color: channel.color, transparent: true, opacity: 0.1, depthWrite: false });
  const beamMaterial = new T.MeshBasicMaterial({
    color: channel.color, transparent: true, opacity: 0.25, blending: T.AdditiveBlending, depthWrite: false,
  });
  const beamGroup = new T.Group();
  const lenses = endpoints[channel.id].map(endpoint => {
    const { head, glassMaterial } = opticalHead(endpoint, channel);
    assembly.add(head, new T.Line(new T.BufferGeometry().setFromPoints([endpoint, focus]), lineMaterial));

    const direction = endpoint.clone().sub(focus);
    const radius = channel.id === 'tweezer' || channel.id === 'camera' ? 0.25 : 0.105;
    // Widen the schematic field at the pair instead of assigning a beam to either outcome.
    const sharedDrive = pair && (channel.id === 'rydberg' || channel.id === 'raman' || channel.id === 'clock');
    const beam = new T.Mesh(new T.CylinderGeometry(radius, sharedDrive ? 0.69 : 0.035,
      direction.length(), 20, 1, true), beamMaterial);
    beam.position.copy(focus).lerp(endpoint, 0.5);
    beam.quaternion.setFromUnitVectors(point(0, 1, 0), direction.normalize());
    beamGroup.add(beam);
    return glassMaterial;
  });
  assembly.add(beamGroup);
  return {
    assembly,
    setActive(active: boolean) {
      beamGroup.visible = active;
      lineMaterial.opacity = active ? 0.88 : 0.11;
      lenses.forEach(material => { material.opacity = active ? 0.83 : 0.22; });
    },
  };
}

function createSite(position: T.Vector3) {
  const ring = new T.Mesh(new T.TorusGeometry(0.23, 0.011, 12, 40), new T.MeshBasicMaterial({ color: '#7bb6ac' }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(position);
  ring.position.y -= 0.095;
  const atom = new T.Mesh(new T.SphereGeometry(0.127, 24, 16), new T.MeshStandardMaterial({ emissiveIntensity: 1.85 }));
  atom.position.copy(position);
  const halo = new T.Sprite(new T.SpriteMaterial({
    map: glowTexture(), transparent: true, opacity: 0.88, depthWrite: false, blending: T.AdditiveBlending,
  }));
  halo.scale.set(0.92, 0.92, 1);
  halo.position.copy(position);
  return { ring, atom, halo };
}

function createOpticalScene(host: HTMLDivElement, pair: boolean, fallback: () => void) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new T.Scene();
  scene.add(slab());
  scene.add(new T.HemisphereLight('#b8d7ef', '#3b4157', 2.05));
  const lamp = new T.DirectionalLight('#d6e9ff', 2.4);
  lamp.position.set(1, 6, 4);
  scene.add(lamp);

  const optics = (pair ? channels : singleSiteChannels).map(channel => {
    const model = channelGeometry(channel, pair);
    scene.add(model.assembly);
    return { id: channel.id, ...model };
  });
  const positions = pair ? [point(-0.58, focus.y, 0), point(0.58, focus.y, 0)] : [focus];
  const sites = positions.map(position => createSite(position));
  if (pair) {
    const link = new T.Line(new T.BufferGeometry().setFromPoints(sites.map(site => site.ring.position)),
      new T.LineBasicMaterial({ color: '#779eab', transparent: true, opacity: 0.61 }));
    scene.add(link);
  }
  for (const { ring, atom, halo } of sites) scene.add(ring, atom, halo);

  const camera = new T.OrthographicCamera();
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enablePan = false;
  orbit.enableZoom = false;
  renderer.domElement.style.touchAction = 'pan-y';
  orbit.minPolarAngle = 0.22;
  orbit.maxPolarAngle = Math.PI / 2 - 0.1;
  const render = () => renderer.render(scene, camera);
  function resetView() {
    camera.position.copy(overview);
    orbit.target.copy(cameraTarget);
    orbit.update();
    render();
  }
  resetView();
  orbit.addEventListener('change', render);
  function resize() {
    const { clientWidth: width, clientHeight: height } = host;
    if (!width || !height) return;
    const aspect = width / height;
    const viewHeight = Math.max(6.35, 11.20 / aspect);
    camera.top = viewHeight / 2;
    camera.bottom = -camera.top;
    camera.right = camera.top * aspect;
    camera.left = -camera.right;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    render();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  renderer.domElement.addEventListener('webglcontextlost', fallback);

  return {
    resetView,
    update(activeChannels: readonly string[], state: SenooSceneState) {
      for (const { id, setActive } of optics) setActive(activeChannels.includes(id));
      const color = isPairState(state) ? pairColors[state] : stateColors[state];
      for (const { atom, halo } of sites) {
        atom.visible = halo.visible = color !== undefined;
        if (color) {
          atom.material.color.set(color);
          atom.material.emissive.set(color);
          halo.material.color.set(color);
        }
      }
      render();
    },
    dispose() {
      observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', fallback);
      orbit.dispose();
      disposeGroup(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

function OpticalFallback({ activeChannels, state }: Pick<Props, 'activeChannels' | 'state'>) {
  const pair = isPairState(state);
  return <div className="so-fallback" aria-hidden="true">
    {(pair ? channels : singleSiteChannels).map(({ id, style }) => <span key={id} className="so-plan-beam" data-channel={id}
      data-active={activeChannels.includes(id)} style={style} />)}
    {pair ? <span className="so-plan-pair" style={{ '--so-atom': pairColors[state] } as CSSProperties}>
      <span className="so-plan-site" data-site="1" /><span className="so-plan-site" data-site="2" />
    </span> : <span className="so-plan-site" data-state={state} />}
  </div>;
}

export function SenooOpticalScene({ activeChannels, state, stateLabel, channelCaption }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createOpticalScene> | null>(null);
  const [fallback, setFallback] = useState(false);
  const pair = isPairState(state);
  useEffect(() => {
    if (fallback) return;
    try {
      scene.current = createOpticalScene(host.current!, pair, () => setFallback(true));
    } catch {
      setFallback(true);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [fallback, pair]);
  useEffect(() => scene.current?.update(activeChannels, state), [activeChannels, state]);

  return <figure className="so-scene" data-testid="senoo-optical-scene" data-state={state} data-site-count={pair ? 2 : 1}
    data-active-channels={activeChannels.join(' ')} data-mode={fallback ? 'schematic' : 'webgl'}>
    <div className="so-viewport">
      <div className="so-canvas" ref={host} />
      {fallback && <OpticalFallback activeChannels={activeChannels} state={state} />}
      <div className="so-state"><span>{pair ? '双原子子空间示意' : '位点示意'}</span>
        <strong data-testid="senoo-optical-state">{stateLabel}</strong></div>
      {!fallback && <button className="so-reset" type="button" onClick={() => scene.current?.resetView()}>重置视角</button>}
    </div>
    <figcaption>
      <ul className="so-channels" aria-label="当前光路">
        {(pair ? channels : singleSiteChannels).map(({ id, name, style }) => <li key={id} data-channel={id}
          data-active={activeChannels.includes(id)} style={style}>
          <i aria-hidden="true" />{name}<span className="sr-only">
            {activeChannels.includes(id) ? (pair ? '，本步骤使用' : '，启用') : '，未启用'}
          </span>
        </li>)}
      </ul>
      <p>{fallback ? '二维光路示意' : '三维光路示意'} · {pair
        ? '两个位点 · 非等比例。高亮显示本步骤所用光路。'
        : `单个位点 · 非等比例。${channelCaption ?? '399 nm 两束光交替照射。'}`}</p>
    </figcaption>
  </figure>;
}
