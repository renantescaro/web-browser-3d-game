// Inventário do jogador: tudo o que ele carrega (peixes, madeira, ferramentas). Tem
// `INVENTORY_SLOTS` espaços; itens iguais se empilham num espaço até `stack` unidades.
// Item novo: adicione aqui (e, se for vendido, em `items.ts` ou `tools.ts`).
import { MAX_TOOLS, TOOL_IDS, type ToolId } from "./tools";

/** Quantos espaços o inventário tem. */
export const INVENTORY_SLOTS = 8;

export interface InventoryItemInfo {
  /** Nome na interface. */
  name: string;
  emoji: string;
  /** Quantas unidades cabem num espaço (1 = não empilha). */
  stack: number;
}

/** Ordem do catálogo = ordem em que os espaços aparecem na tela. */
export const INVENTORY_ITEMS = {
  fish: { name: "Peixe", emoji: "🐟", stack: 10 },
  wood: { name: "Madeira", emoji: "🪵", stack: 10 },
  axe: { name: "Machado", emoji: "🪓", stack: 1 },
} satisfies Record<string, InventoryItemInfo>;

export type InventoryItemId = keyof typeof INVENTORY_ITEMS;
export const INVENTORY_ITEM_IDS = Object.keys(INVENTORY_ITEMS) as InventoryItemId[];

/** Quantas unidades de cada item o jogador carrega (ausente = 0). */
export type Inventory = Partial<Record<InventoryItemId, number>>;

/** Um espaço ocupado, para mostrar na tela. */
export interface InventorySlot {
  item: InventoryItemId;
  count: number;
}

export function isInventoryItemId(value: unknown): value is InventoryItemId {
  return typeof value === "string" && (INVENTORY_ITEM_IDS as string[]).includes(value);
}

export function inventoryItem(id: InventoryItemId): InventoryItemInfo {
  return INVENTORY_ITEMS[id];
}

export function countOf(inventory: Inventory, id: InventoryItemId): number {
  return inventory[id] ?? 0;
}

/** Os espaços ocupados, na ordem do catálogo (uma pilha cheia por espaço, a sobra no último). */
export function inventorySlots(inventory: Inventory): InventorySlot[] {
  const slots: InventorySlot[] = [];
  for (const item of INVENTORY_ITEM_IDS) {
    let left = countOf(inventory, item);
    const { stack } = inventoryItem(item);
    while (left > 0) {
      const count = Math.min(left, stack);
      slots.push({ item, count });
      left -= count;
    }
  }
  return slots;
}

function toolCount(inventory: Inventory): number {
  return TOOL_IDS.reduce((sum, id: ToolId) => sum + countOf(inventory, id), 0);
}

/** Cabem mais `amount` unidades de `item`? (Espaços livres e, para ferramentas, `MAX_TOOLS`.) */
export function canAdd(inventory: Inventory, item: InventoryItemId, amount = 1): boolean {
  const after = { ...inventory, [item]: countOf(inventory, item) + amount };
  if ((TOOL_IDS as string[]).includes(item) && toolCount(after) > MAX_TOOLS) return false;
  return inventorySlots(after).length <= INVENTORY_SLOTS;
}

/** Novo inventário com `amount` unidades a mais (negativo tira; nunca fica abaixo de 0). */
export function withItem(inventory: Inventory, item: InventoryItemId, amount: number): Inventory {
  const next = { ...inventory };
  const count = Math.max(0, countOf(inventory, item) + amount);
  if (count > 0) next[item] = count;
  else delete next[item];
  return next;
}
