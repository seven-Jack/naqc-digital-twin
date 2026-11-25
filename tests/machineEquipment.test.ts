import { Mesh, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { equipmentIds, machineEquipment } from '../src/data/machineEquipment';
import { munizEvidence, norciaTransport } from '../src/data/hardwareEvidence';
import { interactionPath, MUNIZ_DEMO_SCENE, sceneUnitsPerMetre } from '../src/data/machineSceneProfile';
import { publishedInteractionRow } from '../src/scene/munizInteractionRow';
import { disposeGroup } from '../src/scene/arrayGeometry';
import { aodSystem, atomicSource, imagingSystem, laserSystem, slmSystem, table, vacuumChamber } from '../src/scene/machineHardware';

const { paths } = MUNIZ_DEMO_SCENE;
const factories = {
  table, source: () => atomicSource(MUNIZ_DEMO_SCENE),
  slm: () => slmSystem(MUNIZ_DEMO_SCENE),
  aod: () => aodSystem(paths.transport.color),
  vacuum: () => vacuumChamber(MUNIZ_DEMO_SCENE),
  gate: () => laserSystem(MUNIZ_DEMO_SCENE, 0),
  imaging: () => imagingSystem(MUNIZ_DEMO_SCENE),
};

describe('设备说明与三维装配', () => {
  it('每个场景标签都有设备入口，每个部件在该设备内可唯一定位', () => {
    const ids = new Set<string>(equipmentIds);
    expect(ids.size).toBe(equipmentIds.length);
    for (const { id } of MUNIZ_DEMO_SCENE.labels) expect(ids.has(id)).toBe(true);
    for (const id of equipmentIds) {
      const entry = machineEquipment[id];
      expect(entry.id).toBe(id);
      expect(new Set(entry.parts.map(part => part.id)).size).toBe(entry.parts.length);
    }
  });

  it('两侧物镜共轴夹住焦平面，钟光与紫外光同向、探测光反向穿过同一交互行', () => {
    const { arrayY, arrayPitch, delivery, collection } = MUNIZ_DEMO_SCENE;
    expect(delivery[0]).toBe(collection[0]);
    expect(delivery[1]).toBe(arrayY);
    expect(collection[1]).toBe(arrayY);
    expect(delivery[2]).toBeLessThan(0);
    expect(collection[2]).toBeGreaterThan(0);
    expect(paths.objective.points.at(-1)).toEqual(delivery);
    for (const path of [paths.reservoir, paths.science, paths.transport, paths.raman]) {
      expect(path.points.at(-1)).toEqual(paths.objective.points[0]);
    }
    for (const [channel, direction] of [['clock', 1], ['rydberg', 1], ['probe', -1]] as const) {
      const rowOffset = arrayPitch / 2;
      const points = interactionPath(paths[channel], arrayY, rowOffset).points;
      const [entry, exit] = points.slice(-2);
      expect(entry.slice(1)).toEqual([arrayY - rowOffset, 0]);
      expect(exit.slice(1)).toEqual(entry.slice(1));
      expect(Math.sign(exit[0])).toBe(direction);
      expect(Math.sign(entry[0])).toBe(-direction);
    }
  });

  it('物镜与门光透过光窗，竖直输运轴贯通差分管及科学腔底孔', () => {
    const chamber = vacuumChamber(MUNIZ_DEMO_SCENE);
    const walls = chamber.parts.get('chamber')!.group;
    chamber.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    walls.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
    const y = MUNIZ_DEMO_SCENE.arrayY;
    for (const [origin, direction] of [
      [new Vector3(3, y, 0.07), new Vector3(-1, 0, 0)],
      [new Vector3(0, y, 2), new Vector3(0, 0, -1)],
    ]) {
      const hits = new Raycaster(origin, direction).intersectObjects(meshes, false);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every(({ object }) => object.userData.ignorePick)).toBe(true);
    }
    const source = atomicSource(MUNIZ_DEMO_SCENE);
    const { motY } = MUNIZ_DEMO_SCENE;
    const atomFeed = new Raycaster(new Vector3(0, motY, 0), new Vector3(0, 1, 0), 0, y - motY);
    source.updateMatrixWorld(true);
    expect(atomFeed.intersectObjects([source, chamber], true).filter(({ object }) => object instanceof Mesh)).toHaveLength(0);
    disposeGroup(source);
    source.disposeHighlight();
    disposeGroup(chamber);
    chamber.disposeHighlight();
  });

  it('按文献的两处样品位置标定垂直尺度，MOT 冷却光交于下腔', () => {
    const { arrayY, motY } = MUNIZ_DEMO_SCENE;
    expect((arrayY - motY) / sceneUnitsPerMetre).toBeCloseTo(norciaTransport.separationM, 12);
    for (const beam of paths.cooling) expect(beam.points[1]).toEqual([0, motY, 0]);
    expect(munizEvidence.trapRows * munizEvidence.trapColumns).toBe(munizEvidence.trapSites);
    expect((munizEvidence.trapColumns - 1) * munizEvidence.gatePitchUm).toBe(18);
  });

  it('实验交互行与两腔共用世界长度：相邻阱心 3 微米、首末 18 微米', () => {
    const { arrayY, motY } = MUNIZ_DEMO_SCENE;
    const row = publishedInteractionRow(arrayY);
    const centres = row.children.filter(child => child.name === 'trap-centre').map(child => child.getWorldPosition(new Vector3()));
    expect(centres).toHaveLength(7);
    for (let i = 1; i < centres.length; i++) {
      const pitch = centres[i].distanceTo(centres[i - 1]);
      expect(pitch / sceneUnitsPerMetre).toBeCloseTo(3e-6, 12);
      expect((arrayY - motY) / pitch).toBeCloseTo(100_000, 6);
    }
    expect(centres[6].distanceTo(centres[0]) / sceneUnitsPerMetre).toBeCloseTo(18e-6, 12);
    disposeGroup(row);
  });

  it.each(Object.entries(factories))('%s 的目录与实体对应，拆解只平移对应部件且可准确复位', (_, create) => {
    const assembly = create();
    try {
      const expected = machineEquipment[assembly.equipmentId].parts.map(part => part.id);
      expect([...assembly.parts.keys()].sort()).toEqual(expected.sort());
      const original = [...assembly.parts.values()].map(({ group, offset }) => {
        const mesh = group.getObjectByProperty('isMesh', true);
        expect(mesh).toBeInstanceOf(Mesh);
        return { mesh: mesh!, start: mesh!.getWorldPosition(new Vector3()), offset };
      });
      expect(new Set(original.map(({ offset }) => offset.toArray().join(','))).size).toBe(original.length);
      for (const fraction of [1, 0.5, 0]) {
        assembly.setExplosion(fraction);
        for (const { mesh, start, offset } of original) {
          const wanted = start.clone().addScaledVector(offset, fraction);
          expect(mesh.getWorldPosition(new Vector3()).distanceTo(wanted)).toBeLessThan(1e-9);
        }
      }
    } finally {
      assembly.disposeHighlight();
      disposeGroup(assembly);
    }
  });
});
