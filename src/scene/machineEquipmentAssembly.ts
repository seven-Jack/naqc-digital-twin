import * as T from 'three';
import type { EquipmentId } from '../data/machineEquipment';
import type { ScenePoint } from '../data/machineSceneProfile';

/** The group translations are diagram offsets. Local mesh coordinates always retain the replay geometry. */
export class EquipmentAssembly extends T.Group {
  readonly parts = new Map<string, { group: T.Group; offset: T.Vector3 }>();
  private highlight: T.LineSegments[] = [];
  private highlightMaterial = new T.LineBasicMaterial({ color: '#f2dbaf', toneMapped: false });

  constructor(readonly equipmentId: EquipmentId) {
    super();
    this.name = equipmentId;
  }

  part(id: string, offset: ScenePoint) {
    const group = new T.Group();
    group.name = id;
    this.parts.set(id, { group, offset: new T.Vector3(...offset) });
    this.add(group);
    return group;
  }

  setExplosion(amount: number) {
    for (const { group, offset } of this.parts.values()) group.position.copy(offset).multiplyScalar(amount);
  }

  selectPart(id: string | null) {
    for (const outline of this.highlight) {
      outline.removeFromParent();
      outline.geometry.dispose();
    }
    this.highlight.length = 0;
    if (!id) return;
    const meshes: T.Mesh[] = [];
    this.parts.get(id)?.group.traverseVisible(object => {
      if (object instanceof T.Mesh && !(object instanceof T.InstancedMesh)) meshes.push(object);
    });
    for (const mesh of meshes) {
      const outline = new T.LineSegments(new T.EdgesGeometry(mesh.geometry, 26), this.highlightMaterial);
      outline.scale.setScalar(1.003);
      mesh.add(outline);
      this.highlight.push(outline);
    }
  }

  /** Union of the visible solid parts in the assembled and fully expanded poses. */
  inspectionBounds() {
    const bounds = new T.Box3();
    const meshBounds = new T.Box3();
    for (const { group, offset } of this.parts.values()) {
      group.updateWorldMatrix(true, true);
      group.traverseVisible(object => {
        if (!(object instanceof T.Mesh) || object.userData.ignorePick) return;
        const geometry = object.geometry as T.BufferGeometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        if (!geometry.boundingBox) return;
        meshBounds.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld);
        meshBounds.translate(group.position.clone().negate());
        bounds.union(meshBounds);
        bounds.union(meshBounds.translate(offset));
      });
    }
    return bounds;
  }

  disposeHighlight() {
    this.selectPart(null);
    this.highlightMaterial.dispose();
  }
}
