// Catálogo de itens que o comerciante compra e vende. Para um item novo: adicione aqui
// (o comerciante passa a ter estoque dele) e diga onde o jogador o guarda em `server/src/Room.ts`.

export interface ItemInfo {
  /** Nome na interface. */
  name: string;
  emoji: string;
  /** Preços em reais, do ponto de vista do jogador: `buy` = paga ao comprar; `sell` = recebe ao vender. */
  price: { buy: number; sell: number };
  /** Estoque do comerciante quando o servidor inicia e o máximo que ele guarda. */
  stock: { initial: number; max: number };
}

export const ITEMS = {
  fish: { name: "Peixe", emoji: "🐟", price: { buy: 1, sell: 1 }, stock: { initial: 5, max: 50 } },
} satisfies Record<string, ItemInfo>;

export type ItemId = keyof typeof ITEMS;
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function isItemId(value: unknown): value is ItemId {
  return typeof value === "string" && (ITEM_IDS as string[]).includes(value);
}
