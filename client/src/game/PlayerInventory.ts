// O inventário do jogador local, como o servidor mandou (welcome ou `inventory`). Pesca, corte,
// lojas e HUD leem daqui; quem quer saber das mudanças se inscreve em `onChange`.
import { canAdd, countOf, type Inventory, type InventoryItemId } from "@jogo/shared/inventory";
import type { Network } from "../net/Network";

/** Aviso mostrado quando não cabe mais nada. */
export const INVENTORY_FULL_NOTICE = "🎒 Inventário cheio!";

export class PlayerInventory {
  private items: Inventory = {};
  private readonly listeners: ((inventory: Inventory) => void)[] = [];

  constructor(private readonly network: Network) {}

  get current(): Inventory {
    return this.items;
  }

  /** Inventário vindo do servidor: guarda para a reconexão e avisa os inscritos. */
  set(inventory: Inventory): void {
    this.items = { ...inventory };
    this.network.rememberInventory(this.items);
    for (const listener of this.listeners) listener(this.items);
  }

  onChange(listener: (inventory: Inventory) => void): void {
    this.listeners.push(listener);
  }

  count(item: InventoryItemId): number {
    return countOf(this.items, item);
  }

  /** Cabem mais `amount` unidades? (O servidor confere de novo.) */
  canAdd(item: InventoryItemId, amount = 1): boolean {
    return canAdd(this.items, item, amount);
  }
}
