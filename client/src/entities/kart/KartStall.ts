import * as THREE from "three";
import { KART_COUNTER_OFFSET } from "@jogo/shared/constants";
import { Model } from "../Model";
import { createBannerTexture, createCheckerTexture } from "./raceTextures";

const COUNTER_WIDTH = 1.8;
const COUNTER_DEPTH = 0.7;
const COUNTER_HEIGHT = 0.95;
const PLATE_WIDTH = 1.6;
const PLATE_HEIGHT = 0.42;
/** Pilha de pneus ao lado do balcão (do lado de dentro da barraca). */
const TIRES = { x: 1.35, z: -0.55, radius: 0.32, height: 0.26, count: 4 } as const;
const CANOPY_HEIGHT = 2.6;
const CANOPY_FRONT = COUNTER_DEPTH / 2;
const CANOPY_BACK = -(KART_COUNTER_OFFSET + 0.55);
const GOLD = 0xe9b949;

/**
 * Barraca do Vitinho Queixada: balcão vermelho com a placa, troféu e capacete em cima, uma pilha
 * de pneus e o toldo quadriculado. A origem é o centro do balcão; a frente (clientes) olha para +Z.
 */
export class KartStall extends Model {
  /** Meias-medidas da caixa de colisão do balcão. */
  static readonly HALF_EXTENTS = { x: COUNTER_WIDTH / 2, y: COUNTER_HEIGHT / 2, z: COUNTER_DEPTH / 2 } as const;
  /** Pilha de pneus: centro no espaço do balcão, raio e altura (para o colisor). */
  static readonly TIRE_STACK = { x: TIRES.x, z: TIRES.z, radius: TIRES.radius, height: TIRES.height * TIRES.count } as const;
  /** Onde fica o kart de mostruário, no espaço do balcão, e como ele está virado. */
  static readonly DISPLAY_KART = { x: -1.9, z: -0.2, rotationY: 0.6 } as const;

  constructor(readonly text: string) {
    super();
    const red = this.mat(0xc1121f, false, 0.6);
    const white = this.mat(0xf4f4f4, false, 0.7);
    const black = this.mat(0x1b1b1e, false, 0.8);

    const body = this.mesh(new THREE.BoxGeometry(COUNTER_WIDTH, COUNTER_HEIGHT - 0.06, COUNTER_DEPTH), red);
    body.position.y = (COUNTER_HEIGHT - 0.06) / 2;
    const top = this.mesh(new THREE.BoxGeometry(COUNTER_WIDTH + 0.08, 0.06, COUNTER_DEPTH + 0.08), white);
    top.position.y = COUNTER_HEIGHT - 0.03;

    const texture = this.track(createBannerTexture(text, 1024, Math.round((1024 * PLATE_HEIGHT) / PLATE_WIDTH)));
    const plate = this.mesh(new THREE.PlaneGeometry(PLATE_WIDTH, PLATE_HEIGHT), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }));
    plate.position.set(0, 0.55, COUNTER_DEPTH / 2 + 0.01);

    this.buildTrophy(-0.5);
    this.buildHelmet(0.5, white, black);
    this.buildTires(black, red, white);
    this.buildCanopy(white);
  }

  /** Troféu dourado em cima do balcão. */
  private buildTrophy(x: number): void {
    const gold = this.mat(GOLD, false, 0.25);
    const y = COUNTER_HEIGHT;
    this.mesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), this.mat(0x3b2a1e)).position.set(x, y + 0.03, 0);
    this.mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 8), gold).position.set(x, y + 0.12, 0);
    this.mesh(new THREE.CylinderGeometry(0.09, 0.04, 0.16, 14, 1, true), gold).position.set(x, y + 0.26, 0);
    for (const side of [-1, 1]) {
      const handle = this.mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12), gold);
      handle.position.set(x + side * 0.1, y + 0.27, 0);
    }
  }

  /** Capacete branco com viseira escura. */
  private buildHelmet(x: number, white: THREE.Material, black: THREE.Material): void {
    const shell = this.mesh(new THREE.SphereGeometry(0.15, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), white);
    shell.position.set(x, COUNTER_HEIGHT + 0.06, 0);
    const visor = this.mesh(new THREE.BoxGeometry(0.2, 0.07, 0.04), black);
    visor.position.set(x, COUNTER_HEIGHT + 0.1, 0.13);
  }

  /** Pilha de pneus com uma faixa vermelha e branca. */
  private buildTires(black: THREE.Material, red: THREE.Material, white: THREE.Material): void {
    const tire = new THREE.CylinderGeometry(TIRES.radius, TIRES.radius, TIRES.height - 0.02, 14);
    const stripe = new THREE.CylinderGeometry(TIRES.radius + 0.005, TIRES.radius + 0.005, 0.06, 14);
    for (let i = 0; i < TIRES.count; i++) {
      const y = TIRES.height * (i + 0.5);
      this.mesh(tire, black).position.set(TIRES.x, y, TIRES.z);
      this.mesh(stripe, i % 2 === 0 ? red : white).position.set(TIRES.x, y, TIRES.z);
    }
  }

  /** Quatro postes e um toldo quadriculado, com uma bandeira de chegada num dos postes. */
  private buildCanopy(white: THREE.Material): void {
    const pole = new THREE.CylinderGeometry(0.05, 0.05, CANOPY_HEIGHT, 8);
    const halfWidth = COUNTER_WIDTH / 2 + 0.3;
    for (const x of [-1, 1]) {
      for (const z of [CANOPY_FRONT, CANOPY_BACK]) this.mesh(pole, white).position.set(x * halfWidth, CANOPY_HEIGHT / 2, z);
    }
    const checker = this.track(createCheckerTexture(8, 3));
    const roof = this.mesh(
      new THREE.BoxGeometry(halfWidth * 2 + 0.3, 0.05, CANOPY_FRONT - CANOPY_BACK + 0.3),
      new THREE.MeshStandardMaterial({ map: checker, roughness: 0.8 }),
    );
    roof.position.set(0, CANOPY_HEIGHT, (CANOPY_FRONT + CANOPY_BACK) / 2);

    const flag = this.mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshStandardMaterial({ map: checker, side: THREE.DoubleSide }));
    flag.position.set(-halfWidth - 0.3, CANOPY_HEIGHT - 0.3, CANOPY_FRONT);
  }
}
