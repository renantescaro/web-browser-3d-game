// Regras da corrida de kart, com autoridade do servidor sobre o dinheiro, as voltas e o resultado.
// O kart anda no cliente (como o personagem); aqui se cobra a entrada, se espera mais pilotos,
// se conta as voltas pelas posições recebidas, se paga o prêmio e se confere as batidas.
import {
  KART_BUMP_COOLDOWN_MS,
  KART_BUMP_KNOCKBACK,
  KART_BUMP_MIN_SPEED,
  KART_COUNTDOWN_MS,
  KART_ENTRY_COST,
  KART_FINISH_GRACE_MS,
  KART_JOIN_RANGE,
  KART_LAPS,
  KART_LOBBY_MS,
  KART_MAX_RACE_MS,
  KART_MAX_SPEED,
  KART_PRIZE,
  KART_RADIUS,
  KART_RESULTS_MS,
  KART_STATE_INTERVAL_MS,
  KNOCKBACK_UP,
  MAX_PLAYERS,
} from "@jogo/shared/constants";
import { KART_HALF_WIDTH, nearestOnPath } from "@jogo/shared/kart";
import { clamp, distanceXZ, forwardFromYaw } from "@jogo/shared/math";
import type { HitMessage, KartPhase, KartRaceMessage, KartRacer } from "@jogo/shared/protocol";
import type { KartTrack } from "./KartTrack.js";
import type { Room } from "./Room.js";

/** Folga (m) na distância até o balcão, pela latência. */
const DISTANCE_SLACK = 1.5;
/** Folga (m) na distância de uma batida (latência entre os dois `state`). */
const BUMP_SLACK = 1.5;
/** Folga (m) em volta da pista: fora dela o movimento não conta volta. */
const TRACK_SLACK = 2;
/** Um salto maior que isto (m) entre dois ticks não é movimento de verdade. */
const MAX_STEP = 20;
/** Quantos pontos do traçado (~1 m cada) procurar para cada lado da última posição conhecida. */
const SEARCH_WINDOW = 30;

interface Racer {
  id: string;
  name: string;
  color: string;
  slot: number;
  /** Quanto já andou no sentido da pista (m), a partir da linha de largada. */
  progress: number;
  /** Último ponto do traçado onde estava e a distância dele desde a largada. */
  index: number;
  lastS: number;
  finishMs: number | null;
}

/** O que a corrida avisa a quem a criou (o `index.ts` repassa pela rede). */
export interface KartRaceEvents {
  /** Estado novo, para todos. */
  broadcast: (msg: KartRaceMessage) => void;
  /** Dinheiro novo de um jogador (o prêmio). */
  money: (playerId: string, amount: number) => void;
}

export class KartRace {
  private phase: KartPhase = "idle";
  private phaseEndsAt = 0;
  private readonly racers = new Map<string, Racer>();
  private startedAt = 0;
  /** Quantos largaram (o prêmio só vale com 2 ou mais). */
  private starters = 0;
  private winnerId: string | null = null;
  private prizePaid = 0;
  private lastBroadcastAt = 0;
  /** Última batida de cada par "atacante>alvo". */
  private readonly lastBumpAt = new Map<string, number>();

  constructor(
    private readonly track: KartTrack,
    private readonly room: Room,
    private readonly events: KartRaceEvents,
  ) {}

  /**
   * Paga a entrada e entra na próxima corrida. Recusado se a corrida já largou, se estiver lotada,
   * se já estiver inscrito, longe do balcão ou sem dinheiro. Retorna o novo saldo ou null.
   */
  join(id: string, now = Date.now()): number | null {
    if (this.phase !== "idle" && this.phase !== "lobby") return null;
    if (this.racers.has(id) || this.racers.size >= MAX_PLAYERS) return null;
    const player = this.room.playerOf(id);
    if (!player || distanceXZ(player.position, this.track.counter) > KART_JOIN_RANGE + DISTANCE_SLACK) return null;
    const money = this.room.spendMoney(id, KART_ENTRY_COST);
    if (money === null) return null;

    this.racers.set(id, { id, name: player.name, color: player.color, slot: this.freeSlot(), progress: 0, index: 0, lastS: 0, finishMs: null });
    if (this.phase === "idle") this.setPhase("lobby", now + KART_LOBBY_MS);
    // Grid cheio: não precisa esperar mais ninguém.
    if (this.racers.size >= MAX_PLAYERS) this.setPhase("countdown", now + KART_COUNTDOWN_MS);
    this.broadcast(now);
    return money;
  }

  /** Desistiu (ou desconectou): sai da corrida e a entrada não volta. */
  leave(id: string, now = Date.now()): void {
    if (!this.racers.delete(id)) return;
    for (const key of [...this.lastBumpAt.keys()]) if (key.startsWith(`${id}>`)) this.lastBumpAt.delete(key);
    if (this.racers.size === 0 && this.phase !== "results") this.setPhase("idle", 0);
    else if (this.phase === "racing" && this.allFinished()) this.finish(now);
    this.broadcast(now);
  }

  /** Chamar a cada tick do servidor: troca de fase, conta as voltas e manda o placar. */
  update(now = Date.now()): void {
    const before = this.phase;
    const expired = this.phase !== "idle" && now >= this.phaseEndsAt;
    if (this.phase === "lobby" && expired) this.setPhase("countdown", now + KART_COUNTDOWN_MS);
    else if (this.phase === "countdown" && expired) this.start(now);
    else if (this.phase === "racing") {
      this.trackProgress(now);
      if (expired || this.allFinished()) this.finish(now);
    } else if (this.phase === "results" && expired) {
      this.racers.clear();
      this.setPhase("idle", 0);
    }
    // Mudou de fase: avisa na hora; senão, o placar vai de tempos em tempos.
    const due = this.phase !== "idle" && now - this.lastBroadcastAt >= KART_STATE_INTERVAL_MS;
    if (this.phase !== before || due) this.broadcast(now);
  }

  /**
   * O kart de `attackerId` diz que bateu em `targetId`. Vale durante a corrida, com os dois perto e
   * o kart andando; o empurrão cresce com a velocidade. Retorna o `hit` ou null se recusado.
   */
  bump(attackerId: string, targetId: string, now = Date.now()): HitMessage | null {
    if (this.phase !== "racing" || attackerId === targetId || !this.racers.has(attackerId)) return null;
    const a = this.room.playerOf(attackerId);
    const t = this.room.playerOf(targetId);
    if (!a || !t) return null;
    const dist = distanceXZ(a.position, t.position);
    if (dist > KART_RADIUS * 2 + BUMP_SLACK) return null;
    const speed = Math.hypot(a.velocity.x, a.velocity.z);
    if (speed < KART_BUMP_MIN_SPEED / 2) return null;
    const key = `${attackerId}>${targetId}`;
    if (now - (this.lastBumpAt.get(key) ?? 0) < KART_BUMP_COOLDOWN_MS) return null;
    this.lastBumpAt.set(key, now);

    const dir = dist < 0.01 ? forwardFromYaw(a.rotationY) : { x: (t.position.x - a.position.x) / dist, z: (t.position.z - a.position.z) / dist };
    const strength = KART_BUMP_KNOCKBACK * clamp(speed / KART_MAX_SPEED, 0.3, 1);
    // Outro kart só desliza; quem está a pé voa um pouco.
    const up = this.racers.has(targetId) ? 1 : KNOCKBACK_UP * 0.8;
    return { attackerId, targetId, knockback: { x: dir.x * strength, y: up, z: dir.z * strength } };
  }

  /** Estado atual, com a classificação. */
  message(now = Date.now()): KartRaceMessage {
    const ranked = [...this.racers.values()].sort((a, b) => {
      if (a.finishMs !== null || b.finishMs !== null) return (a.finishMs ?? Infinity) - (b.finishMs ?? Infinity);
      return b.progress - a.progress;
    });
    const racers: KartRacer[] = ranked.map((r, i) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      slot: r.slot,
      lap: clamp(Math.floor(Math.max(r.progress, 0) / this.track.path.length) + 1, 1, KART_LAPS),
      place: i + 1,
      finishMs: r.finishMs,
    }));
    const results = this.phase === "results";
    return {
      phase: this.phase,
      msLeft: this.phase === "idle" ? 0 : Math.max(0, this.phaseEndsAt - now),
      racers,
      winnerId: results ? this.winnerId : null,
      prize: results ? this.prizePaid : 0,
    };
  }

  private setPhase(phase: KartPhase, endsAt: number): void {
    this.phase = phase;
    this.phaseEndsAt = endsAt;
    if (phase === "idle" || phase === "lobby") {
      this.winnerId = null;
      this.prizePaid = 0;
    }
  }

  /** Largada: a volta começa a contar de onde cada kart está no grid (um pouco antes da linha). */
  private start(now: number): void {
    this.setPhase("racing", now + KART_MAX_RACE_MS);
    this.startedAt = now;
    this.starters = this.racers.size;
    const { path } = this.track;
    for (const racer of this.racers.values()) {
      const near = nearestOnPath(path, this.room.positionOf(racer.id) ?? path.points[0]!);
      racer.index = near.index;
      racer.lastS = near.s;
      // No grid o kart está antes da linha: a distância fica negativa.
      racer.progress = near.s > path.length / 2 ? near.s - path.length : near.s;
      racer.finishMs = null;
    }
  }

  /** Soma o quanto cada kart andou ao longo do traçado (só dentro da pista e sem saltos conta). */
  private trackProgress(now: number): void {
    const { path } = this.track;
    const lapsLength = KART_LAPS * path.length;
    for (const racer of this.racers.values()) {
      if (racer.finishMs !== null) continue;
      const position = this.room.positionOf(racer.id);
      if (!position) continue;
      const near = nearestOnPath(path, position, racer.index, SEARCH_WINDOW);
      if (near.distance > KART_HALF_WIDTH + TRACK_SLACK) continue;
      let delta = near.s - racer.lastS;
      if (delta > path.length / 2) delta -= path.length;
      if (delta < -path.length / 2) delta += path.length;
      racer.index = near.index;
      racer.lastS = near.s;
      if (Math.abs(delta) > MAX_STEP) continue;
      racer.progress += delta;
      if (racer.progress < lapsLength) continue;
      racer.finishMs = now - this.startedAt;
      // O primeiro a chegar: os outros têm um tempo para terminar.
      const first = [...this.racers.values()].filter((r) => r.finishMs !== null).length === 1;
      if (first) this.phaseEndsAt = Math.min(this.phaseEndsAt, now + KART_FINISH_GRACE_MS);
    }
  }

  /** Fim da corrida: paga o prêmio ao 1º (se largaram 2 ou mais) e mostra o resultado. */
  private finish(now: number): void {
    this.setPhase("results", now + KART_RESULTS_MS);
    const winner = [...this.racers.values()]
      .filter((r) => r.finishMs !== null)
      .sort((a, b) => (a.finishMs ?? 0) - (b.finishMs ?? 0))[0];
    this.winnerId = winner?.id ?? null;
    if (!winner || this.starters < 2) return;
    const money = this.room.earnMoney(winner.id, KART_PRIZE);
    if (money === null) return;
    this.prizePaid = KART_PRIZE;
    this.events.money(winner.id, money);
  }

  private allFinished(): boolean {
    return this.racers.size > 0 && [...this.racers.values()].every((r) => r.finishMs !== null);
  }

  /** O menor lugar livre no grid. */
  private freeSlot(): number {
    const taken = new Set([...this.racers.values()].map((r) => r.slot));
    let slot = 0;
    while (taken.has(slot)) slot++;
    return slot;
  }

  private broadcast(now: number): void {
    this.lastBroadcastAt = now;
    this.events.broadcast(this.message(now));
  }
}
