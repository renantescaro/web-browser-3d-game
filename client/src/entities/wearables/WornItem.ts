import * as THREE from "three";
import type { AccessoryKit } from "../CharacterAccessories";

/**
 * Uma peça vestida (ex.: as duas botas). Guarda as malhas, geometrias e materiais que criou
 * para tirar a peça inteira do corpo e liberar os recursos ao trocar de roupa.
 */
export class WornItem implements AccessoryKit {
  readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();

  /** Mesmo material do `Character` (com emissivo para o flash de quando leva soco). */
  material(color: THREE.ColorRepresentation, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0, ...options });
    this.materials.push(m);
    return m;
  }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
    this.geometries.add(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  dispose(): void {
    for (const m of this.meshes) m.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
