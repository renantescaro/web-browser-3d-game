import * as THREE from "three";
import { clamp } from "@jogo/shared/math";

/** Trilho por onde os patos andam, no espaço da barraca (+Z = frente). */
export interface DuckLane {
  /** Altura do trilho (base dos patos). */
  y: number;
  z: number;
  /** Meio comprimento do trilho; os patos vão de -half a +half. */
  half: number;
  speed: number;
  /** +1 anda para +X; -1 para -X. */
  direction: 1 | -1;
}

/** Cria um mesh registrado para o `dispose()` (vem do `Model` da barraca). */
export type MeshFactory = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) => THREE.Mesh;

/** Geometrias e materiais compartilhados por todos os patos. */
export interface DuckParts {
  mesh: MeshFactory;
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  beak: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  stick: THREE.BufferGeometry;
  ring: [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry];
  yellow: THREE.Material;
  orange: THREE.Material;
  dark: THREE.Material;
  red: THREE.Material;
  white: THREE.Material;
}

/** Perto das pontas do trilho o pato deita (como se desse a volta por trás). */
const EDGE_FOLD = 0.3;
/** Abaixo desta inclinação (0 = em pé, 1 = deitado) ainda dá para acertar. */
const HITTABLE_TILT = 0.3;
/** Velocidade da queda ao levar um tiro (1/s). */
const KNOCK_SPEED = 9;
const BODY_Y = 0.12;
const BODY_HALF_DEPTH = 0.1;

/**
 * Pato de lata do Tiro ao Alvo, com um alvo pintado dos dois lados. Anda em loop num
 * trilho; ao levar um tiro tomba para trás e só levanta quando dá a volta no trilho.
 * O movimento roda só no cliente (é decorativo): cada jogador vê os seus patos.
 */
export class Duck {
  readonly root = new THREE.Group();
  /** O desenho do pato, que tomba girando em X na base. */
  private readonly figure = new THREE.Group();
  /** Distância percorrida no trilho, em [0, 2·half). */
  private travelled: number;
  private down = false;
  private knock = 0;
  private tilt = 0;

  constructor(
    readonly id: string,
    parts: DuckParts,
    private readonly lane: DuckLane,
    start: number,
  ) {
    this.travelled = start;
    this.root.position.set(0, lane.y, lane.z);
    // O desenho olha para +X; quem anda para -X é espelhado (o alvo continua virado para a frente).
    this.root.scale.x = lane.direction;
    this.root.add(this.figure);
    this.build(parts);
    this.update(0);
  }

  private build(p: DuckParts): void {
    const body = p.mesh(p.body, p.yellow, this.figure);
    body.scale.set(1.5, 0.9, 0.85);
    body.position.y = BODY_Y;
    p.mesh(p.head, p.yellow, this.figure).position.set(0.12, 0.27, 0);
    const beak = p.mesh(p.beak, p.orange, this.figure);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.215, 0.26, 0);
    for (const side of [-1, 1]) {
      p.mesh(p.eye, p.dark, this.figure).position.set(0.16, 0.29, side * 0.06);
      // Alvo pintado no lado do corpo: anel vermelho, branco e centro vermelho.
      const target = new THREE.Group();
      target.position.set(-0.02, BODY_Y, side * (BODY_HALF_DEPTH + 0.004));
      if (side < 0) target.rotation.y = Math.PI;
      p.ring.forEach((geo, i) => {
        p.mesh(geo, i === 1 ? p.white : p.red, target).position.z = i * 0.002;
      });
      this.figure.add(target);
    }
    p.mesh(p.stick, p.dark, this.figure).position.y = -0.08;
  }

  get length(): number {
    return this.lane.half * 2;
  }

  /** Em pé e longe das pontas: dá para acertar. */
  get hittable(): boolean {
    return !this.down && this.tilt < HITTABLE_TILT;
  }

  /** Levou um tiro: tomba até dar a volta no trilho. */
  knockDown(): void {
    this.down = true;
  }

  /** Posição do centro do corpo no mundo (para a depuração e os testes). */
  worldCenter(out = new THREE.Vector3()): THREE.Vector3 {
    return this.root.localToWorld(out.set(0, BODY_Y, 0));
  }

  update(dt: number): void {
    this.travelled += this.lane.speed * dt;
    if (this.travelled >= this.length) {
      this.travelled %= this.length;
      this.down = false;
      this.knock = 0;
    }
    this.root.position.x = this.lane.direction * (this.travelled - this.lane.half);

    this.knock = this.down ? Math.min(1, this.knock + KNOCK_SPEED * dt) : 0;
    const toEdge = Math.min(this.travelled, this.length - this.travelled);
    const fold = clamp(1 - toEdge / EDGE_FOLD, 0, 1);
    this.tilt = Math.max(this.knock, fold);
    this.figure.rotation.x = (-Math.PI / 2) * this.tilt;
  }
}
