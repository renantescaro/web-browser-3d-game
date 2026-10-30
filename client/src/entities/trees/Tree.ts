import { Model } from "../Model";

/**
 * Classe base das árvores. Cada tipo monta o modelo em tamanho base (escala 1);
 * a escala sorteada pelo servidor é aplicada no `root`.
 */
export abstract class Tree extends Model {
  /** Raio do tronco em escala 1; usado no colisor. */
  abstract readonly trunkRadius: number;
  /** Altura total em escala 1; usada no colisor. */
  abstract readonly height: number;

  constructor(scale: number) {
    super();
    this.root.scale.setScalar(scale);
  }

  /** Monta o modelo. Chamado pela fábrica logo após o construtor. */
  abstract build(): void;
}
