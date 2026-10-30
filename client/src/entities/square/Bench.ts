import * as THREE from "three";
import { Model } from "../Model";

const SEAT_HEIGHT = 0.45;
const SEAT_DEPTH = 0.45;

/** Banco de madeira com pés de ferro. Quem senta olha para +Z local. */
export class Bench extends Model {
  /** Meias-medidas da caixa de colisão (largura, altura, profundidade). */
  static readonly HALF_EXTENTS = { x: 0.9, y: 0.45, z: 0.28 } as const;

  constructor() {
    super();
    const wood = this.mat(0x9a6a3c);
    const iron = this.mat(0x2e2e33, false, 0.6);

    const slat = new THREE.BoxGeometry(1.8, 0.05, SEAT_DEPTH / 3 - 0.02);
    for (let i = 0; i < 3; i++) {
      this.mesh(slat, wood).position.set(0, SEAT_HEIGHT, -SEAT_DEPTH / 3 + (i * SEAT_DEPTH) / 3);
    }

    // Encosto: duas ripas inclinadas atrás do assento.
    const backSlat = new THREE.BoxGeometry(1.8, 0.12, 0.04);
    for (const y of [0.68, 0.86]) {
      const b = this.mesh(backSlat, wood);
      b.position.set(0, y, -SEAT_DEPTH / 2 - 0.02);
      b.rotation.x = -0.15;
    }

    // Pés de ferro finos: dois de cada lado e o suporte do encosto.
    const leg = new THREE.BoxGeometry(0.05, SEAT_HEIGHT, 0.05);
    const backLeg = new THREE.BoxGeometry(0.05, 0.5, 0.05);
    for (const x of [-0.75, 0.75]) {
      for (const z of [-SEAT_DEPTH / 2 + 0.05, SEAT_DEPTH / 2 - 0.05]) {
        this.mesh(leg, iron).position.set(x, SEAT_HEIGHT / 2, z);
      }
      this.mesh(backLeg, iron).position.set(x, 0.72, -SEAT_DEPTH / 2 - 0.04);
    }
  }
}
