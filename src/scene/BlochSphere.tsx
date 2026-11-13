import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Model } from '../physics/model';
import { axisLabel, disposeGroup } from './arrayGeometry';

type Vector = ReturnType<Model['drive']['at']>['bloch'];
const position = (v: Vector) => new T.Vector3(v.x, v.z, -v.y);

export function BlochSphere({ model, vector }: { model: Model; vector: Vector }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{ arrow: T.ArrowHelper; axis: T.ArrowHelper; draw: () => void }>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let renderer: T.WebGLRenderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setFailed(true); return; }
    const node = host.current!;
    node.appendChild(renderer.domElement);
    const camera = new T.PerspectiveCamera(40, 1, 0.1, 30);
    camera.position.set(2.6, 1.5, 3.4);
    const world = new T.Scene();
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 9;
    controls.update();
    const draw = () => renderer.render(world, camera);
    controls.addEventListener('change', draw);
    const sphere = new T.Mesh(new T.SphereGeometry(1, 24, 16), new T.MeshBasicMaterial({
      color: '#48899f', wireframe: true, transparent: true, opacity: 0.18,
    }));
    const arrow = new T.ArrowHelper(new T.Vector3(0, 1, 0), new T.Vector3(), 1, '#58e9ff', 0.15, 0.09);
    const axis = new T.ArrowHelper(new T.Vector3(1, 0, 0), new T.Vector3(), 1.2, '#f4c56a', 0.10, 0.07);
    const axes = new T.LineSegments(new T.BufferGeometry().setFromPoints([
      new T.Vector3(-1.2, 0, 0), new T.Vector3(1.2, 0, 0), new T.Vector3(0, -1.2, 0),
      new T.Vector3(0, 1.2, 0), new T.Vector3(0, 0, -1.2), new T.Vector3(0, 0, 1.2),
    ]), new T.LineBasicMaterial({ color: '#577a8a' }));
    world.add(sphere, axes, arrow, axis,
      axisLabel('|g⟩', '#6eeaff', new T.Vector3(0, 1.25, 0), 1.6),
      axisLabel('|e⟩', '#bda0ff', new T.Vector3(0, -1.25, 0), 1.6),
      axisLabel('x', '#9cb2c5', new T.Vector3(1.32, 0, 0), 1.3),
      axisLabel('y', '#9cb2c5', new T.Vector3(0, 0, -1.32), 1.3));
    live.current = { arrow, axis, draw };
    const resize = new ResizeObserver(() => {
      if (!node.clientHeight) return;
      camera.aspect = node.clientWidth / node.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
      renderer.setSize(node.clientWidth, node.clientHeight, false);
      draw();
    });
    resize.observe(node);
    return () => {
      live.current = null;
      resize.disconnect();
      controls.dispose();
      disposeGroup(world);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    if (!live.current) return;
    const { arrow, axis, draw } = live.current;
    arrow.setDirection(position(vector).normalize());
    const drive = position({ x: model.drive.omega, y: 0, z: model.drive.delta });
    axis.visible = drive.lengthSq() > 0;
    if (axis.visible) axis.setDirection(drive.normalize());
    draw();
  }, [vector, model.drive]);
  return <div className="bloch-view" ref={host} data-testid="bloch-vector" data-vector={JSON.stringify(vector)}>
    {failed && <p>WebGL 2 is unavailable.</p>}
  </div>;
}
