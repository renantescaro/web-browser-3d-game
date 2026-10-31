// Catálogo de roupas e acessórios que a Deendi vende. Cada item ocupa uma parte do corpo
// (`slot`) e o jogador veste no máximo um item por parte: comprar outro da mesma parte troca.
// Item novo: adicione aqui e crie o modelo em `client/src/entities/wearables/wearableModels.ts`.
// Parte do corpo nova: adicione em `OUTFIT_SLOTS` e diga onde ela fica no `Character`.

/** Partes do corpo que recebem roupas e acessórios. */
export const OUTFIT_SLOTS = ["head", "eyes", "feet"] as const;
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];

/** Nome de cada parte do corpo na interface. */
export const OUTFIT_SLOT_NAMES: Record<OutfitSlot, string> = {
  head: "Cabeça",
  eyes: "Olhos",
  feet: "Pés",
};

export interface OutfitItemInfo {
  /** Nome na interface. */
  name: string;
  emoji: string;
  slot: OutfitSlot;
  /** Preço em reais. */
  price: number;
}

export const OUTFIT_ITEMS = {
  topHat: { name: "Cartola", emoji: "🎩", slot: "head", price: 50 },
  cap: { name: "Boné", emoji: "🧢", slot: "head", price: 30 },
  glasses: { name: "Óculos", emoji: "👓", slot: "eyes", price: 30 },
  boots: { name: "Bota", emoji: "👢", slot: "feet", price: 50 },
} satisfies Record<string, OutfitItemInfo>;

export type OutfitItemId = keyof typeof OUTFIT_ITEMS;
export const OUTFIT_ITEM_IDS = Object.keys(OUTFIT_ITEMS) as OutfitItemId[];

/** O que um personagem veste: no máximo um item por parte do corpo. */
export type Outfit = Partial<Record<OutfitSlot, OutfitItemId>>;

export function isOutfitItemId(value: unknown): value is OutfitItemId {
  return typeof value === "string" && (OUTFIT_ITEM_IDS as string[]).includes(value);
}

export function outfitItem(id: OutfitItemId): OutfitItemInfo {
  return OUTFIT_ITEMS[id];
}

/** Itens à venda de uma parte do corpo, na ordem do catálogo. */
export function itemsOfSlot(slot: OutfitSlot): OutfitItemId[] {
  return OUTFIT_ITEM_IDS.filter((id) => outfitItem(id).slot === slot);
}

/** Veste `item`, trocando o que estiver na mesma parte do corpo. */
export function wear(outfit: Outfit, item: OutfitItemId): Outfit {
  return { ...outfit, [outfitItem(item).slot]: item };
}

/** Já veste exatamente este item? */
export function isWearing(outfit: Outfit, item: OutfitItemId): boolean {
  return outfit[outfitItem(item).slot] === item;
}
