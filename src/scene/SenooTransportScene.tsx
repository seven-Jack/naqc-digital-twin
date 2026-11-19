import { useEffect, useMemo, useRef, useState } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SenooTransportSite } from '../physics/senooTransportRun';
import type { SenooTransportFrame } from '../physics/senooTransportReplay';
import { disposeGroup, gridLines } from './arrayGeometry';
import './senoo-transport-scene.css';

type Position = SenooTransportSite['positionM'];
type SiteState = SenooTransportFrame['sites'][number]['state'];
type Move = SenooTransportFrame['moves'][number];
type Props = {
  readonly sites: readonly SenooTransportSite[];
  readonly frame: SenooTransportFrame;
};

const colors = { occupied: '#74f2c3', empty: '#839fb3', unknown: '#f3cc86', target: '#9ebeff', tracked: '#65d9f4', commanded: '#a991ef' };
const siteLabels: Record<SiteState, string> = { occupied: '占据', empty: '空位', unknown: '未知' };

function transportLayout(sites: Props['sites']) {
  const limits = new T.Box3();
  for (const site of sites) limits.expandByPoint(new T.Vector3(...site.positionM));
  const center = limits.isEmpty() ? new T.Vector3() : limits.min.clone().multiplyScalar(0.5).addScaledVector(limits.max, 0.5);
  const span = limits.isEmpty() ? 0 : Math.max(
    limits.max.x - center.x, limits.max.y - center.y, limits.max.z - center.z,
  );
  const scale = span > 0 ? span : 1e-6;
  const size = Math.min(0.084, 0.38 / Math.sqrt(Math.max(1, sites.length)));
  const project = ([x, y, z]: Position) => new T.Vector3(
    (x - center.x) / scale, (z - center.z) / scale, (center.y - y) / scale,
  );
  const floor = limits.isEmpty() ? -0.13 : (limits.min.z - center.z) / scale - 0.13;
  const radius = sites.reduce((largest, site) => Math.max(largest, project(site.positionM).length()), 0);
  return { floor, size, radius, project };
}

type Layout = ReturnType<typeof transportLayout>;

function makeTransportRenderer(host: HTMLDivElement, sites: Props['sites'], layout: Layout, fallback: () => void) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.style.touchAction = 'pan-y';
  host.append(renderer.domElement);

  const scene = new T.Scene();
  const grid = gridLines(1.25, 0.25, '#7899ac', 0.22);
  grid.position.y = layout.floor;
  scene.add(grid);
  scene.add(new T.HemisphereLight('#e2f4ff', '#1d4c6a', 2.1));
  const light = new T.DirectionalLight('#b4fdf5', 2.6);
  light.position.set(2, 5, 3);
  scene.add(light);

  const ringMaterials = {
    occupied: new T.MeshBasicMaterial({ color: colors.occupied, side: T.DoubleSide }),
    empty: new T.MeshBasicMaterial({ color: colors.empty, side: T.DoubleSide }),
    unknown: new T.MeshBasicMaterial({ color: colors.unknown, side: T.DoubleSide }),
  };
  const rings = new T.RingGeometry(layout.size * 0.74, layout.size, 24);
  const target = new T.RingGeometry(layout.size * 1.30, layout.size * 1.45, 4);
  const targetMaterial = new T.MeshBasicMaterial({ color: colors.target, side: T.DoubleSide });
  const sphere = new T.SphereGeometry(layout.size * 0.86, 14, 10);
  const atomMaterial = new T.MeshStandardMaterial({ color: colors.occupied, emissive: '#146b50', roughness: 0.35 });
  const trackMaterial = new T.MeshStandardMaterial({ color: colors.tracked, emissive: '#146b73', roughness: 0.35 });
  const siteMeshes = sites.map(site => {
    const fixedMarker = layout.project(site.positionM);
    const ring = new T.Mesh(rings, ringMaterials.unknown);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(fixedMarker);
    const atom = new T.Mesh(sphere, atomMaterial);
    atom.position.copy(fixedMarker);
    atom.visible = false;
    scene.add(ring, atom);
    if (site.target) {
      const mark = new T.Mesh(target, targetMaterial);
      mark.rotation.x = -Math.PI / 2;
      mark.position.copy(fixedMarker);
      scene.add(mark);
    }
    return { id: site.id, ring, atom };
  });

  const tracked = new T.LineBasicMaterial({ color: colors.tracked, transparent: true, opacity: 0.83 });
  const commanded = new T.LineDashedMaterial({ color: colors.commanded, transparent: true, opacity: 0.85, dashSize: 0.065, gapSize: 0.037 });
  const moveMeshes = new Map<string, {
    line: T.Line<T.BufferGeometry, T.LineBasicMaterial>;
    atom: T.Mesh;
    path: Move['pathM'];
    kind: Move['pathKind'];
  }>();
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enablePan = false;
  orbit.minZoom = 0.45;
  orbit.maxZoom = 4;
  orbit.minPolarAngle = 0.2;
  orbit.maxPolarAngle = Math.PI / 2 - 0.06;
  const render = () => renderer.render(scene, camera);
  function resetView() {
    camera.position.set(2.8, 3.2, 4.5);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    orbit.target.set(0, 0, 0);
    orbit.update();
    render();
  }
  resetView();
  orbit.addEventListener('change', render);
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = host;
    if (!width || !height) return;
    const aspect = width / height;
    const extent = Math.max(1.35, layout.radius + 0.22);
    const halfHeight = Math.max(extent, extent / aspect);
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  renderer.domElement.addEventListener('webglcontextlost', fallback);

  return {
    resetView,
    update(frame: Props['frame']) {
      const states = new Map(frame.sites.map(site => [site.siteId, site.state]));
      for (const { id, ring, atom } of siteMeshes) {
        const state = states.get(id) ?? 'unknown';
        ring.material = ringMaterials[state];
        atom.visible = state === 'occupied';
      }

      const paths = frame.moves.filter(move => move.pathKind !== null && move.pathM.length > 0);
      const visibleMoveIds = new Set(paths.map(move => move.id));
      for (const [id, view] of moveMeshes) {
        if (visibleMoveIds.has(id)) continue;
        scene.remove(view.line, view.atom);
        view.line.geometry.dispose();
        moveMeshes.delete(id);
      }
      for (const move of paths) {
        let view = moveMeshes.get(move.id);
        if (!view) {
          const line = new T.Line(new T.BufferGeometry(), tracked);
          const atom = new T.Mesh(sphere, trackMaterial);
          scene.add(line, atom);
          view = { line, atom, path: [], kind: null };
          moveMeshes.set(move.id, view);
        }
        if (view.kind !== move.pathKind || view.path !== move.pathM) {
          view.line.geometry.dispose();
          view.line.geometry = new T.BufferGeometry().setFromPoints(move.pathM.map(layout.project));
          view.line.material = move.pathKind === 'commanded' ? commanded : tracked;
          if (move.pathKind === 'commanded') view.line.computeLineDistances();
          view.kind = move.pathKind;
          view.path = move.pathM;
        }
        view.atom.visible = move.positionM !== null && move.pathKind === 'tracked';
        if (view.atom.visible && move.positionM) view.atom.position.copy(layout.project(move.positionM));
      }
      render();
    },
    dispose() {
      observer.disconnect();
      orbit.removeEventListener('change', render);
      orbit.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', fallback);
      for (const marker of siteMeshes) scene.remove(marker.ring, marker.atom);
      for (const { line, atom } of moveMeshes.values()) {
        scene.remove(line, atom);
        line.geometry.dispose();
      }
      for (const child of scene.children.filter(child => child instanceof T.Mesh && child.geometry === target)) scene.remove(child);
      disposeGroup(scene);
      rings.dispose();
      target.dispose();
      sphere.dispose();
      for (const material of [...Object.values(ringMaterials), targetMaterial, atomMaterial, trackMaterial, tracked, commanded]) material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

function TransportPlanView({ sites, frame, layout }: Props & { layout: Layout }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const surface = canvas.current;
    const context = surface?.getContext('2d');
    if (!surface || !context) return;
    function draw() {
      if (!surface || !context) return;
      const { clientWidth: width, clientHeight: height } = surface;
      if (!width || !height) return;
      const resolution = Math.min(window.devicePixelRatio, 2);
      surface.width = Math.round(width * resolution);
      surface.height = Math.round(height * resolution);
      context.setTransform(resolution, 0, 0, resolution, 0, 0);
      const displayScale = Math.min(width, height) * 0.37;
      const screen = (position: Position) => {
        const { x, z } = layout.project(position);
        return [width / 2 + x * displayScale, height / 2 + z * displayScale] as const;
      };
      for (const move of frame.moves) {
        if (!move.pathKind || !move.pathM.length) continue;
        context.beginPath();
        context.moveTo(...screen(move.pathM[0]));
        for (const point of move.pathM.slice(1)) context.lineTo(...screen(point));
        context.strokeStyle = colors[move.pathKind];
        context.lineWidth = 1.7;
        context.setLineDash(move.pathKind === 'commanded' ? [5, 4] : []);
        context.stroke();
      }
      context.setLineDash([]);
      const states = new Map(frame.sites.map(site => [site.siteId, site.state]));
      const dot = Math.max(2.7, displayScale * layout.size * 0.72);
      for (const site of sites) {
        const [x, y] = screen(site.positionM);
        const state = states.get(site.id) ?? 'unknown';
        context.strokeStyle = colors[state];
        context.fillStyle = colors[state];
        context.beginPath();
        context.arc(x, y, dot, 0, Math.PI * 2);
        if (state === 'occupied') context.fill();
        else context.stroke();
        if (site.target) {
          context.strokeStyle = colors.target;
          context.strokeRect(x - dot - 3, y - dot - 3, (dot + 3) * 2, (dot + 3) * 2);
        }
      }
      for (const move of frame.moves) {
        if (move.positionM && move.pathKind === 'tracked') {
          const [x, y] = screen(move.positionM);
          context.fillStyle = colors.tracked;
          context.beginPath();
          context.arc(x, y, dot, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [sites, frame, layout]);
  return <canvas className="sts-plan" ref={canvas} aria-hidden="true" />;
}

export function SenooTransportScene({ sites, frame }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<ReturnType<typeof makeTransportRenderer> | null>(null);
  const [fallback, setFallback] = useState(false);
  const layout = useMemo(() => transportLayout(sites), [sites]);
  useEffect(() => {
    if (fallback || !host.current) return;
    try {
      view.current = makeTransportRenderer(host.current, sites, layout, () => setFallback(true));
    } catch {
      setFallback(true);
    }
    return () => {
      view.current?.dispose();
      view.current = null;
    };
  }, [fallback, layout, sites]);
  useEffect(() => view.current?.update(frame), [fallback, frame, layout, sites]);

  const occupied = frame.sites.filter(site => site.state === 'occupied');
  const activeTracks = frame.moves.filter(move => move.pathKind === 'tracked' && move.positionM !== null);
  return <figure className="sts-scene" aria-label="装载与输运阵列" data-testid="senoo-transport-scene"
    data-mode={fallback ? 'planar' : 'webgl'} data-occupied={occupied.length}
    data-occupied-site-ids={occupied.map(site => site.siteId).join(' ')} data-active-track={activeTracks[0]?.id}
    data-active-tracks={activeTracks.map(move => move.id).join(' ')}>
    <div className="sts-viewport">
      <div className="sts-canvas" ref={host} />
      {fallback && <TransportPlanView sites={sites} frame={frame} layout={layout} />}
      {!fallback && <button className="sts-reset" type="button" onClick={() => view.current?.resetView()}>重置阵列视角</button>}
    </div>
    <figcaption>
      <p>{fallback ? '俯视 · 原始 X/Y 坐标' : '三维 · 原始位点和路径共用比例'} · {occupied.length} 个已确认占位</p>
      <ul className="sts-legend" aria-label="阵列图例">
        <li data-key="occupied">占据</li><li data-key="empty">空位</li><li data-key="unknown">未知</li>
        <li data-key="target">目标位点</li><li data-key="tracked">跟踪路径</li><li data-key="commanded">指令路径</li>
      </ul>
      {frame.moves.some(move => move.pathKind) && <p>指令路径以虚线显示。跟踪标记按记录点插值。</p>}
      <details className="sts-site-summary">
        <summary>位点状态</summary>
        <ul aria-label="当前位点状态">
          {frame.sites.map(site => <li key={site.siteId}><code>{site.siteId}</code> {siteLabels[site.state]}{site.atomId && ` · ${site.atomId}`}</li>)}
        </ul>
        {!!activeTracks.length && <p>正在跟踪 {activeTracks.map(move => move.atomId ?? move.id).join('、')}</p>}
      </details>
    </figcaption>
  </figure>;
}
