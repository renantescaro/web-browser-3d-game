// Regras do Tiro ao Alvo, com autoridade do servidor sobre o dinheiro: cobra a entrada,
// conta os acertos em sequência, encerra no primeiro erro e paga o prêmio.
// A mira e os patos rodam no cliente; aqui só se confere se cada tiro é plausível.
import {
  SHOOTING_ENTRY_COST,
  SHOOTING_MAX_SESSION_MS,
  SHOOTING_PLAY_RANGE,
  SHOOTING_PRIZE,
  SHOOTING_SHOT_COOLDOWN_MS,
  SHOOTING_TARGETS_TO_WIN,
} from "@jogo/shared/constants";
import { distanceXZ } from "@jogo/shared/math";
import type { ShootingStateMessage } from "@jogo/shared/protocol";
import type { Room } from "./Room.js";
import type { ShootingBooth } from "./ShootingBooth.js";

/** Folga (m) na distância até o balcão, pela latência entre o cliente e o último `state`. */
const DISTANCE_SLACK = 1.5;
/** Folga (ms) no intervalo entre tiros, porque a rede pode juntar duas mensagens. */
const SHOT_INTERVAL_SLACK_MS = 150;

interface Session {
  hits: number;
  startedAt: number;
  lastShotAt: number;
}

/** Resposta ao jogador: o novo estado e, se mudou, o novo dinheiro. */
export interface ShootingUpdate {
  state: ShootingStateMessage;
  money: number | null;
}

export class ShootingGallery {
  /** Partidas em andamento, por id do jogador. */
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly booth: ShootingBooth,
    private readonly room: Room,
  ) {}

  /** Paga a entrada e começa. Recusado se já estiver jogando, longe do balcão ou sem dinheiro. */
  start(id: string): ShootingUpdate | null {
    if (this.sessions.has(id) || !this.nearCounter(id)) return null;
    const money = this.room.spendMoney(id, SHOOTING_ENTRY_COST);
    if (money === null) return null;
    this.sessions.set(id, { hits: 0, startedAt: Date.now(), lastShotAt: 0 });
    return { state: { phase: "playing", hits: 0 }, money };
  }

  /**
   * Um tiro. Errar (ou um tiro inválido: longe do balcão ou partida expirada) encerra
   * a partida; o acerto que completa a sequência paga o prêmio. Retorna null sem partida.
   */
  shoot(id: string, hit: boolean): ShootingUpdate | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    const now = Date.now();
    // Rápido demais: ignora o tiro, mas devolve o placar para o cliente se corrigir.
    if (now - session.lastShotAt < SHOOTING_SHOT_COOLDOWN_MS - SHOT_INTERVAL_SLACK_MS) {
      return { state: { phase: "playing", hits: session.hits }, money: null };
    }
    session.lastShotAt = now;

    const expired = now - session.startedAt > SHOOTING_MAX_SESSION_MS;
    if (!hit || expired || !this.nearCounter(id)) {
      this.sessions.delete(id);
      return { state: { phase: "lost", hits: session.hits }, money: null };
    }
    session.hits++;
    if (session.hits < SHOOTING_TARGETS_TO_WIN) {
      return { state: { phase: "playing", hits: session.hits }, money: null };
    }
    this.sessions.delete(id);
    return { state: { phase: "won", hits: session.hits }, money: this.room.earnMoney(id, SHOOTING_PRIZE) };
  }

  /** Sai no meio (ou desconectou): a entrada não volta. Retorna true se havia partida. */
  stop(id: string): boolean {
    return this.sessions.delete(id);
  }

  private nearCounter(id: string): boolean {
    const position = this.room.positionOf(id);
    return position !== null && distanceXZ(position, this.booth.position) <= SHOOTING_PLAY_RANGE + DISTANCE_SLACK;
  }
}
