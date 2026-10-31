// Validação e sanitização de tudo que chega do cliente. Nunca confie no cliente.
import { MAX_HEIGHT, MAX_MONEY, NAME_MAX_LENGTH, NAME_MIN_LENGTH, PLAYER_COLORS, PLAYER_RADIUS, WORLD_HALF } from "@jogo/shared/constants";
import { isItemId } from "@jogo/shared/items";
import { isOutfitItemId, OUTFIT_SLOTS, outfitItem, type Outfit } from "@jogo/shared/outfits";
import { isToolId } from "@jogo/shared/tools";
import { canAdd, INVENTORY_ITEM_IDS, INVENTORY_SLOTS, inventoryItem, withItem, type Inventory } from "@jogo/shared/inventory";
import {
  ANIM_STATES,
  type AnimState,
  type BuyOutfitMessage,
  type BuyToolMessage,
  type ChopTreeMessage,
  type SellWoodMessage,
  type FeedAnimalMessage,
  type ShootingShotMessage,
  type StateMessage,
  type TradeMessage,
  type Vec3,
} from "@jogo/shared/protocol";
import { clamp } from "@jogo/shared/math";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Remove HTML, caracteres de controle e espaços extras. Retorna null se o nome for inválido. */
export function sanitizeName(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200) return null;
  const cleaned = value
    .replace(/<[^>]*>/g, "") // tags HTML
    .replace(/[<>&"'`]/g, "") // sobras perigosas
    .replace(/[\u0000-\u001f\u007f]/g, "") // caracteres de controle
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < NAME_MIN_LENGTH || cleaned.length > NAME_MAX_LENGTH) return null;
  return cleaned;
}

export function isValidColor(value: unknown): value is string {
  return typeof value === "string" && (PLAYER_COLORS as readonly string[]).includes(value);
}

/** Valida o formato do `join`. Nome e cor são verificados na sala (para dar o motivo certo). */
export function parseJoin(
  value: unknown,
): { name: unknown; color: unknown; money: number; outfit: Outfit; inventory: Inventory } | null {
  if (!isRecord(value)) return null;
  return {
    name: value.name,
    color: value.color,
    money: parseCount(value.money, MAX_MONEY),
    outfit: parseOutfit(value.outfit),
    inventory: parseInventory(value.inventory),
  };
}

/**
 * Inventário vindo do cliente ao reconectar: só itens do catálogo, em quantidades inteiras, e só o
 * que couber (espaços e limite de ferramentas); o que sobrar é descartado.
 */
export function parseInventory(value: unknown): Inventory {
  let inventory: Inventory = {};
  if (!isRecord(value)) return inventory;
  for (const id of INVENTORY_ITEM_IDS) {
    let wanted = parseCount(value[id], INVENTORY_SLOTS * inventoryItem(id).stack);
    while (wanted > 0 && canAdd(inventory, id)) {
      inventory = withItem(inventory, id, 1);
      wanted--;
    }
  }
  return inventory;
}

/** Roupas vindas do cliente ao reconectar: só fica o item do catálogo que é da parte certa do corpo. */
export function parseOutfit(value: unknown): Outfit {
  const outfit: Outfit = {};
  if (!isRecord(value)) return outfit;
  for (const slot of OUTFIT_SLOTS) {
    const item = value[slot];
    if (isOutfitItemId(item) && outfitItem(item).slot === slot) outfit[slot] = item;
  }
  return outfit;
}

/** Contagem vinda do cliente ao reconectar (peixes, dinheiro): inteiro entre 0 e `max`; senão 0. */
export function parseCount(value: unknown, max: number): number {
  if (!isFiniteNumber(value) || !Number.isInteger(value)) return 0;
  return clamp(value, 0, max);
}

function parseVec3(value: unknown): Vec3 | null {
  if (!isRecord(value)) return null;
  const { x, y, z } = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return null;
  return { x, y, z };
}

function isAnimState(value: unknown): value is AnimState {
  return typeof value === "string" && (ANIM_STATES as readonly string[]).includes(value);
}

/** Valida tipos e limita valores do `state`. Retorna null se a mensagem for malformada. */
export function parseState(value: unknown): StateMessage | null {
  if (!isRecord(value)) return null;
  const position = parseVec3(value.position);
  const velocity = parseVec3(value.velocity);
  const { rotationY, anim } = value;
  if (!position || !velocity || !isFiniteNumber(rotationY) || !isAnimState(anim)) return null;
  return { position: clampToWorld(position), velocity, rotationY, anim };
}

/** Valida o `feedAnimal`. Se o animal existe e come peixe, é conferido no servidor. */
export function parseFeedAnimal(value: unknown): FeedAnimalMessage | null {
  if (!isRecord(value) || typeof value.animalId !== "string" || value.animalId.length > 64) return null;
  return { animalId: value.animalId };
}

/** Valida o `trade`. Distância, dinheiro e estoque são conferidos na sala. */
export function parseTrade(value: unknown): TradeMessage | null {
  if (!isRecord(value) || !isItemId(value.item)) return null;
  if (value.action !== "buy" && value.action !== "sell") return null;
  return { item: value.item, action: value.action };
}

/** Valida o `buyOutfit`. Distância, dinheiro e intervalo são conferidos na loja. */
export function parseBuyOutfit(value: unknown): BuyOutfitMessage | null {
  if (!isRecord(value) || !isOutfitItemId(value.item)) return null;
  return { item: value.item };
}

/** Valida o `buyTool`. Distância, dinheiro, espaço e intervalo são conferidos na loja. */
export function parseBuyTool(value: unknown): BuyToolMessage | null {
  if (!isRecord(value) || !isToolId(value.item)) return null;
  return { item: value.item };
}

/** Valida o `chopTree`. Machado, distância, árvore e espaço são conferidos na floresta. */
export function parseChopTree(value: unknown): ChopTreeMessage | null {
  if (!isRecord(value) || typeof value.treeId !== "string" || value.treeId.length > 64) return null;
  return { treeId: value.treeId };
}

/** Valida o `sellWood`: quantidade inteira e positiva. Se ele tem a madeira é conferido na madeireira. */
export function parseSellWood(value: unknown): SellWoodMessage | null {
  if (!isRecord(value) || !isFiniteNumber(value.amount) || !Number.isInteger(value.amount)) return null;
  const maxWood = INVENTORY_SLOTS * inventoryItem("wood").stack;
  if (value.amount < 1 || value.amount > maxWood) return null;
  return { amount: value.amount };
}

/** Valida o tiro do Tiro ao Alvo. A partida, a distância e o intervalo são conferidos na galeria. */
export function parseShootingShot(value: unknown): ShootingShotMessage | null {
  if (!isRecord(value) || typeof value.hit !== "boolean") return null;
  return { hit: value.hit };
}

/** Mantém a posição dentro do mapa. */
export function clampToWorld(p: Vec3): Vec3 {
  const limit = WORLD_HALF - PLAYER_RADIUS;
  return {
    x: clamp(p.x, -limit, limit),
    y: clamp(p.y, -1, MAX_HEIGHT),
    z: clamp(p.z, -limit, limit),
  };
}

/** Rate limit simples por "balde de fichas". */
export class RateLimiter {
  private tokens: number;
  private last = Date.now();

  constructor(
    private readonly perSecond: number,
    private readonly burst: number,
  ) {
    this.tokens = burst;
  }

  allow(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
