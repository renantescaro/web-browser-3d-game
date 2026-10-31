import type RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import { CHOP_FACING_DEG, CHOP_RANGE, STUMP_HEIGHT } from "@jogo/shared/constants";
import { distanceXZ, isFacingPoint } from "@jogo/shared/math";
import type { TreeData, TreeType } from "@jogo/shared/protocol";
import { Oak } from "../entities/trees/Oak";
import { Pine } from "../entities/trees/Pine";
import { Stump } from "../entities/trees/Stump";
import type { Tree } from "../entities/trees/Tree";
import type { Physics } from "./Physics";

/** Fábrica por tipo: para uma árvore nova, crie a classe e registre aqui. */
const TREE_FACTORIES: Record<TreeType, (scale: number) => Tree> = {
  oak: (scale) => new Oak(scale),
  pine: (scale) => new Pine(scale),
};

/** Balanço da árvore a cada golpe de machado: duração (s), amplitude (rad) e frequência (rad/s). */
const SHAKE = { duration: 0.35, amplitude: 0.035, frequency: 45 } as const;

interface TreeEntry {
  data: TreeData;
  /** A árvore em pé ou, depois de derrubada, o toco. */
  model: Tree | Stump;
  collider: RAPIER.Collider;
  /** Tempo restante do balanço (s). */
  shake: number;
}

/** Cria as árvores recebidas no `welcome`, com malha e colisor do tronco, e as troca por tocos. */
export class TreesManager {
  private entries: TreeEntry[] = [];

  constructor(
    private readonly physics: Physics,
    private readonly scene: THREE.Scene,
  ) {}

  /** Substitui as árvores atuais (no reconectar, o servidor pode ter reiniciado). */
  load(list: TreeData[]): void {
    this.clear();
    for (const data of list) this.entries.push(this.build({ ...data }));
  }

  private build(data: TreeData): TreeEntry {
    const tree = TREE_FACTORIES[data.type](data.scale);
    const radius = tree.trunkRadius;
    let model: Tree | Stump = tree;
    let height = tree.height;
    if (data.chopped) {
      tree.dispose();
      model = new Stump(radius, data.scale);
      height = STUMP_HEIGHT;
    } else {
      tree.build();
    }
    model.root.position.set(data.position.x, 0, data.position.z);
    model.root.rotation.y = data.rotationY;
    this.scene.add(model.root);
    const collider = this.physics.createStaticCylinder(
      data.position.x,
      data.position.z,
      height * data.scale,
      radius * data.scale,
    );
    return { data, model, collider, shake: 0 };
  }

  /** Alguém derrubou a árvore: troca por um toco (com colisor mais baixo). */
  chop(id: string): void {
    const index = this.entries.findIndex((e) => e.data.id === id);
    const entry = this.entries[index];
    if (!entry || entry.data.chopped) return;
    entry.model.dispose();
    this.physics.removeCollider(entry.collider);
    this.entries[index] = this.build({ ...entry.data, chopped: true });
  }

  /** Árvore em pé à frente do jogador, perto o bastante para cortar (a mais próxima), ou null. */
  chopTarget(player: { x: number; z: number }, rotationY: number): string | null {
    let best: { id: string; dist: number } | null = null;
    for (const { data } of this.entries) {
      if (data.chopped || !isFacingPoint(player, rotationY, data.position, CHOP_RANGE, CHOP_FACING_DEG)) continue;
      const dist = distanceXZ(player, data.position);
      if (!best || dist < best.dist) best = { id: data.id, dist };
    }
    return best?.id ?? null;
  }

  /** A árvore ainda está em pé? */
  isStanding(id: string): boolean {
    const entry = this.entries.find((e) => e.data.id === id);
    return entry !== undefined && !entry.data.chopped;
  }

  position(id: string): { x: number; z: number } | null {
    const p = this.entries.find((e) => e.data.id === id)?.data.position;
    return p ? { x: p.x, z: p.z } : null;
  }

  /** A árvore balança com um golpe de machado. */
  shake(id: string): void {
    const entry = this.entries.find((e) => e.data.id === id);
    if (entry) entry.shake = SHAKE.duration;
  }

  update(dt: number): void {
    for (const entry of this.entries) {
      if (entry.shake <= 0) continue;
      entry.shake = Math.max(0, entry.shake - dt);
      const fade = entry.shake / SHAKE.duration;
      entry.model.root.rotation.z = Math.sin(entry.shake * SHAKE.frequency) * SHAKE.amplitude * fade;
    }
  }

  debugInfo(): { id: string; type: TreeType; x: number; z: number; scale: number; chopped: boolean }[] {
    return this.entries.map(({ data }) => ({
      id: data.id,
      type: data.type,
      x: data.position.x,
      z: data.position.z,
      scale: data.scale,
      chopped: data.chopped,
    }));
  }

  clear(): void {
    for (const { model, collider } of this.entries) {
      model.dispose();
      this.physics.removeCollider(collider);
    }
    this.entries = [];
  }
}
