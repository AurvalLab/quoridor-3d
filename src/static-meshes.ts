import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Static furniture keeps its detail without one draw call for every brass fitting. */
export function batchStatic(group: THREE.Group) {
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert();
  const batches = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; geometries: THREE.BufferGeometry[] }>();
  const meshes: THREE.Mesh[] = [];
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || Array.isArray(object.material)) return;
    meshes.push(object);
    const key = `${object.material.uuid}/${object.castShadow}/${object.receiveShadow}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { material: object.material, cast: object.castShadow, receive: object.receiveShadow, geometries: [] };
      batches.set(key, batch);
    }
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    batch.geometries.push(geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld)));
  });
  for (const mesh of meshes) mesh.removeFromParent();
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.geometries);
    if (!geometry) throw new Error(`Cannot batch static geometry in ${group.name}`);
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.castShadow = batch.cast;
    mesh.receiveShadow = batch.receive;
    group.add(mesh);
  }
}
