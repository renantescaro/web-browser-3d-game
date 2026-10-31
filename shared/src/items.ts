// Itens que o comerciante compra e vende. Nome, emoji e espaço no inventário ficam em
// `inventory.ts`; aqui ficam os preços e o estoque do comerciante.
import type { InventoryItemId } from "./inventory";

export interface ItemInfo {
  /** Preços em reais, do ponto de vista do jogador: `buy` = paga ao comprar; `sell` = recebe ao vender. */
  price: { buy: number; sell: number };
  /** Estoque do comerciante quando o servidor inicia e o máximo que ele guarda. */
  stock: { initial: number; max: number };
}

export const ITEMS = {
  fish: { price: { buy: 1, sell: 1 }, stock: { initial: 5, max: 1000 } },
} satisfies Partial<Record<InventoryItemId, ItemInfo>>;

export type ItemId = keyof typeof ITEMS;
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function isItemId(value: unknown): value is ItemId {
  return typeof value === "string" && (ITEM_IDS as string[]).includes(value);
}
