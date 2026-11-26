import * as THREE from "three";
import { STUMP_HEIGHT } from "@jogo/shared/constants";
import { TreeModels } from "./TreeModels";

/** Quanto o toco é mais largo que o tronco da árvore (a madeira alarga perto das raízes). */
const STUMP_WIDEN = 1.15;

/**
 * Toco que fica no lugar de uma árvore derrubada: o modelo de toco do `TreeModels`, esticado
 * para a largura do tronco dessa árvore e a altura `STUMP_HEIGHT` (em escala 1; a escala da
 * árvore é aplicada no `root`).
 */
export class Stump {
  readonly root = new THREE.Group();

  constructor(radius: number, scale: number) {
    const template = TreeModels.stump();
    const model = template.object.clone();
    const widen = (radius * STUMP_WIDEN) / template.trunkRadius;
    model.scale.set(widen, STUMP_HEIGHT / template.height, widen);
    this.root.add(model);
    this.root.scale.setScalar(scale);
  }

  /** Só tira da cena: os recursos são do modelo compartilhado. */
  dispose(): void {
    this.root.removeFromParent();
  }
}
