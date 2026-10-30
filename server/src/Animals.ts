import type { AnimalData, AnimalSnapshot, AnimalType } from "@jogo/shared/protocol";
import {
  ANIMAL_COLORS_HORSE,
  ANIMAL_COLORS_SMALL,
  ANIMAL_FOLLOW_CATCH_UP,
  ANIMAL_FOLLOW_DISTANCE,
  ANIMAL_FOLLOW_MAX_SPEED,
  WORLD_HALF,
} from "@jogo/shared/constants";
import { wrapAngle } from "@jogo/shared/math";

const ANIMAL_SPEED: Record<AnimalType, number> = { dog: 1.8, cat: 1.5, horse: 2.6 };

let nextId = 0;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Agente de animal: mantém estado móvel e encapsula a IA (passear ou seguir um jogador). */
export class AnimalAgent {
  readonly id: string;
  readonly type: AnimalType;
  readonly color: string;
  x: number;
  z: number;
  rotationY: number;
  /** Jogador que o animal segue depois de ganhar peixe. */
  followingId: string | null = null;
  private readonly speed: number;
  private targetAngle: number;
  private turnTimer: number;

  constructor(data: AnimalData) {
    this.id = data.id;
    this.type = data.type;
    this.color = data.color;
    this.x = data.position.x;
    this.z = data.position.z;
    this.rotationY = data.rotationY;
    this.speed = ANIMAL_SPEED[data.type];
    this.targetAngle = data.rotationY;
    this.turnTimer = rand(1, 4);
  }

  /** `leader` é a posição do jogador seguido; null se ele saiu (aí volta a passear). */
  update(dt: number, leader: { x: number; z: number } | null): void {
    if (!leader) {
      this.followingId = null;
      this.wander(dt);
    } else {
      this.follow(dt, leader);
    }
  }

  /** Vai atrás do jogador, mais rápido quanto mais longe estiver, e espera parado quando perto. */
  private follow(dt: number, leader: { x: number; z: number }): void {
    const dx = leader.x - this.x;
    const dz = leader.z - this.z;
    const gap = Math.hypot(dx, dz) - ANIMAL_FOLLOW_DISTANCE;
    if (gap <= 0) return;
    const dist = gap + ANIMAL_FOLLOW_DISTANCE;
    this.targetAngle = Math.atan2(dx, dz);
    this.rotationY += wrapAngle(this.targetAngle - this.rotationY) * Math.min(1, dt * 6);
    const speed = Math.min(ANIMAL_FOLLOW_MAX_SPEED, this.speed + gap * ANIMAL_FOLLOW_CATCH_UP);
    const step = Math.min(gap, speed * dt);
    this.x += (dx / dist) * step;
    this.z += (dz / dist) * step;
  }

  private wander(dt: number): void {
    // Muda de direção aleatoriamente
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.targetAngle += rand(-Math.PI * 0.8, Math.PI * 0.8);
      this.turnTimer = rand(2, 6);
    }

    // Redireciona para o centro quando se aproxima da borda
    const margin = 25;
    if (Math.abs(this.x) > WORLD_HALF - margin || Math.abs(this.z) > WORLD_HALF - margin) {
      this.targetAngle = Math.atan2(-this.x, -this.z);
    }

    // Gira suavemente em direção ao ângulo alvo
    this.rotationY += wrapAngle(this.targetAngle - this.rotationY) * Math.min(1, dt * 2.5);

    // Avança
    this.x += Math.sin(this.rotationY) * this.speed * dt;
    this.z += Math.cos(this.rotationY) * this.speed * dt;
  }

  /** Dados estáticos para o WelcomeMessage (posição atual no momento do join). */
  toData(): AnimalData {
    return { id: this.id, type: this.type, color: this.color, position: { x: this.x, y: 0, z: this.z }, rotationY: this.rotationY };
  }

  snapshot(): AnimalSnapshot {
    return { id: this.id, position: { x: this.x, y: 0, z: this.z }, rotationY: this.rotationY, followingId: this.followingId };
  }
}

function spawnGroup(type: AnimalType, colors: readonly string[]): AnimalAgent[] {
  const count = Math.floor(Math.random() * 3) + 1;
  return Array.from({ length: count }, () => {
    const data: AnimalData = {
      id: `animal-${nextId++}`,
      type,
      color: pick(colors),
      position: { x: rand(-WORLD_HALF + 15, WORLD_HALF - 15), y: 0, z: rand(-WORLD_HALF + 15, WORLD_HALF - 15) },
      rotationY: rand(0, Math.PI * 2),
    };
    return new AnimalAgent(data);
  });
}

export function generateAnimals(): AnimalAgent[] {
  return [
    ...spawnGroup("dog", ANIMAL_COLORS_SMALL),
    ...spawnGroup("cat", ANIMAL_COLORS_SMALL),
    ...spawnGroup("horse", ANIMAL_COLORS_HORSE),
  ];
}
