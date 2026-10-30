import * as THREE from "three";
import { FEED_FACING_DEG, FEED_RANGE } from "@jogo/shared/constants";
import { FISH_EATING_ANIMALS, type AnimalData, type AnimalSnapshot, type AnimalType } from "@jogo/shared/protocol";
import { distanceXZ, forwardFromYaw, wrapAngle } from "@jogo/shared/math";
import type { Animal } from "../entities/Animal";
import { Cat } from "../entities/Cat";
import { Dog } from "../entities/Dog";
import { Horse } from "../entities/Horse";

interface AnimalEntry {
  animal: Animal;
  type: AnimalType;
  targetPos: THREE.Vector3;
  targetRotY: number;
  followingId: string | null;
}

export interface AnimalDebugInfo {
  id: string;
  type: AnimalType;
  x: number;
  z: number;
  followingId: string | null;
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
        type: data.type,
        targetPos: new THREE.Vector3(data.position.x, 0, data.position.z),
        targetRotY: data.rotationY,
        followingId: null,
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
      entry.followingId = s.followingId;
    }
  }

  /**
   * Gato ou cachorro mais próximo à frente do jogador, ao alcance para ganhar peixe.
   * Ignora os que já seguem o jogador `selfId`.
   */
  feedTarget(player: { x: number; z: number }, rotationY: number, selfId: string): string | null {
    const forward = forwardFromYaw(rotationY);
    const minCos = Math.cos(((FEED_FACING_DEG / 2) * Math.PI) / 180);
    let best: { id: string; dist: number } | null = null;
    for (const [id, entry] of this.entries) {
      if (!FISH_EATING_ANIMALS.includes(entry.type) || entry.followingId === selfId) continue;
      const pos = entry.animal.root.position;
      const dist = distanceXZ(player, pos);
      if (dist > FEED_RANGE) continue;
      const cos = dist < 0.01 ? 1 : (forward.x * (pos.x - player.x) + forward.z * (pos.z - player.z)) / dist;
      if (cos < minCos) continue;
      if (!best || dist < best.dist) best = { id, dist };
    }
    return best?.id ?? null;
  }

  /** Coração acima do animal que ganhou peixe. */
  playHeart(id: string): void {
    this.entries.get(id)?.animal.playHeart();
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

  debugInfo(): AnimalDebugInfo[] {
    return [...this.entries].map(([id, e]) => ({
      id,
      type: e.type,
      x: e.animal.root.position.x,
      z: e.animal.root.position.z,
      followingId: e.followingId,
    }));
  }

  dispose(): void {
    for (const { animal } of this.entries.values()) animal.dispose();
    this.entries.clear();
  }
}
