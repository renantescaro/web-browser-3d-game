import type { AnimalData, AnimalSnapshot, AnimalType } from "@jogo/shared/protocol";
import { ANIMAL_COLORS_HORSE, ANIMAL_COLORS_SMALL, WORLD_HALF } from "@jogo/shared/constants";
import { wrapAngle } from "@jogo/shared/math";

const ANIMAL_SPEED: Record<AnimalType, number> = { dog: 1.8, cat: 1.5, horse: 2.6 };

let nextId = 0;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Agente de animal: mantém estado móvel e encapsula a IA de deambulação. */
export class AnimalAgent {
  readonly id: string;
  readonly type: AnimalType;
  readonly color: string;
  x: number;
  z: number;
  rotationY: number;
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

  update(dt: number): void {
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
    return { id: this.id, position: { x: this.x, y: 0, z: this.z }, rotationY: this.rotationY };
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
