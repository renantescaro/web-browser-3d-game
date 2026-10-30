import * as THREE from "three";
import {
  FOUNTAIN_PILLAR_RADIUS,
  FOUNTAIN_RADIUS,
  FOUNTAIN_WALL_HEIGHT,
  FOUNTAIN_WALL_THICKNESS,
} from "@jogo/shared/constants";
import type { FountainData } from "@jogo/shared/protocol";
import { Model } from "../Model";
import { Fish } from "./Fish";

const SEGMENTS = 32;
const WATER_Y = FOUNTAIN_WALL_HEIGHT - 0.12;
const FISH_Y = WATER_Y - 0.09;
const PILLAR_HEIGHT = 1.3;
const BOWL_Y = PILLAR_HEIGHT + 0.12;
/** Folga entre o peixe e as paredes (m). */
const FISH_CLEARANCE = 0.2;

/** Fonte de água redonda com coluna central. Também é o contêiner dos peixes. */
export class Fountain extends Model {
  /** Altura da coluna central com a bacia de cima; usada no colisor. */
  static readonly PILLAR_TOTAL_HEIGHT = BOWL_Y + 0.15;

  readonly fish: Fish[];
  /** Raios do anel de água em que os peixes podem nadar. */
  readonly innerRadius = FOUNTAIN_PILLAR_RADIUS + FISH_CLEARANCE;
  readonly outerRadius = FOUNTAIN_RADIUS - FOUNTAIN_WALL_THICKNESS - FISH_CLEARANCE;
  private readonly jet: THREE.Mesh;
  private time = 0;

  constructor(data: FountainData) {
    super();
    this.root.position.set(data.position.x, 0, data.position.z);
    this.buildBasin();
    this.jet = this.buildPillar();
    this.fish = data.fish.map((f) => new Fish(f, FISH_Y));
    for (const f of this.fish) this.root.add(f.root);
  }

  private buildBasin(): void {
    const stone = this.mat(0xd8d2c4);
    const inner = FOUNTAIN_RADIUS - FOUNTAIN_WALL_THICKNESS;
    const h = FOUNTAIN_WALL_HEIGHT;

    const outerGeo = new THREE.CylinderGeometry(FOUNTAIN_RADIUS, FOUNTAIN_RADIUS + 0.08, h, SEGMENTS, 1, true);
    this.mesh(outerGeo, stone).position.y = h / 2;

    // Parede interna vista por dentro (BackSide).
    const innerMat = this.mat(0xa59e8e);
    innerMat.side = THREE.BackSide;
    this.mesh(new THREE.CylinderGeometry(inner, inner, h, SEGMENTS, 1, true), innerMat).position.y = h / 2;

    const rim = this.mesh(new THREE.RingGeometry(inner, FOUNTAIN_RADIUS + 0.02, SEGMENTS), stone);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = h;

    const bottom = this.mesh(new THREE.CircleGeometry(inner, SEGMENTS), this.mat(0x7fb8b5));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.04;
    bottom.castShadow = false;

    this.addWater(inner, WATER_Y);
  }

  /** Coluna central com uma bacia pequena e um jato d'água. Devolve o jato. */
  private buildPillar(): THREE.Mesh {
    const stone = this.mat(0xd8d2c4);
    const pillarGeo = new THREE.CylinderGeometry(FOUNTAIN_PILLAR_RADIUS * 0.8, FOUNTAIN_PILLAR_RADIUS, PILLAR_HEIGHT, 16);
    this.mesh(pillarGeo, stone).position.y = PILLAR_HEIGHT / 2;
    this.mesh(new THREE.CylinderGeometry(0.75, 0.35, 0.25, 20), stone).position.y = BOWL_Y;
    this.addWater(0.68, BOWL_Y + 0.11);

    const jetMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55, roughness: 0.1 });
    const jet = this.mesh(new THREE.ConeGeometry(0.12, 0.7, 10, 1, true), jetMat);
    jet.position.y = BOWL_Y + 0.45;
    jet.rotation.x = Math.PI;
    jet.castShadow = false;
    return jet;
  }

  private addWater(radius: number, y: number): void {
    const water = new THREE.MeshStandardMaterial({ color: 0x4aa3c9, transparent: true, opacity: 0.4, roughness: 0.15 });
    const m = this.mesh(new THREE.CircleGeometry(radius, SEGMENTS), water);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.castShadow = false;
  }

  /** Anima o jato e faz os peixes nadarem. */
  update(dt: number): void {
    this.time += dt;
    this.jet.scale.y = 1 + Math.sin(this.time * 5) * 0.08;
    for (const f of this.fish) f.update(dt, this.innerRadius, this.outerRadius);
  }

  override dispose(): void {
    for (const f of this.fish) f.dispose();
    super.dispose();
  }
}
