import * as THREE from "three";
import { FISH_SPEED } from "@jogo/shared/constants";
import { wrapAngle } from "@jogo/shared/math";
import type { FishData } from "@jogo/shared/protocol";
import { Model } from "../Model";

/** Distância das paredes em que o peixe começa a contornar. */
const WALL_MARGIN = 0.3;
/** Quão rápido o peixe gira para a direção desejada (1/s). */
const TURN_RATE = 3;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Peixe da fonte: modelo de primitivas (~30 cm em escala 1) e nado aleatório.
 * A posição é relativa ao centro da fonte; o nado roda só no cliente (é decorativo).
 */
export class Fish extends Model {
  readonly id: string;
  readonly scale: number;
  private readonly tail = new THREE.Group();
  private readonly speed: number;
  private heading: number;
  private targetHeading: number;
  private turnTimer = rand(0.5, 2);
  private phase = rand(0, Math.PI * 2);

  constructor(
    data: FishData,
    private readonly swimY: number,
  ) {
    super();
    this.id = data.id;
    this.scale = data.scale;
    // Peixes menores nadam um pouco mais rápido.
    this.speed = (FISH_SPEED * rand(0.8, 1.2)) / Math.sqrt(data.scale);
    this.heading = data.rotationY;
    this.targetHeading = data.rotationY;
    this.root.scale.setScalar(data.scale);
    this.root.position.set(data.position.x, swimY, data.position.z);
    this.root.rotation.y = this.heading;
    this.build(data.color);
  }

  private build(color: string): void {
    const skin = this.mat(color, false, 0.5);
    const fin = this.mat(new THREE.Color(color).multiplyScalar(0.75), false, 0.5);

    const body = this.mesh(new THREE.SphereGeometry(0.06, 12, 8), skin);
    body.scale.set(0.8, 1.1, 2.3);

    const dorsal = this.mesh(new THREE.ConeGeometry(0.025, 0.07, 4), fin);
    dorsal.position.set(0, 0.07, -0.01);

    // Rabo num grupo à parte para abanar a partir da base.
    this.tail.position.z = -0.12;
    this.root.add(this.tail);
    const tailFin = this.mesh(new THREE.ConeGeometry(0.05, 0.1, 4), fin, this.tail);
    tailFin.rotation.x = Math.PI / 2;
    tailFin.position.z = -0.04;
    tailFin.scale.set(0.35, 1, 1);

    const eye = this.mat(0x111111, false, 0.3);
    const eyeGeo = new THREE.SphereGeometry(0.009, 6, 4);
    for (const x of [-0.045, 0.045]) this.mesh(eyeGeo, eye).position.set(x, 0.02, 0.09);
  }

  /** Nada dentro do anel entre `inner` (coluna central) e `outer` (borda), em metros. */
  update(dt: number, inner: number, outer: number): void {
    const pos = this.root.position;
    const r = Math.hypot(pos.x, pos.z);
    const radial = Math.atan2(pos.x, pos.z);

    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.targetHeading = this.heading + rand(-1.2, 1.2);
      this.turnTimer = rand(1, 3);
    }

    // Perto de uma parede, contorna seguindo a tangente mais próxima da direção atual.
    if (r > outer - WALL_MARGIN || r < inner + WALL_MARGIN) {
      const side = wrapAngle(this.heading - radial) >= 0 ? 1 : -1;
      const away = r > outer - WALL_MARGIN ? 0.5 : -0.5;
      this.targetHeading = radial + side * (Math.PI / 2 + away);
    }

    const turn = wrapAngle(this.targetHeading - this.heading) * Math.min(1, dt * TURN_RATE);
    this.heading = wrapAngle(this.heading + turn);
    pos.x += Math.sin(this.heading) * this.speed * dt;
    pos.z += Math.cos(this.heading) * this.speed * dt;

    // Garantia: nunca sai do anel de água.
    const nr = Math.hypot(pos.x, pos.z);
    if (nr > 0 && (nr > outer || nr < inner)) {
      const k = Math.min(outer, Math.max(inner, nr)) / nr;
      pos.x *= k;
      pos.z *= k;
    }

    this.phase += dt * (6 + this.speed * 12);
    this.tail.rotation.y = Math.sin(this.phase) * 0.5;
    pos.y = this.swimY + Math.sin(this.phase * 0.25) * 0.015;
    this.root.rotation.y = this.heading;
  }

  /** Posição relativa ao centro da fonte (para depuração e testes). */
  get localPosition(): { x: number; z: number } {
    return { x: this.root.position.x, z: this.root.position.z };
  }
}
