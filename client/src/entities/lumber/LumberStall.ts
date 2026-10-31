import * as THREE from "three";
import { LUMBER_COUNTER_OFFSET } from "@jogo/shared/constants";
import { Model } from "../Model";
import { createWoodTextTexture } from "../textTexture";

const COUNTER_WIDTH = 1.7;
const COUNTER_DEPTH = 0.75;
const COUNTER_HEIGHT = 0.95;
const PLANK_COUNT = 4;
const PLATE_WIDTH = 1.4;
const PLATE_HEIGHT = 0.4;
const PLATE_Y = 0.55;
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = Math.round((TEXTURE_WIDTH * PLATE_HEIGHT) / PLATE_WIDTH);
/** Pilha de toras atrás do Brenno, deitadas de lado a lado. */
const PILE = { z: -(LUMBER_COUNTER_OFFSET + 0.65), logRadius: 0.16, length: 1.8, rows: [4, 3, 2] } as const;
/** Cavalete com serra circular, ao lado do balcão (do lado de dentro da barraca). */
const SAW = { x: -1.2, z: -LUMBER_COUNTER_OFFSET, height: 0.8, bladeRadius: 0.28 } as const;
const CANOPY_HEIGHT = 2.6;
const CANOPY_FRONT = COUNTER_DEPTH / 2;
const CANOPY_BACK = PILE.z - 0.35;
const BARK = 0x6b4a2f;
const CUT = 0xe0bf8a;

/**
 * Madeireira do Brenno: balcão de tábuas com placa, pilha de toras, cavalete com serra circular e
 * toldo listrado. A origem é o centro do balcão; a frente (clientes) olha para +Z.
 */
export class LumberStall extends Model {
  /** Meias-medidas da caixa de colisão do balcão. */
  static readonly HALF_EXTENTS = { x: COUNTER_WIDTH / 2, y: COUNTER_HEIGHT / 2, z: COUNTER_DEPTH / 2 } as const;
  /** Caixa de colisão da pilha de toras: centro no eixo Z do balcão e meias-medidas. */
  static readonly PILE_BOX = {
    z: PILE.z,
    half: { x: PILE.length / 2, y: (PILE.rows.length * PILE.logRadius * 2) / 2, z: PILE.rows[0] * PILE.logRadius },
  } as const;
  /** Caixa de colisão do cavalete da serra, no espaço do balcão. */
  static readonly SAW_BOX = { x: SAW.x, z: SAW.z, half: { x: 0.35, y: SAW.height / 2, z: 0.3 } } as const;

  /** Casca e madeira cortada, compartilhadas por todas as toras. */
  private readonly bark = this.mat(BARK);
  private readonly cut = this.mat(CUT);

  constructor(readonly text: string) {
    super();
    const plank = this.mat(0xa47148);
    const darkWood = this.mat(0x5c3b1e);
    this.buildCounter(plank, darkWood);

    // Placa pregada na frente do balcão.
    const texture = this.track(createWoodTextTexture(text, TEXTURE_WIDTH, TEXTURE_HEIGHT));
    const plate = this.mesh(new THREE.PlaneGeometry(PLATE_WIDTH, PLATE_HEIGHT), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
    plate.position.set(0, PLATE_Y, COUNTER_DEPTH / 2 + 0.02);

    this.buildPile();
    this.buildSaw(darkWood);
    this.buildCanopy(darkWood);
  }

  /** Balcão feito de tábuas horizontais, com uma tábua grossa por cima e algumas toras em cima. */
  private buildCounter(plank: THREE.Material, darkWood: THREE.Material): void {
    const plankHeight = (COUNTER_HEIGHT - 0.08) / PLANK_COUNT;
    const board = new THREE.BoxGeometry(COUNTER_WIDTH, plankHeight - 0.02, COUNTER_DEPTH);
    for (let i = 0; i < PLANK_COUNT; i++) {
      this.mesh(board, i % 2 === 0 ? plank : darkWood).position.y = plankHeight * (i + 0.5);
    }
    const top = this.mesh(new THREE.BoxGeometry(COUNTER_WIDTH + 0.1, 0.08, COUNTER_DEPTH + 0.1), darkWood);
    top.position.y = COUNTER_HEIGHT - 0.04;

    // Duas toras cortadas de mostruário em cima do balcão.
    for (const x of [0.45, 0.65]) this.log(x, COUNTER_HEIGHT + 0.09, 0, 0.09, 0.5, true);
  }

  /** Uma tora deitada (ao longo de X) ou em pé, com os anéis claros nas pontas. */
  private log(x: number, y: number, z: number, radius: number, length: number, alongZ = false): void {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.set(alongZ ? Math.PI / 2 : 0, 0, alongZ ? 0 : Math.PI / 2);
    this.root.add(group);
    this.mesh(new THREE.CylinderGeometry(radius, radius, length, 10), this.bark, group);
    for (const side of [-1, 1]) {
      const ring = this.mesh(new THREE.CircleGeometry(radius * 0.92, 10), this.cut, group);
      ring.position.y = (side * length) / 2 + side * 0.002;
      ring.rotation.x = (-side * Math.PI) / 2;
    }
  }

  /** Pilha de toras em camadas (cada camada encaixada entre as de baixo). */
  private buildPile(): void {
    const r = PILE.logRadius;
    PILE.rows.forEach((count, row) => {
      const y = r + row * r * 1.75;
      for (let i = 0; i < count; i++) {
        const z = PILE.z + (i - (count - 1) / 2) * r * 2;
        this.log(0, y, z, r, PILE.length);
      }
    });
  }

  /** Cavalete com uma tora em cima e a lâmina da serra circular. */
  private buildSaw(darkWood: THREE.Material): void {
    const leg = new THREE.BoxGeometry(0.06, SAW.height, 0.06);
    for (const dx of [-0.3, 0.3]) {
      for (const dz of [-0.2, 0.2]) this.mesh(leg, darkWood).position.set(SAW.x + dx, SAW.height / 2, SAW.z + dz);
    }
    const table = this.mesh(new THREE.BoxGeometry(0.75, 0.06, 0.55), darkWood);
    table.position.set(SAW.x, SAW.height, SAW.z);
    this.log(SAW.x, SAW.height + 0.12, SAW.z + 0.1, 0.09, 0.7);

    const blade = this.mesh(new THREE.CylinderGeometry(SAW.bladeRadius, SAW.bladeRadius, 0.015, 24), this.mat(0xc9ced6, false, 0.3));
    blade.rotation.x = Math.PI / 2;
    blade.position.set(SAW.x, SAW.height + SAW.bladeRadius * 0.6, SAW.z - 0.12);
    const hub = this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), this.mat(0xe63946, false, 0.5));
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(blade.position);
  }

  /** Quatro postes e um toldo listrado marrom e creme. */
  private buildCanopy(wood: THREE.Material): void {
    const pole = new THREE.CylinderGeometry(0.05, 0.05, CANOPY_HEIGHT, 8);
    const halfWidth = COUNTER_WIDTH / 2 + 0.25;
    for (const x of [-1, 1]) {
      for (const z of [CANOPY_FRONT, CANOPY_BACK]) this.mesh(pole, wood).position.set(x * halfWidth, CANOPY_HEIGHT / 2, z);
    }
    const width = halfWidth * 2 + 0.3;
    const stripes = 6;
    const stripeWidth = width / stripes;
    const stripeGeo = new THREE.BoxGeometry(stripeWidth, 0.05, CANOPY_FRONT - CANOPY_BACK + 0.3);
    const colors = [this.mat(0x7f5539), this.mat(0xf5efe0)];
    for (let i = 0; i < stripes; i++) {
      const stripe = this.mesh(stripeGeo, colors[i % 2]!);
      stripe.position.set(-width / 2 + stripeWidth * (i + 0.5), CANOPY_HEIGHT, (CANOPY_FRONT + CANOPY_BACK) / 2);
    }
  }
}
