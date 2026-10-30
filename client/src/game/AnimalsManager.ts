import * as THREE from "three";
import type { AnimalData, AnimalSnapshot } from "@jogo/shared/protocol";
import { wrapAngle } from "@jogo/shared/math";
import type { Animal } from "../entities/Animal";
import { Cat } from "../entities/Cat";
import { Dog } from "../entities/Dog";
import { Horse } from "../entities/Horse";

interface AnimalEntry {
  animal: Animal;
  targetPos: THREE.Vector3;
  targetRotY: number;
}

/** Gerencia instâncias de animais: carrega, recebe snapshots e interpola posições. */
export class AnimalsManager {
  private readonly entries = new Map<string, AnimalEntry>();

  constructor(private readonly scene: THREE.Scene) {}

  load(list: AnimalData[]): void {
    for (const data of list) {
      const animal = this.create(data);
      animal.root.position.set(data.position.x, 0, data.position.z);
      animal.root.rotation.y = data.rotationY;
      this.scene.add(animal.root);
      this.entries.set(data.id, {
        animal,
        targetPos: new THREE.Vector3(data.position.x, 0, data.position.z),
        targetRotY: data.rotationY,
      });
    }
  }

  /** Recebe posições atualizadas do servidor e atualiza os alvos de interpolação. */
  applySnapshot(snapshots: AnimalSnapshot[]): void {
    for (const s of snapshots) {
      const entry = this.entries.get(s.id);
      if (!entry) continue;
      entry.targetPos.set(s.position.x, 0, s.position.z);
      entry.targetRotY = s.rotationY;
    }
  }

  /** Interpola cada animal em direção ao alvo e atualiza a animação. */
  update(dt: number): void {
    for (const entry of this.entries.values()) {
      const pos = entry.animal.root.position;
      const dx = entry.targetPos.x - pos.x;
      const dz = entry.targetPos.z - pos.z;

      // Lerp de posição — acompanha o servidor sem saltar
      const k = Math.min(1, dt * 8);
      pos.x += dx * k;
      pos.z += dz * k;

      // Lerp de rotação com wrap de ângulo
      const rot = entry.animal.root.rotation;
      rot.y += wrapAngle(entry.targetRotY - rot.y) * Math.min(1, dt * 5);

      // Velocidade visual aproximada: proporcional à distância ao alvo
      const dist = Math.hypot(dx, dz);
      entry.animal.update(dt, dist > 0.05 ? 2.0 : 0);
    }
  }

  private create(data: AnimalData): Animal {
    switch (data.type) {
      case "dog":   return new Dog(data.color);
      case "cat":   return new Cat(data.color);
      case "horse": return new Horse(data.color);
    }
  }

  dispose(): void {
    for (const { animal } of this.entries.values()) animal.dispose();
    this.entries.clear();
  }
}
