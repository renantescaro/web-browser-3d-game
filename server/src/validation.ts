// Validação e sanitização de tudo que chega do cliente. Nunca confie no cliente.
import { MAX_HEIGHT, NAME_MAX_LENGTH, NAME_MIN_LENGTH, PLAYER_COLORS, PLAYER_RADIUS, WORLD_HALF } from "@jogo/shared/constants";
import { ANIM_STATES, type AnimState, type StateMessage, type Vec3 } from "@jogo/shared/protocol";
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
export function parseJoin(value: unknown): { name: unknown; color: unknown } | null {
  if (!isRecord(value)) return null;
  return { name: value.name, color: value.color };
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
