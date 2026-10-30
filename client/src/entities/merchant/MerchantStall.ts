import * as THREE from "three";
import { MERCHANT_TABLE_OFFSET } from "@jogo/shared/constants";
import { Model } from "../Model";
import { createWoodTextTexture } from "../textTexture";

const TABLE_WIDTH = 1.6;
const TABLE_DEPTH = 0.8;
const TABLE_HEIGHT = 0.9;
const TOP_THICKNESS = 0.06;
const PLATE_WIDTH = 1.4;
const PLATE_HEIGHT = 0.4;
const PLATE_Y = 0.6;
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = Math.round((TEXTURE_WIDTH * PLATE_HEIGHT) / PLATE_WIDTH);
const CANOPY_HEIGHT = 2.5;
/** O toldo cobre da frente da mesa até um pouco atrás do comerciante. */
const CANOPY_FRONT = TABLE_DEPTH / 2;
const CANOPY_BACK = -(MERCHANT_TABLE_OFFSET + 0.6);
const FISH_COLORS = [0xff7b25, 0xffd23f, 0xf25c54] as const;

/**
 * Barraca do comerciante: mesa com uma placa na frente, caixote de peixes e toldo.
 * A origem é o centro da mesa; a frente (lado dos clientes) olha para +Z.
 */
export class MerchantStall extends Model {
  /** Meias-medidas da caixa de colisão da mesa. */
  static readonly HALF_EXTENTS = { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT / 2, z: TABLE_DEPTH / 2 } as const;

  constructor(readonly text: string) {
    super();
    const wood = this.mat(0x8a5a33);
    const darkWood = this.mat(0x5c3b1e);

    // Tampo e pernas.
    const top = this.mesh(new THREE.BoxGeometry(TABLE_WIDTH, TOP_THICKNESS, TABLE_DEPTH), wood);
    top.position.y = TABLE_HEIGHT - TOP_THICKNESS / 2;
    const leg = new THREE.BoxGeometry(0.08, TABLE_HEIGHT - TOP_THICKNESS, 0.08);
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        this.mesh(leg, darkWood).position.set(
          x * (TABLE_WIDTH / 2 - 0.08),
          (TABLE_HEIGHT - TOP_THICKNESS) / 2,
          z * (TABLE_DEPTH / 2 - 0.08),
        );
      }
    }

    // Placa pregada na frente da mesa.
    const texture = this.track(createWoodTextTexture(text, TEXTURE_WIDTH, TEXTURE_HEIGHT));
    const plate = this.mesh(new THREE.PlaneGeometry(PLATE_WIDTH, PLATE_HEIGHT), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
    plate.position.set(0, PLATE_Y, TABLE_DEPTH / 2 + 0.01);

    this.buildCrate(wood);
    this.buildCanopy(darkWood);
  }

  /** Caixote com alguns peixes em cima da mesa. */
  private buildCrate(wood: THREE.Material): void {
    const crate = this.mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), wood);
    crate.position.set(-0.4, TABLE_HEIGHT + 0.08, 0);
    const fishGeo = new THREE.SphereGeometry(0.06, 10, 8);
    FISH_COLORS.forEach((color, i) => {
      const fish = this.mesh(fishGeo, this.mat(color, false, 0.5));
      fish.scale.set(2.2, 0.8, 1);
      fish.position.set(-0.52 + i * 0.12, TABLE_HEIGHT + 0.18, -0.06 + (i % 2) * 0.12);
      fish.rotation.y = 0.3 * (i - 1);
    });
  }

  /** Quatro postes e um toldo listrado. */
  private buildCanopy(wood: THREE.Material): void {
    const pole = new THREE.CylinderGeometry(0.04, 0.04, CANOPY_HEIGHT, 8);
    for (const x of [-1, 1]) {
      for (const z of [CANOPY_FRONT, CANOPY_BACK]) {
        this.mesh(pole, wood).position.set(x * (TABLE_WIDTH / 2 + 0.1), CANOPY_HEIGHT / 2, z);
      }
    }
    const depth = CANOPY_FRONT - CANOPY_BACK + 0.3;
    const stripes = 6;
    const stripeWidth = (TABLE_WIDTH + 0.5) / stripes;
    const stripeGeo = new THREE.BoxGeometry(stripeWidth, 0.05, depth);
    const colors = [this.mat(0xc1121f), this.mat(0xf5efe0)];
    for (let i = 0; i < stripes; i++) {
      const stripe = this.mesh(stripeGeo, colors[i % 2]!);
      stripe.position.set(-(TABLE_WIDTH + 0.5) / 2 + stripeWidth * (i + 0.5), CANOPY_HEIGHT, (CANOPY_FRONT + CANOPY_BACK) / 2);
    }
  }
}
