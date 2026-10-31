import * as THREE from "three";
import { TOOL_COUNTER_OFFSET } from "@jogo/shared/constants";
import { TOOL_IDS } from "@jogo/shared/tools";
import { Model } from "../Model";
import { createWoodTextTexture } from "../textTexture";
import { WornItem } from "../wearables/WornItem";
import { TOOL_MODELS } from "./toolModels";

const BENCH_WIDTH = 1.7;
const BENCH_DEPTH = 0.75;
const BENCH_HEIGHT = 0.9;
const TOP_THICKNESS = 0.1;
const PLATE_WIDTH = 1.4;
const PLATE_HEIGHT = 0.4;
const PLATE_Y = 0.5;
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = Math.round((TEXTURE_WIDTH * PLATE_HEIGHT) / PLATE_WIDTH);
/** Painel de ferramentas atrás do Gabriel. */
const BOARD = { z: -(TOOL_COUNTER_OFFSET + 0.55), width: 1.8, bottom: 0.7, top: 2.1, thickness: 0.06 } as const;
/** Tora de cortar lenha, ao lado do Gabriel, com um machado cravado. */
const LOG = { x: 1.05, z: -TOOL_COUNTER_OFFSET, radius: 0.24, height: 0.45 } as const;
const CANOPY_HEIGHT = 2.6;
const CANOPY_FRONT = BENCH_DEPTH / 2;
const CANOPY_BACK = BOARD.z - 0.3;

/**
 * Loja de ferramentas do Gabriel: bancada grossa com placa, painel com ferramentas penduradas,
 * tora com um machado cravado e toldo listrado. A origem é o centro da bancada; a frente
 * (clientes) olha para +Z.
 */
export class ToolStall extends Model {
  /** Meias-medidas da caixa de colisão da bancada. */
  static readonly HALF_EXTENTS = { x: BENCH_WIDTH / 2, y: BENCH_HEIGHT / 2, z: BENCH_DEPTH / 2 } as const;
  /** Caixa de colisão do painel: centro no eixo Z da bancada e meias-medidas. */
  static readonly BOARD_BOX = { z: BOARD.z, half: { x: BOARD.width / 2, y: BOARD.top / 2, z: 0.1 } } as const;
  /** Cilindro de colisão da tora, no espaço da bancada. */
  static readonly LOG = LOG;

  /** Ferramentas expostas: os mesmos modelos que o jogador leva. */
  private readonly display = new WornItem();

  constructor(readonly text: string) {
    super();
    const wood = this.mat(0x9a6a3a);
    const darkWood = this.mat(0x5c3b1e);
    this.buildBench(wood, darkWood);

    // Placa pregada na frente da bancada.
    const texture = this.track(createWoodTextTexture(text, TEXTURE_WIDTH, TEXTURE_HEIGHT));
    const plate = this.mesh(new THREE.PlaneGeometry(PLATE_WIDTH, PLATE_HEIGHT), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
    plate.position.set(0, PLATE_Y, BENCH_DEPTH / 2 + 0.01);

    this.buildShowcase();
    this.buildBoard(darkWood);
    this.buildLog();
    this.buildCanopy(darkWood);
  }

  /** Tampo grosso de oficina, pernas e uma prateleira embaixo. */
  private buildBench(wood: THREE.Material, darkWood: THREE.Material): void {
    const top = this.mesh(new THREE.BoxGeometry(BENCH_WIDTH, TOP_THICKNESS, BENCH_DEPTH), wood);
    top.position.y = BENCH_HEIGHT - TOP_THICKNESS / 2;
    const legHeight = BENCH_HEIGHT - TOP_THICKNESS;
    const leg = new THREE.BoxGeometry(0.1, legHeight, 0.1);
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        this.mesh(leg, darkWood).position.set(x * (BENCH_WIDTH / 2 - 0.08), legHeight / 2, z * (BENCH_DEPTH / 2 - 0.08));
      }
    }
    const shelf = this.mesh(new THREE.BoxGeometry(BENCH_WIDTH - 0.1, 0.04, BENCH_DEPTH - 0.1), darkWood);
    shelf.position.y = 0.2;
  }

  /** Uma ferramenta de cada deitada em cima da bancada, com o cabo para o cliente. */
  private buildShowcase(): void {
    const step = BENCH_WIDTH / (TOOL_IDS.length + 1);
    TOOL_IDS.forEach((id, i) => {
      const holder = new THREE.Group();
      holder.position.set(-BENCH_WIDTH / 2 + step * (i + 1), BENCH_HEIGHT + 0.02, -0.33);
      // Deitada: o cabo vem para a frente (+Z) e a lâmina fica de lado.
      holder.rotation.x = Math.PI / 2;
      this.root.add(holder);
      TOOL_MODELS[id](this.display, holder);
    });
  }

  /** Painel com machados pendurados e o contorno de um martelo e de um serrote. */
  private buildBoard(darkWood: THREE.Material): void {
    const height = BOARD.top - BOARD.bottom;
    const panel = this.mesh(new THREE.BoxGeometry(BOARD.width, height, BOARD.thickness), this.mat(0xd8c3a5));
    panel.position.set(0, BOARD.bottom + height / 2, BOARD.z);
    const post = new THREE.BoxGeometry(0.08, BOARD.top, 0.08);
    for (const side of [-1, 1]) this.mesh(post, darkWood).position.set(side * (BOARD.width / 2 + 0.04), BOARD.top / 2, BOARD.z);

    const front = BOARD.z + BOARD.thickness / 2 + 0.03;
    for (const x of [-0.6, -0.25]) {
      const holder = new THREE.Group();
      holder.position.set(x, BOARD.bottom + 0.35, front);
      this.root.add(holder);
      TOOL_MODELS.axe(this.display, holder);
    }

    // Martelo.
    const handle = this.mat(0x7a4b26);
    const steel = this.mat(0x6c757d, false, 0.4);
    const hammerHandle = this.mesh(new THREE.BoxGeometry(0.04, 0.4, 0.03), handle);
    hammerHandle.position.set(0.2, BOARD.bottom + 0.75, front);
    const hammerHead = this.mesh(new THREE.BoxGeometry(0.2, 0.07, 0.06), steel);
    hammerHead.position.set(0.2, BOARD.bottom + 0.97, front);

    // Serrote: lâmina inclinada com o cabo embaixo.
    const saw = new THREE.Group();
    saw.position.set(0.6, BOARD.bottom + 0.75, front);
    saw.rotation.z = 0.15;
    this.root.add(saw);
    this.mesh(new THREE.BoxGeometry(0.18, 0.5, 0.01), this.mat(0xc9ced6, false, 0.3), saw).position.y = 0.15;
    this.mesh(new THREE.BoxGeometry(0.12, 0.14, 0.04), handle, saw).position.y = -0.15;
  }

  /** Tora de cortar lenha com um machado cravado em cima. */
  private buildLog(): void {
    const log = this.mesh(new THREE.CylinderGeometry(LOG.radius, LOG.radius * 1.08, LOG.height, 14), this.mat(0x6f4a2a));
    log.position.set(LOG.x, LOG.height / 2, LOG.z);
    const rings = this.mesh(new THREE.CircleGeometry(LOG.radius * 0.95, 14), this.mat(0xd9b382));
    rings.rotation.x = -Math.PI / 2;
    rings.position.set(LOG.x, LOG.height + 0.002, LOG.z);

    // Cravado de cima: a lâmina para baixo, dentro da madeira, e o cabo saindo para fora da barraca.
    const holder = new THREE.Group();
    holder.position.set(LOG.x + 0.61, LOG.height + 0.31, LOG.z);
    holder.rotation.set(0, Math.PI, -Math.PI / 2 - 0.4);
    this.root.add(holder);
    TOOL_MODELS.axe(this.display, holder);
  }

  /** Quatro postes e um toldo listrado verde e creme. */
  private buildCanopy(wood: THREE.Material): void {
    const pole = new THREE.CylinderGeometry(0.04, 0.04, CANOPY_HEIGHT, 8);
    const halfWidth = BENCH_WIDTH / 2 + 0.25;
    for (const x of [-1, 1]) {
      for (const z of [CANOPY_FRONT, CANOPY_BACK]) this.mesh(pole, wood).position.set(x * halfWidth, CANOPY_HEIGHT / 2, z);
    }
    const width = halfWidth * 2 + 0.3;
    const stripes = 6;
    const stripeWidth = width / stripes;
    const stripeGeo = new THREE.BoxGeometry(stripeWidth, 0.05, CANOPY_FRONT - CANOPY_BACK + 0.3);
    const colors = [this.mat(0x3a5a40), this.mat(0xf5efe0)];
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
