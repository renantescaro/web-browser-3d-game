// Estado da sala: entrada/saída, limite de jogadores, cores únicas, estados, socos, dinheiro e roupas.
import {
  FEED_COOLDOWN_MS,
  FEED_RANGE,
  FISH_CATCH_COOLDOWN_MS,
  FISHING_REACH,
  FOUNTAIN_RADIUS,
  KNOCKBACK_HORIZONTAL,
  MERCHANT_TRADE_RANGE,
  MAX_FISH_CAUGHT,
  KNOCKBACK_UP,
  MAX_MONEY,
  MAX_PLAUSIBLE_SPEED,
  MAX_PLAYERS,
  PLAYER_RADIUS,
  PUNCH_CONE_DEG,
  PUNCH_COOLDOWN_MS,
  PUNCH_RANGE,
  SPAWN_MAX_DISTANCE,
  SPAWN_MIN_DISTANCE,
  TRADE_COOLDOWN_MS,
} from "@jogo/shared/constants";
import { ITEMS, type ItemId } from "@jogo/shared/items";
import type { Outfit } from "@jogo/shared/outfits";
import type { HitMessage, JoinRejectReason, PlayerSnapshot, StateMessage, TradeMessage, Vec3 } from "@jogo/shared/protocol";
import { distanceXZ, forwardFromYaw } from "@jogo/shared/math";
import type { Merchant } from "./Merchant.js";
import { clampToWorld, isValidColor, sanitizeName } from "./validation.js";

interface PlayerRecord {
  snapshot: PlayerSnapshot;
  lastStateAt: number;
  lastPunchAt: number;
  lastFishAt: number;
  lastFeedAt: number;
  lastTradeAt: number;
}

/** Onde cada item fica guardado no jogador e quanto ele pode ter. Item novo: mapeie aqui. */
const INVENTORY: Record<ItemId, { field: "fishCaught"; max: number }> = {
  fish: { field: "fishCaught", max: MAX_FISH_CAUGHT },
};

/** Folga (m) na distância até a fonte, pela latência entre o cliente e o último `state`. */
const FISHING_DISTANCE_SLACK = 1.5;
/** Folga (m) na distância até o animal (latência + interpolação do animal no cliente). */
const FEED_DISTANCE_SLACK = 1.5;
/** Folga (m) na distância até a mesa do comerciante, pela latência. */
const TRADE_DISTANCE_SLACK = 1.5;

export type TradeResult = { money: number; fishCaught: number };

/** O que o cliente reenvia no `join` ao reconectar (já validado). */
export interface SavedProgress {
  fishCaught: number;
  money: number;
  outfit: Outfit;
}

export type JoinResult = { ok: true; player: PlayerSnapshot } | { ok: false; reason: JoinRejectReason };

export class Room {
  private readonly players = new Map<string, PlayerRecord>();

  /** `spawnCenter`: centro da praça (a fonte); todos nascem em volta dela. */
  constructor(private readonly spawnCenter: { x: number; z: number }) {}

  get playerCount(): number {
    return this.players.size;
  }

  has(id: string): boolean {
    return this.players.has(id);
  }

  takenColors(): string[] {
    return [...this.players.values()].map((p) => p.snapshot.color);
  }

  snapshots(): PlayerSnapshot[] {
    return [...this.players.values()].map((p) => p.snapshot);
  }

  join(id: string, rawName: unknown, rawColor: unknown, saved: SavedProgress): JoinResult {
    if (this.players.size >= MAX_PLAYERS) return { ok: false, reason: "full" };
    const name = sanitizeName(rawName);
    if (!name) return { ok: false, reason: "invalidName" };
    if (!isValidColor(rawColor) || this.takenColors().includes(rawColor)) return { ok: false, reason: "colorTaken" };

    const snapshot: PlayerSnapshot = {
      id,
      name,
      color: rawColor,
      ...this.findSpawn(),
      velocity: { x: 0, y: 0, z: 0 },
      anim: "idle",
      fishCaught: saved.fishCaught,
      money: saved.money,
      outfit: { ...saved.outfit },
    };
    this.players.set(id, {
      snapshot,
      lastStateAt: Date.now(),
      lastPunchAt: 0,
      lastFishAt: 0,
      lastFeedAt: 0,
      lastTradeAt: 0,
    });
    return { ok: true, player: snapshot };
  }

  leave(id: string): PlayerSnapshot | null {
    const record = this.players.get(id);
    if (!record) return null;
    this.players.delete(id);
    return record.snapshot;
  }

  /** Aplica o estado enviado pelo cliente, limitando deslocamentos impossíveis. */
  updateState(id: string, state: StateMessage): void {
    const record = this.players.get(id);
    if (!record) return;
    const now = Date.now();
    const dt = Math.max((now - record.lastStateAt) / 1000, 0.001);
    record.lastStateAt = now;

    const prev = record.snapshot.position;
    let next = state.position;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const dist = Math.hypot(dx, dy, dz);
    // Folga de 1 m para variações de latência.
    const maxDist = MAX_PLAUSIBLE_SPEED * dt + 1;
    if (dist > maxDist) {
      const k = maxDist / dist;
      next = clampToWorld({ x: prev.x + dx * k, y: prev.y + dy * k, z: prev.z + dz * k });
    }

    const v = state.velocity;
    const speed = Math.hypot(v.x, v.y, v.z);
    const vk = speed > MAX_PLAUSIBLE_SPEED ? MAX_PLAUSIBLE_SPEED / speed : 1;

    record.snapshot = {
      ...record.snapshot,
      position: next,
      rotationY: state.rotationY,
      velocity: { x: v.x * vk, y: v.y * vk, z: v.z * vk },
      anim: state.anim,
    };
  }

  /** Processa a intenção de soco. Retorna o acerto (se houver) ou null. */
  punch(attackerId: string): HitMessage | null {
    const attacker = this.players.get(attackerId);
    if (!attacker) return null;
    const now = Date.now();
    if (now - attacker.lastPunchAt < PUNCH_COOLDOWN_MS) return null;
    attacker.lastPunchAt = now;

    const a = attacker.snapshot;
    const forward = forwardFromYaw(a.rotationY);
    const minCos = Math.cos(((PUNCH_CONE_DEG / 2) * Math.PI) / 180);
    // Alcance medido até a superfície do alvo, não até o centro.
    const reach = PUNCH_RANGE + PLAYER_RADIUS;

    let best: { id: string; dist: number; dir: { x: number; z: number } } | null = null;
    for (const [id, record] of this.players) {
      if (id === attackerId) continue;
      const t = record.snapshot.position;
      const dx = t.x - a.position.x;
      const dz = t.z - a.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach || Math.abs(t.y - a.position.y) > 1.2) continue;
      // Sobrepostos: conta como acerto na direção em que o atacante olha.
      const dir = dist < 0.01 ? forward : { x: dx / dist, z: dz / dist };
      const cos = dir.x * forward.x + dir.z * forward.z;
      if (cos < minCos) continue;
      if (!best || dist < best.dist) best = { id, dist, dir };
    }
    if (!best) return null;

    const knockback: Vec3 = {
      x: best.dir.x * KNOCKBACK_HORIZONTAL,
      y: KNOCKBACK_UP,
      z: best.dir.z * KNOCKBACK_HORIZONTAL,
    };
    return { attackerId, targetId: best.id, knockback };
  }

  /**
   * O cliente diz que pescou um peixe. Só conta se o jogador estiver junto à fonte
   * e respeitar o intervalo mínimo. Retorna a nova contagem ou null se recusado.
   */
  catchFish(id: string, fountain: Vec3): number | null {
    const record = this.players.get(id);
    if (!record) return null;
    const now = Date.now();
    if (now - record.lastFishAt < FISH_CATCH_COOLDOWN_MS) return null;
    const maxDist = FOUNTAIN_RADIUS + FISHING_REACH + FISHING_DISTANCE_SLACK;
    if (distanceXZ(record.snapshot.position, fountain) > maxDist) return null;
    record.lastFishAt = now;
    const fishCaught = Math.min(record.snapshot.fishCaught + 1, MAX_FISH_CAUGHT);
    record.snapshot = { ...record.snapshot, fishCaught };
    return fishCaught;
  }

  /** Posição atual do jogador (usada pelos animais que o seguem), ou null se ele saiu. */
  positionOf(id: string): Vec3 | null {
    return this.players.get(id)?.snapshot.position ?? null;
  }

  /**
   * O jogador quer dar um peixe a um animal em `target`. Só vale se ele tiver peixe,
   * estiver perto do animal e respeitar o intervalo. Retorna a nova contagem ou null se recusado.
   */
  giveFish(id: string, target: { x: number; z: number }): number | null {
    const record = this.players.get(id);
    if (!record || record.snapshot.fishCaught <= 0) return null;
    const now = Date.now();
    if (now - record.lastFeedAt < FEED_COOLDOWN_MS) return null;
    if (distanceXZ(record.snapshot.position, target) > FEED_RANGE + FEED_DISTANCE_SLACK) return null;
    record.lastFeedAt = now;
    const fishCaught = record.snapshot.fishCaught - 1;
    record.snapshot = { ...record.snapshot, fishCaught };
    return fishCaught;
  }

  /**
   * Compra ou venda de uma unidade com o comerciante. Só vale perto da mesa, respeitando o
   * intervalo, com dinheiro (ou o item) suficiente e estoque (ou espaço nele).
   * Retorna o novo dinheiro e inventário do jogador, ou null se recusado.
   */
  trade(id: string, { item, action }: TradeMessage, merchant: Merchant): TradeResult | null {
    const record = this.players.get(id);
    if (!record) return null;
    const now = Date.now();
    if (now - record.lastTradeAt < TRADE_COOLDOWN_MS) return null;
    if (distanceXZ(record.snapshot.position, merchant.table) > MERCHANT_TRADE_RANGE + TRADE_DISTANCE_SLACK) return null;

    const { field, max } = INVENTORY[item];
    const owned = record.snapshot[field];
    let { money } = record.snapshot;
    if (action === "buy") {
      const price = ITEMS[item].price.buy;
      if (money < price || owned >= max || !merchant.hasStock(item)) return null;
      money -= price;
    } else {
      const price = ITEMS[item].price.sell;
      if (owned <= 0 || money + price > MAX_MONEY || !merchant.hasRoom(item)) return null;
      money += price;
    }
    const delta = action === "buy" ? 1 : -1;
    merchant.changeStock(item, -delta);
    record.lastTradeAt = now;
    record.snapshot = { ...record.snapshot, money, [field]: owned + delta };
    return { money, fishCaught: record.snapshot.fishCaught };
  }

  /** Desconta `amount` do dinheiro do jogador, se ele tiver. Retorna o novo saldo ou null se recusado. */
  spendMoney(id: string, amount: number): number | null {
    const record = this.players.get(id);
    if (!record || record.snapshot.money < amount) return null;
    const money = record.snapshot.money - amount;
    record.snapshot = { ...record.snapshot, money };
    return money;
  }

  /** Soma `amount` ao dinheiro do jogador (até `MAX_MONEY`). Retorna o novo saldo ou null se ele saiu. */
  earnMoney(id: string, amount: number): number | null {
    const record = this.players.get(id);
    if (!record) return null;
    const money = Math.min(record.snapshot.money + amount, MAX_MONEY);
    record.snapshot = { ...record.snapshot, money };
    return money;
  }

  /** Roupas que o jogador veste, ou null se ele saiu. */
  outfitOf(id: string): Outfit | null {
    return this.players.get(id)?.snapshot.outfit ?? null;
  }

  /** Troca as roupas do jogador (a loja já cobrou). */
  setOutfit(id: string, outfit: Outfit): void {
    const record = this.players.get(id);
    if (record) record.snapshot = { ...record.snapshot, outfit: { ...outfit } };
  }

  /** Escolhe um ponto na praça, longe dos outros jogadores, virado para a fonte. */
  private findSpawn(): { position: Vec3; rotationY: number } {
    const { x: cx, z: cz } = this.spawnCenter;
    let position: Vec3 = { x: cx, y: 0, z: cz + SPAWN_MIN_DISTANCE };
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const r = SPAWN_MIN_DISTANCE + Math.random() * (SPAWN_MAX_DISTANCE - SPAWN_MIN_DISTANCE);
      position = { x: cx + Math.sin(angle) * r, y: 0, z: cz + Math.cos(angle) * r };
      const free = [...this.players.values()].every((p) => distanceXZ(p.snapshot.position, position) > PLAYER_RADIUS * 4);
      if (free) break;
    }
    return { position, rotationY: Math.atan2(cx - position.x, cz - position.z) };
  }
}
