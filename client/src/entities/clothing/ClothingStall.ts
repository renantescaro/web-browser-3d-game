import * as THREE from "three";
import { CLOTHING_COUNTER_OFFSET } from "@jogo/shared/constants";
import { Model } from "../Model";
import { createWoodTextTexture } from "../textTexture";
import { WEARABLE_MODELS } from "../wearables/wearableModels";
import { WornItem } from "../wearables/WornItem";

const COUNTER_WIDTH = 1.7;
const COUNTER_DEPTH = 0.7;
const COUNTER_HEIGHT = 0.95;
const TOP_THICKNESS = 0.06;
const PLATE_WIDTH = 1.5;
const PLATE_HEIGHT = 0.4;
const PLATE_Y = 0.55;
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = Math.round((TEXTURE_WIDTH * PLATE_HEIGHT) / PLATE_WIDTH);
/** Arara de roupas atrás da Deendi. */
const RACK = { z: -(CLOTHING_COUNTER_OFFSET + 0.55), height: 1.6, halfWidth: 0.8 } as const;
const SHIRT_COLORS = [0xe63946, 0x4895ef, 0xf6d743, 0x57cc99, 0xff70a6] as const;
const CANOPY_HEIGHT = 2.6;
const CANOPY_FRONT = COUNTER_DEPTH / 2;
const CANOPY_BACK = RACK.z - 0.3;
/** Altura da cabeça dos manequins de vitrine, acima do balcão. */
const MANNEQUIN_HEAD_Y = 0.3;

/**
 * Loja de roupas da Deendi: balcão com placa, manequins mostrando os produtos, arara com
 * camisas e toldo listrado. A origem é o centro do balcão; a frente (clientes) olha para +Z.
 */
export class ClothingStall extends Model {
  /** Meias-medidas da caixa de colisão do balcão. */
  static readonly HALF_EXTENTS = { x: COUNTER_WIDTH / 2, y: COUNTER_HEIGHT / 2, z: COUNTER_DEPTH / 2 } as const;
  /** Caixa de colisão da arara: centro no eixo Z do balcão e meias-medidas. */
  static readonly RACK_BOX = { z: RACK.z, half: { x: RACK.halfWidth + 0.05, y: RACK.height / 2, z: 0.25 } } as const;

  /** Produtos de vitrine: usam os mesmos modelos que os personagens vestem. */
  private readonly display = new WornItem();

  constructor(readonly text: string) {
    super();
    const paint = this.mat(0xf3e9dc);
    const trim = this.mat(0x8e3b8f);

    // Balcão com tampo e rodapé coloridos.
    const body = this.mesh(new THREE.BoxGeometry(COUNTER_WIDTH, COUNTER_HEIGHT - TOP_THICKNESS, COUNTER_DEPTH), paint);
    body.position.y = (COUNTER_HEIGHT - TOP_THICKNESS) / 2;
    const top = this.mesh(new THREE.BoxGeometry(COUNTER_WIDTH + 0.06, TOP_THICKNESS, COUNTER_DEPTH + 0.06), trim);
    top.position.y = COUNTER_HEIGHT - TOP_THICKNESS / 2;

    // Placa na frente do balcão.
    const texture = this.track(createWoodTextTexture(text, TEXTURE_WIDTH, TEXTURE_HEIGHT));
    const plate = this.mesh(new THREE.PlaneGeometry(PLATE_WIDTH, PLATE_HEIGHT), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
    plate.position.set(0, PLATE_Y, COUNTER_DEPTH / 2 + 0.01);

    this.buildShowcase();
    this.buildRack(trim);
    this.buildCanopy(trim);
  }

  /** Dois manequins (cartola com óculos e boné) e um par de botas em cima do balcão. */
  private buildShowcase(): void {
    const stand = this.mat(0x2b2d42);
    const skin = this.mat(0xd9d4cc, false, 0.6);
    const heads = [-0.55, 0.05].map((x) => {
      const post = this.mesh(new THREE.CylinderGeometry(0.03, 0.06, MANNEQUIN_HEAD_Y - 0.1, 10), stand);
      post.position.set(x, COUNTER_HEIGHT + (MANNEQUIN_HEAD_Y - 0.1) / 2, 0);
      const head = this.mesh(new THREE.SphereGeometry(0.16, 16, 12), skin);
      head.position.set(x, COUNTER_HEIGHT + MANNEQUIN_HEAD_Y, 0);
      head.rotation.y = 0.25;
      return head;
    });
    const [left, right] = heads as [THREE.Mesh, THREE.Mesh];
    const leftBoot = new THREE.Group();
    const rightBoot = new THREE.Group();
    leftBoot.position.set(0.5, COUNTER_HEIGHT, 0);
    rightBoot.position.set(0.75, COUNTER_HEIGHT, 0);
    leftBoot.scale.setScalar(0.8);
    rightBoot.scale.setScalar(0.8);
    this.root.add(leftBoot, rightBoot);

    const anchors = { head: left, leftFoot: leftBoot, rightFoot: rightBoot };
    WEARABLE_MODELS.topHat(this.display, anchors);
    WEARABLE_MODELS.glasses(this.display, anchors);
    WEARABLE_MODELS.boots(this.display, anchors);
    WEARABLE_MODELS.cap(this.display, { ...anchors, head: right });
  }

  /** Arara: dois postes, uma barra e camisas penduradas. */
  private buildRack(metal: THREE.Material): void {
    const post = new THREE.CylinderGeometry(0.025, 0.025, RACK.height, 8);
    for (const side of [-1, 1]) this.mesh(post, metal).position.set(side * RACK.halfWidth, RACK.height / 2, RACK.z);
    const bar = this.mesh(new THREE.CylinderGeometry(0.02, 0.02, RACK.halfWidth * 2, 8), metal);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, RACK.height - 0.05, RACK.z);

    const shirt = new THREE.BoxGeometry(0.06, 0.5, 0.4);
    const sleeve = new THREE.BoxGeometry(0.05, 0.12, 0.62);
    const step = (RACK.halfWidth * 2 - 0.3) / (SHIRT_COLORS.length - 1);
    SHIRT_COLORS.forEach((color, i) => {
      const mat = this.mat(color);
      const x = -RACK.halfWidth + 0.15 + step * i;
      this.mesh(shirt, mat).position.set(x, RACK.height - 0.35, RACK.z);
      this.mesh(sleeve, mat).position.set(x, RACK.height - 0.17, RACK.z);
    });
  }

  /** Quatro postes e um toldo listrado roxo e creme. */
  private buildCanopy(wood: THREE.Material): void {
    const pole = new THREE.CylinderGeometry(0.04, 0.04, CANOPY_HEIGHT, 8);
    for (const x of [-1, 1]) {
      for (const z of [CANOPY_FRONT, CANOPY_BACK]) {
        this.mesh(pole, wood).position.set(x * (COUNTER_WIDTH / 2 + 0.1), CANOPY_HEIGHT / 2, z);
      }
    }
    const width = COUNTER_WIDTH + 0.5;
    const stripes = 6;
    const stripeWidth = width / stripes;
    const stripeGeo = new THREE.BoxGeometry(stripeWidth, 0.05, CANOPY_FRONT - CANOPY_BACK + 0.3);
    const colors = [this.mat(0x8e3b8f), this.mat(0xf5efe0)];
    for (let i = 0; i < stripes; i++) {
      const stripe = this.mesh(stripeGeo, colors[i % 2]!);
      stripe.position.set(-width / 2 + stripeWidth * (i + 0.5), CANOPY_HEIGHT, (CANOPY_FRONT + CANOPY_BACK) / 2);
    }
  }

  override dispose(): void {
    this.display.dispose();
    super.dispose();
  }
}
