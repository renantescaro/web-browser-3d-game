// Modelo 3D de cada roupa ou acessório do catálogo (`shared/src/outfits.ts`), feito de primitivas.
// Item novo: crie a função aqui e registre em `WEARABLE_MODELS` (o tipo obriga a ter todos).
import * as THREE from "three";
import type { OutfitItemId } from "@jogo/shared/outfits";
import { buildCap } from "../CharacterAccessories";
import type { WornItem } from "./WornItem";

/**
 * Onde as peças são presas no `Character`. A cabeça tem a origem no centro (raio 0,16 m) e os pés
 * na sola, embaixo de cada perna (acompanham o passo). +Z é a frente do personagem.
 */
export interface WearableAnchors {
  head: THREE.Object3D;
  leftFoot: THREE.Object3D;
  rightFoot: THREE.Object3D;
}

export type WearableFactory = (item: WornItem, anchors: WearableAnchors) => void;

const TOP_HAT = { color: 0x1b1b1f, bandColor: 0x8c1c2b, brimRadius: 0.25, crownHeight: 0.3, y: 0.1 } as const;
const CAP_COLOR = 0x1f6fd1;
/** Óculos: altura dos olhos e quanto as lentes ficam à frente do centro da cabeça. */
const GLASSES = { y: 0.03, z: 0.172, eyeX: 0.06, lensRadius: 0.038, frameColor: 0x151515, lensColor: 0x6fa8c9 } as const;
const BOOT = { color: 0x6b3e1f, soleColor: 0x2b1a0e, shaftHeight: 0.3 } as const;

/** Cartola: aba fina, copa alta e uma fita. */
function topHat(item: WornItem, { head }: WearableAnchors): void {
  const felt = item.material(TOP_HAT.color, { roughness: 0.5 });
  const brim = item.mesh(new THREE.CylinderGeometry(TOP_HAT.brimRadius, TOP_HAT.brimRadius, 0.02, 24), felt, head);
  brim.position.y = TOP_HAT.y;
  const crown = item.mesh(new THREE.CylinderGeometry(0.15, 0.14, TOP_HAT.crownHeight, 20), felt, head);
  crown.position.y = TOP_HAT.y + TOP_HAT.crownHeight / 2;
  const band = item.mesh(new THREE.CylinderGeometry(0.143, 0.143, 0.045, 20), item.material(TOP_HAT.bandColor), head);
  band.position.y = TOP_HAT.y + 0.035;
}

function cap(item: WornItem, { head }: WearableAnchors): void {
  buildCap(item, item.material(CAP_COLOR), head);
}

/** Óculos: dois aros com lentes, a ponte e as hastes indo até as orelhas. */
function glasses(item: WornItem, { head }: WearableAnchors): void {
  const frame = item.material(GLASSES.frameColor, { roughness: 0.4 });
  const lens = item.material(GLASSES.lensColor, { transparent: true, opacity: 0.45, roughness: 0.1 });
  const ring = new THREE.TorusGeometry(GLASSES.lensRadius, 0.008, 6, 18);
  const disc = new THREE.CircleGeometry(GLASSES.lensRadius, 18);
  const temple = new THREE.BoxGeometry(0.008, 0.008, 0.18);
  for (const side of [-1, 1]) {
    item.mesh(ring, frame, head).position.set(side * GLASSES.eyeX, GLASSES.y, GLASSES.z);
    item.mesh(disc, lens, head).position.set(side * GLASSES.eyeX, GLASSES.y, GLASSES.z - 0.002);
    const arm = item.mesh(temple, frame, head);
    arm.position.set(side * 0.14, GLASSES.y, GLASSES.z - 0.09);
    arm.rotation.y = side * 0.34;
  }
  item.mesh(new THREE.BoxGeometry(0.045, 0.008, 0.008), frame, head).position.set(0, GLASSES.y + 0.005, GLASSES.z);
}

/** Botas: cano em volta da canela, bico para a frente e sola escura, uma em cada pé. */
function boots(item: WornItem, { leftFoot, rightFoot }: WearableAnchors): void {
  const leather = item.material(BOOT.color, { roughness: 0.55 });
  const rubber = item.material(BOOT.soleColor);
  const shaft = new THREE.CylinderGeometry(0.115, 0.12, BOOT.shaftHeight, 14);
  const toe = new THREE.BoxGeometry(0.2, 0.1, 0.3);
  const sole = new THREE.BoxGeometry(0.21, 0.025, 0.31);
  for (const foot of [leftFoot, rightFoot]) {
    item.mesh(shaft, leather, foot).position.y = BOOT.shaftHeight / 2;
    item.mesh(toe, leather, foot).position.set(0, 0.05, 0.06);
    item.mesh(sole, rubber, foot).position.set(0, 0.0125, 0.06);
  }
}

export const WEARABLE_MODELS: Record<OutfitItemId, WearableFactory> = {
  topHat,
  cap,
  glasses,
  boots,
};
