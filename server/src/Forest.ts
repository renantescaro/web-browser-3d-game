// As árvores do mapa e quem as derruba. O minigame de cortar roda no cliente; ao acertar, ele
// manda `chopTree` e o servidor confere machado, distância, árvore em pé, intervalo e espaço.
import { CHOP_COOLDOWN_MS, CHOP_RANGE, WOOD_PER_TREE } from "@jogo/shared/constants";
import { canAdd, countOf, withItem, type Inventory } from "@jogo/shared/inventory";
import { distanceXZ } from "@jogo/shared/math";
import type { TreeData } from "@jogo/shared/protocol";
import type { Room } from "./Room.js";

/** Folga (m) na distância até o tronco, pela latência. */
const DISTANCE_SLACK = 1.5;

export class Forest {
  private readonly lastChopAt = new Map<string, number>();

  constructor(
    private readonly trees: TreeData[],
    private readonly room: Room,
  ) {}

  /** As árvores como estão agora (as derrubadas viram toco), para o `welcome`. */
  snapshot(): TreeData[] {
    return this.trees.map((t) => ({ ...t }));
  }

  /**
   * O jogador derrubou `treeId`. Só vale com machado, perto da árvore ainda em pé, respeitando o
   * intervalo e com espaço para a madeira. Retorna o novo inventário ou null se recusado.
   */
  chop(playerId: string, treeId: string): Inventory | null {
    const tree = this.trees.find((t) => t.id === treeId);
    const position = this.room.positionOf(playerId);
    const inventory = this.room.inventoryOf(playerId);
    if (!tree || tree.chopped || !position || !inventory) return null;
    if (countOf(inventory, "axe") <= 0 || !canAdd(inventory, "wood", WOOD_PER_TREE)) return null;
    const now = Date.now();
    if (now - (this.lastChopAt.get(playerId) ?? 0) < CHOP_COOLDOWN_MS) return null;
    if (distanceXZ(position, tree.position) > CHOP_RANGE + DISTANCE_SLACK) return null;

    tree.chopped = true;
    this.lastChopAt.set(playerId, now);
    const next = withItem(inventory, "wood", WOOD_PER_TREE);
    this.room.setInventory(playerId, next);
    return next;
  }

  /** O jogador saiu: esquece o intervalo dele. */
  forget(playerId: string): void {
    this.lastChopAt.delete(playerId);
  }
}
