import type RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import type { TreeData, TreeType } from "@jogo/shared/protocol";
import { Oak } from "../entities/trees/Oak";
import { Pine } from "../entities/trees/Pine";
import type { Tree } from "../entities/trees/Tree";
import type { Physics } from "./Physics";

/** Fábrica por tipo: para uma árvore nova, crie a classe e registre aqui. */
const TREE_FACTORIES: Record<TreeType, (scale: number) => Tree> = {
  oak: (scale) => new Oak(scale),
  pine: (scale) => new Pine(scale),
};

interface TreeEntry {
  data: TreeData;
  tree: Tree;
  collider: RAPIER.Collider;
}

/** Cria as árvores recebidas no `welcome`, com malha e colisor do tronco. */
export class TreesManager {
  private entries: TreeEntry[] = [];

  constructor(
    private readonly physics: Physics,
    private readonly scene: THREE.Scene,
  ) {}

  /** Substitui as árvores atuais (no reconectar, o servidor pode ter reiniciado). */
  load(list: TreeData[]): void {
    this.clear();
    for (const data of list) {
      const tree = TREE_FACTORIES[data.type](data.scale);
      tree.build();
      tree.root.position.set(data.position.x, 0, data.position.z);
      tree.root.rotation.y = data.rotationY;
      this.scene.add(tree.root);
      const collider = this.physics.createStaticCylinder(
        data.position.x,
        data.position.z,
        tree.height * data.scale,
        tree.trunkRadius * data.scale,
      );
      this.entries.push({ data, tree, collider });
    }
  }

  debugInfo(): { type: TreeType; x: number; z: number; scale: number }[] {
    return this.entries.map(({ data }) => ({ type: data.type, x: data.position.x, z: data.position.z, scale: data.scale }));
  }

  clear(): void {
    for (const { tree, collider } of this.entries) {
      tree.dispose();
      this.physics.removeCollider(collider);
    }
    this.entries = [];
  }
}
