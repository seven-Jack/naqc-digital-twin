import { Mesh, Texture, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { equipmentIds, machineEquipment } from '../src/data/machineEquipment';
import { MUNIZ_DEMO_SCENE } from '../src/data/machineSceneProfile';
import { disposeGroup } from '../src/scene/arrayGeometry';
import { aodSystem, atomicSource, imagingSystem, laserSystem, slmSystem, table, vacuumChamber } from '../src/scene/machineHardware';

const { paths } = MUNIZ_DEMO_SCENE;
const factories = {
  table, source: atomicSource,
  slm: () => slmSystem(paths.reservoir.color, paths.science.color),
  aod: () => aodSystem(paths.transport.color),
  vacuum: () => vacuumChamber(new Texture(), paths.reservoir.color),
  gate: () => laserSystem(MUNIZ_DEMO_SCENE),
  imaging: () => imagingSystem(paths.probe.color),
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
