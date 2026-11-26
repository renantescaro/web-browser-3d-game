import * as THREE from "three";
import type { TreeType } from "@jogo/shared/protocol";
import { TreeModels } from "./TreeModels";

/**
 * Árvore em pé: cópia de um modelo do `TreeModels` (geometria e materiais compartilhados).
 * A escala sorteada pelo servidor é aplicada no `root`.
 */
export class Tree {
  readonly root = new THREE.Group();
  /** Raio do tronco em escala 1; usado no colisor. */
  readonly trunkRadius: number;
  /** Altura total em escala 1; usada no colisor. */
  readonly height: number;

  constructor(type: TreeType, variant: number, scale: number) {
    const template = TreeModels.tree(type, variant);
    this.trunkRadius = template.trunkRadius;
    this.height = template.height;
    this.root.add(template.object.clone());
    this.root.scale.setScalar(scale);
  }

  /** Só tira da cena: os recursos são do modelo compartilhado. */
  dispose(): void {
    this.root.removeFromParent();
  }
}
