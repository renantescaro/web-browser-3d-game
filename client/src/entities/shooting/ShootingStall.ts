import * as THREE from "three";
import {
  SHOOTING_BOOTH_DEPTH,
  SHOOTING_BOOTH_HALF_WIDTH,
  SHOOTING_DUCK_SPEEDS,
  SHOOTING_DUCKS_PER_ROW,
  SHOOTING_OWNER_OFFSET,
} from "@jogo/shared/constants";
import { AirRifle } from "../AirRifle";
import { Model } from "../Model";
import { createWoodTextTexture } from "../textTexture";
import { Duck, type DuckLane, type DuckParts } from "./Duck";

const WIDTH = SHOOTING_BOOTH_HALF_WIDTH * 2;
const DEPTH = SHOOTING_BOOTH_DEPTH;
const COUNTER_HEIGHT = 1.05;
const COUNTER_DEPTH = 0.6;
const WALL_HEIGHT = 2.6;
const WALL_THICKNESS = 0.1;
/** Os trilhos terminam antes do canto do Balotinho, para ele não ficar na linha de tiro. */
const LANE_HALF = SHOOTING_OWNER_OFFSET.x - 0.3;
/** Trilhos: o da frente mais baixo, o do fundo mais alto. */
const ROWS = [
  { y: 1.15, z: -1.9 },
  { y: 1.6, z: -2.7 },
] as const;
const SIGN = { width: 3.2, height: 0.6, y: WALL_HEIGHT + 0.42 };
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = Math.round((TEXTURE_WIDTH * SIGN.height) / SIGN.width);
const BULBS = 9;
const RED = 0xc1121f;
const CREAM = 0xf5efe0;

/**
 * Barraca de Tiro ao Alvo de parque de diversões: balcão com espingardas, paredes, toldo
 * listrado, placa com lâmpadas e dois trilhos de patos no fundo, andando em sentidos opostos.
 * A origem é o centro do balcão; a frente (lado dos clientes) olha para +Z.
 */
export class ShootingStall extends Model {
  /** Caixa de colisão: o balcão e todo o interior (ninguém entra na barraca). */
  static readonly COLLIDER = {
    offsetZ: (COUNTER_DEPTH / 2 - DEPTH) / 2,
    half: { x: SHOOTING_BOOTH_HALF_WIDTH, y: WALL_HEIGHT / 2, z: (DEPTH + COUNTER_DEPTH / 2) / 2 },
  } as const;
  /** Ponto do meio dos trilhos, para onde a mira começa apontando. */
  static readonly AIM_CENTER = { x: 0, y: (ROWS[0].y + ROWS[1].y) / 2 + 0.15, z: (ROWS[0].z + ROWS[1].z) / 2 } as const;

  readonly ducks: Duck[] = [];
  private readonly rifles: AirRifle[] = [];

  constructor(readonly text: string) {
    super();
    const red = this.mat(RED);
    const cream = this.mat(CREAM);
    const wood = this.mat(0x8a5a33);
    this.buildCounter(red, wood);
    this.buildWalls(red);
    this.buildCanopy(red, cream);
    this.buildSign(wood);
    this.buildLanes();
  }

  private buildCounter(red: THREE.Material, wood: THREE.Material): void {
    const body = this.mesh(new THREE.BoxGeometry(WIDTH, COUNTER_HEIGHT - 0.06, COUNTER_DEPTH), red);
    body.position.y = (COUNTER_HEIGHT - 0.06) / 2;
    const top = this.mesh(new THREE.BoxGeometry(WIDTH + 0.1, 0.06, COUNTER_DEPTH + 0.1), wood);
    top.position.y = COUNTER_HEIGHT - 0.03;
    // Faixa creme na frente do balcão.
    const stripe = this.mesh(new THREE.BoxGeometry(WIDTH, 0.12, 0.02), this.mat(CREAM));
    stripe.position.set(0, COUNTER_HEIGHT - 0.25, COUNTER_DEPTH / 2 + 0.01);

    // Espingardas de pressão deitadas no balcão, esperando os clientes.
    for (const x of [-0.9, 0.5]) {
      const rifle = new AirRifle();
      rifle.root.visible = true;
      // Deitada: "cima" da arma para +Y e o cano para +X.
      rifle.root.rotation.set(-Math.PI / 2, Math.PI / 2, 0, "YXZ");
      rifle.root.position.set(x, COUNTER_HEIGHT + 0.02, 0.05);
      this.root.add(rifle.root);
      this.rifles.push(rifle);
    }
  }

  private buildWalls(red: THREE.Material): void {
    const back = this.mesh(new THREE.BoxGeometry(WIDTH, WALL_HEIGHT, WALL_THICKNESS), this.mat(0x3d7ab8));
    back.position.set(0, WALL_HEIGHT / 2, -DEPTH);
    const sideDepth = DEPTH + COUNTER_DEPTH / 2;
    const side = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, sideDepth);
    for (const x of [-1, 1]) {
      this.mesh(side, red).position.set(x * (SHOOTING_BOOTH_HALF_WIDTH - WALL_THICKNESS / 2), WALL_HEIGHT / 2, COUNTER_DEPTH / 2 - sideDepth / 2);
    }
  }

  /** Toldo listrado, um pouco maior que a barraca. */
  private buildCanopy(red: THREE.Material, cream: THREE.Material): void {
    const stripes = 8;
    const width = WIDTH + 0.4;
    const stripeWidth = width / stripes;
    const depth = DEPTH + COUNTER_DEPTH + 0.6;
    const geo = new THREE.BoxGeometry(stripeWidth, 0.06, depth);
    for (let i = 0; i < stripes; i++) {
      this.mesh(geo, i % 2 ? cream : red).position.set(-width / 2 + stripeWidth * (i + 0.5), WALL_HEIGHT, COUNTER_DEPTH / 2 + 0.3 - depth / 2);
    }
  }

  /** Placa com o nome em cima da frente, com lâmpadas acesas embaixo e em cima. */
  private buildSign(wood: THREE.Material): void {
    const z = COUNTER_DEPTH / 2 + 0.3;
    const board = this.mesh(new THREE.BoxGeometry(SIGN.width, SIGN.height, 0.06), wood);
    board.position.set(0, SIGN.y, z);
    const texture = this.track(createWoodTextTexture(this.text, TEXTURE_WIDTH, TEXTURE_HEIGHT));
    const face = this.mesh(
      new THREE.PlaneGeometry(SIGN.width - 0.08, SIGN.height - 0.08),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }),
    );
    face.position.set(0, SIGN.y, z + 0.032);

    const bulbMat = this.track(new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffd23f, emissiveIntensity: 0.9 }));
    const bulb = new THREE.SphereGeometry(0.04, 8, 6);
    for (let i = 0; i < BULBS; i++) {
      const x = -SIGN.width / 2 + 0.15 + ((SIGN.width - 0.3) * i) / (BULBS - 1);
      for (const y of [SIGN.y - SIGN.height / 2 - 0.05, SIGN.y + SIGN.height / 2 + 0.05]) {
        this.mesh(bulb, bulbMat).position.set(x, y, z + 0.03);
      }
    }
  }

  /** Dois trilhos com ondas de madeira na frente (escondem a base dos patos) e os patos. */
  private buildLanes(): void {
    const parts = this.duckParts();
    const wave = new THREE.BoxGeometry(LANE_HALF * 2 + 0.5, 0.3, 0.04);
    const waveMats = [this.mat(0x4895ef), this.mat(0x3a7bd5)];
    ROWS.forEach((row, r) => {
      this.mesh(wave, waveMats[r % 2]!).position.set(0, row.y - 0.11, row.z + 0.16);
      const lane: DuckLane = {
        y: row.y,
        z: row.z,
        half: LANE_HALF,
        speed: SHOOTING_DUCK_SPEEDS[r % SHOOTING_DUCK_SPEEDS.length] ?? 1,
        direction: r % 2 === 0 ? 1 : -1,
      };
      for (let i = 0; i < SHOOTING_DUCKS_PER_ROW; i++) {
        const duck = new Duck(`duck-${r}-${i}`, parts, lane, (LANE_HALF * 2 * i) / SHOOTING_DUCKS_PER_ROW);
        this.root.add(duck.root);
        this.ducks.push(duck);
      }
    });
  }

  private duckParts(): DuckParts {
    return {
      mesh: (geo, mat, parent) => this.mesh(geo, mat, parent),
      body: new THREE.SphereGeometry(0.12, 16, 12),
      head: new THREE.SphereGeometry(0.075, 14, 10),
      beak: new THREE.ConeGeometry(0.03, 0.08, 8),
      eye: new THREE.SphereGeometry(0.014, 6, 4),
      stick: new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6),
      ring: [new THREE.CircleGeometry(0.07, 20), new THREE.CircleGeometry(0.048, 20), new THREE.CircleGeometry(0.024, 14)],
      yellow: this.mat(0xffd23f, false, 0.5),
      orange: this.mat(0xf4a261, false, 0.6),
      dark: this.mat(0x1d1d1d, false, 0.6),
      red: this.mat(0xe63946, false, 0.6),
      white: this.mat(0xffffff, false, 0.6),
    };
  }

  update(dt: number): void {
    for (const duck of this.ducks) duck.update(dt);
  }

  override dispose(): void {
    for (const rifle of this.rifles) rifle.dispose();
    super.dispose();
  }
}
