// Acessórios opcionais da aparência de um personagem (chapéu, avental, bigode).
import * as THREE from "three";
import type { CharacterAppearance, HatStyle } from "@jogo/shared/protocol";

/** Fábricas do `Character`, que registram os recursos para o dispose(). */
export interface AccessoryKit {
  material: (color: THREE.ColorRepresentation) => THREE.MeshStandardMaterial;
  mesh: (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) => THREE.Mesh;
}

/** Raio da cabeça (m), igual ao do `Character`. */
const HEAD_RADIUS = 0.16;

const HATS: Record<HatStyle, (kit: AccessoryKit, mat: THREE.Material, head: THREE.Object3D) => void> = {
  // Boné: copa arredondada e aba para a frente.
  cap: (kit, mat, head) => {
    const crown = kit.mesh(new THREE.SphereGeometry(HEAD_RADIUS + 0.012, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat, head);
    crown.position.y = 0.03;
    const brim = kit.mesh(new THREE.BoxGeometry(0.22, 0.02, 0.14), mat, head);
    brim.position.set(0, 0.04, HEAD_RADIUS + 0.03);
  },
  // Chapéu de aba larga (palha).
  wide: (kit, mat, head) => {
    const brim = kit.mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 24), mat, head);
    brim.position.y = 0.09;
    const crown = kit.mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.14, 18), mat, head);
    crown.position.y = 0.16;
  },
};

/** Monta os acessórios pedidos em `appearance` na cabeça e no corpo. */
export function buildAccessories(
  appearance: CharacterAppearance,
  kit: AccessoryKit,
  head: THREE.Object3D,
  body: THREE.Object3D,
): void {
  if (appearance.hat) HATS[appearance.hat.style](kit, kit.material(appearance.hat.color), head);

  if (appearance.apronColor) {
    // Na frente do tronco (cápsula de raio 0,23 centrada em y = 1,2), da cintura ao peito.
    const apron = kit.mesh(new THREE.BoxGeometry(0.34, 0.56, 0.02), kit.material(appearance.apronColor), body);
    apron.position.set(0, 1.08, 0.235);
  }

  if (appearance.mustacheColor) {
    const mustache = kit.mesh(new THREE.BoxGeometry(0.11, 0.025, 0.03), kit.material(appearance.mustacheColor), head);
    mustache.position.set(0, -0.045, HEAD_RADIUS - 0.015);
  }
}
