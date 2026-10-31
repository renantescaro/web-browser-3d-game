// Validação e sanitização de tudo que chega do cliente. Nunca confie no cliente.
import { MAX_FISH_CAUGHT, MAX_HEIGHT, MAX_MONEY, NAME_MAX_LENGTH, NAME_MIN_LENGTH, PLAYER_COLORS, PLAYER_RADIUS, WORLD_HALF } from "@jogo/shared/constants";
import { isItemId } from "@jogo/shared/items";
import {
  ANIM_STATES,
  type AnimState,
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
): { name: unknown; color: unknown; fishCaught: number; money: number } | null {
  if (!isRecord(value)) return null;
  return {
    name: value.name,
    color: value.color,
    fishCaught: parseCount(value.fishCaught, MAX_FISH_CAUGHT),
    money: parseCount(value.money, MAX_MONEY),
  };
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
