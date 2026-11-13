import * as T from 'three';
import { ARRAY_SIDE, PITCH_UM, SITE_COUNT, siteLocation, type Model } from '../physics/model';
import { beamRadius } from '../physics/gaussianBeam';
import { um } from '../physics/units';

export const sceneColors = { ground: '#6eeaff', excited: '#bda0ff', trap: '#49f0b7', clock: '#fbd383' };
export const sitePositions = Array.from({ length: SITE_COUNT }, (_, i) => {
  const { xUm, yUm } = siteLocation(i);
  return new T.Vector3(xUm, 0, -yUm);
});

export function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.14, 'rgba(255,255,255,0.62)');
  gradient.addColorStop(0.38, 'rgba(255,255,255,0.14)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(canvas);
}

export function gridLines(extent: number, spacing: number, color: string, opacity: number) {
  const points: number[] = [];
  for (let x = -extent; x <= extent + 1e-6; x += spacing) {
    points.push(x, 0, -extent, x, 0, extent, -extent, 0, x, extent, 0, x);
  }
  const geometry = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(points, 3));
  return new T.LineSegments(geometry, new T.LineBasicMaterial({ color, transparent: true, opacity }));
}

export function makePlatform() {
  const platform = new T.Group();
  const width = PITCH_UM * (ARRAY_SIDE - 1) + 8;
  const slab = new T.Mesh(
    new T.BoxGeometry(width, 0.6, width),
    new T.MeshStandardMaterial({ color: '#0b2232', roughness: 0.55, metalness: 0.5 }),
  );
  slab.position.y = -2.25;
  platform.add(slab);
  const edge = new T.LineSegments(new T.EdgesGeometry(slab.geometry), new T.LineBasicMaterial({
    color: '#357b8a', transparent: true, opacity: 0.55,
  }));
  edge.position.copy(slab.position);
  platform.add(edge);
  const grid = gridLines(width / 2, 1, '#365b70', 0.27);
  grid.position.y = -1.94;
  platform.add(grid);
  const scale = new T.Group();
  const scaleX = width / 2 - 2;
  const scaleZ = width / 2 - 0.3;
  scale.add(new T.LineSegments(
    new T.BufferGeometry().setFromPoints([
      new T.Vector3(scaleX - PITCH_UM, -1.92, scaleZ), new T.Vector3(scaleX, -1.92, scaleZ),
      new T.Vector3(scaleX - PITCH_UM, -1.92, scaleZ - 0.45), new T.Vector3(scaleX - PITCH_UM, -1.92, scaleZ + 0.35),
      new T.Vector3(scaleX, -1.92, scaleZ - 0.45), new T.Vector3(scaleX, -1.92, scaleZ + 0.35),
    ]), new T.LineBasicMaterial({ color: '#72b2c2' }),
  ));
  scale.add(axisLabel('6 µm', '#93c4d1', new T.Vector3(scaleX - PITCH_UM / 2, -1.75, scaleZ + 0.6), 3.4));
  platform.add(scale);
  const glow = new T.Mesh(new T.PlaneGeometry(67, 67), new T.MeshBasicMaterial({
    color: '#06334b', map: glowTexture(), transparent: true, opacity: 0.42, depthWrite: false, blending: T.AdditiveBlending,
  }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -2.67;
  platform.add(glow);
  return platform;
}

export function beamGeometry(beam: Model['beam']) {
  const profile = Array.from({ length: 41 }, (_, i) => {
    const z = -3 + i / 40 * 15;
    return new T.Vector2(beamRadius(beam, um(z)) / um(1), z);
  });
  return new T.LatheGeometry(profile, 24);
}

export function beamMaterial() {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    uniforms: { intensity: { value: 0.8 }, rayleigh: { value: 5.9 } },
    vertexShader: `
      varying vec3 viewNormal;
      varying vec3 viewPosition;
      varying float axial;
      void main() {
        axial = position.y;
        vec4 view = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        viewNormal = normalize(normalMatrix * normal);
        viewPosition = -view.xyz;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      uniform float intensity;
      uniform float rayleigh;
      varying vec3 viewNormal;
      varying vec3 viewPosition;
      varying float axial;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(viewPosition), normalize(viewNormal))), 2.2);
        float falloff = 1.0 / (1.0 + pow(axial/rayleigh, 2.0));
        float fade = smoothstep(-3.0, -0.3, axial) * (1.0-smoothstep(4.5,12.0,axial));
        gl_FragColor = vec4(0.20, 0.92, 0.69, (0.022 + 0.115 * rim) * fade * pow(falloff, 0.48) * intensity);
      }
    `,
  });
}

export function axisLabel(text: string, color: string, position: T.Vector3, width = 6) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = '600 50px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(canvas), depthTest: false }));
  sprite.position.copy(position);
  sprite.scale.set(width, width / 4, 1);
  sprite.renderOrder = 5;
  return sprite;
}

export function disposeGroup(root: T.Object3D) {
  root.traverse(object => {
    if ('geometry' in object && object.geometry instanceof T.BufferGeometry) object.geometry.dispose();
    if (!('material' in object) || !(object.material instanceof T.Material)) return;
    if ('map' in object.material && object.material.map instanceof T.Texture) object.material.map.dispose();
    object.material.dispose();
  });
}
