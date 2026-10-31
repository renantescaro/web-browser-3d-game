// Acessórios opcionais da aparência de um personagem (chapéu, avental, colete, gravata-borboleta, bigode).
import * as THREE from "three";
import type { CharacterAppearance, HatStyle } from "@jogo/shared/protocol";

/** Fábricas do `Character`, que registram os recursos para o dispose(). */
export interface AccessoryKit {
  material: (color: THREE.ColorRepresentation) => THREE.MeshStandardMaterial;
  mesh: (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) => THREE.Mesh;
}

/** Raio da cabeça (m), igual ao do `Character`. */
const HEAD_RADIUS = 0.16;
/** Tronco do `Character`: cápsula de raio 0,23 centrada em y = 1,2. */
const TORSO_RADIUS = 0.23;
const TORSO_Y = 1.2;
/** Gravata-borboleta logo abaixo do queixo, encostada no topo arredondado do tronco. */
const BOW_TIE = { y: 1.43, z: 0.2 };
const BOATER_BAND_COLOR = 0x1d1d1d;

/** Boné: copa arredondada e aba para a frente. Também é vendido pela Deendi. */
export function buildCap(kit: AccessoryKit, mat: THREE.Material, head: THREE.Object3D): void {
  const crown = kit.mesh(new THREE.SphereGeometry(HEAD_RADIUS + 0.012, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat, head);
  crown.position.y = 0.03;
  const brim = kit.mesh(new THREE.BoxGeometry(0.22, 0.02, 0.14), mat, head);
  brim.position.set(0, 0.04, HEAD_RADIUS + 0.03);
}

const HATS: Record<HatStyle, (kit: AccessoryKit, mat: THREE.Material, head: THREE.Object3D) => void> = {
  cap: buildCap,
  // Chapéu de aba larga (palha).
  wide: (kit, mat, head) => {
    const brim = kit.mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 24), mat, head);
    brim.position.y = 0.09;
    const crown = kit.mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.14, 18), mat, head);
    crown.position.y = 0.16;
  },
  // Chapéu-coco de palha de parque de diversões: copa reta e baixa, aba curta e fita escura.
  boater: (kit, mat, head) => {
    const brim = kit.mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 24), mat, head);
    brim.position.y = 0.1;
    const crown = kit.mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 20), mat, head);
    crown.position.y = 0.16;
    const band = kit.mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.03, 20), kit.material(BOATER_BAND_COLOR), head);
    band.position.y = 0.13;
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
    apron.position.set(0, 1.08, TORSO_RADIUS + 0.005);
  }

  if (appearance.vestColor) {
    // Colete aberto na frente: um cilindro sem a fatia da frente, cobrindo o tronco.
    const open = 0.9;
    const vest = kit.mesh(
      new THREE.CylinderGeometry(TORSO_RADIUS + 0.012, TORSO_RADIUS + 0.012, 0.42, 20, 1, true, open / 2, Math.PI * 2 - open),
      kit.material(appearance.vestColor),
      body,
    );
    vest.position.y = TORSO_Y;
  }

  if (appearance.bowTieColor) {
    const mat = kit.material(appearance.bowTieColor);
    const wing = new THREE.ConeGeometry(0.04, 0.07, 4);
    for (const side of [-1, 1]) {
      // Dois triângulos com a ponta no nó, apontando para os lados.
      const half = kit.mesh(wing, mat, body);
      half.rotation.z = (side * Math.PI) / 2;
      half.position.set(side * 0.035, BOW_TIE.y, BOW_TIE.z - 0.01);
    }
    kit.mesh(new THREE.SphereGeometry(0.018, 8, 6), mat, body).position.set(0, BOW_TIE.y, BOW_TIE.z);
  }

  if (appearance.mustacheColor) {
    const mustache = kit.mesh(new THREE.BoxGeometry(0.11, 0.025, 0.03), kit.material(appearance.mustacheColor), head);
    mustache.position.set(0, -0.045, HEAD_RADIUS - 0.015);
  }
}
