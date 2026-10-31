// Conexão Socket.IO tipada com o protocolo compartilhado.
import { io, type Socket } from "socket.io-client";
import type { ItemId } from "@jogo/shared/items";
import type {
  ClientToServerEvents,
  JoinMessage,
  ReactionId,
  ServerToClientEvents,
  StateMessage,
  TradeAction,
} from "@jogo/shared/protocol";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export class Network {
  readonly socket: GameSocket;
  /** Dados do último `join` aceito. Usado para reentrar sozinho após reconexão. */
  private session: JoinMessage | null = null;

  constructor() {
    // Mesma origem: em dev o Vite repassa /socket.io para o servidor.
    this.socket = io({ transports: ["websocket"], reconnectionDelayMax: 3000 });
    this.socket.on("connect", () => {
      if (this.session) this.socket.emit("join", this.session);
    });
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  join(msg: JoinMessage): void {
    this.socket.emit("join", msg);
  }

  /** Guarda (ou limpa) a sessão para reconexão automática. */
  setSession(msg: JoinMessage | null): void {
    this.session = msg;
  }

  /** Atualiza a contagem de peixes da sessão, reenviada no `join` ao reconectar. */
  rememberFishCaught(count: number): void {
    if (this.session) this.session = { ...this.session, fishCaught: count };
  }

  /** Atualiza o dinheiro da sessão, reenviado no `join` ao reconectar. */
  rememberMoney(amount: number): void {
    if (this.session) this.session = { ...this.session, money: amount };
  }

  /** Compra ou vende uma unidade com o comerciante; o servidor confere e responde. */
  trade(item: ItemId, action: TradeAction): void {
    if (this.socket.connected) this.socket.emit("trade", { item, action });
  }

  /** Pede para jogar o Tiro ao Alvo; o servidor cobra a entrada e responde com `shooting`. */
  shootingStart(): void {
    if (this.socket.connected) this.socket.emit("shootingStart", {});
  }

  /** Um tiro no Tiro ao Alvo (acertou um pato ou não); o servidor responde com `shooting`. */
  shootingShot(hit: boolean): void {
    if (this.socket.connected) this.socket.emit("shootingShot", { hit });
  }

  /** Sai do Tiro ao Alvo no meio da partida. */
  shootingStop(): void {
    if (this.socket.connected) this.socket.emit("shootingStop", {});
  }

  /** Avisa que acertou o minigame de pesca; o servidor confere e responde com `fishCount`. */
  catchFish(): void {
    if (this.socket.connected) this.socket.emit("fishCaught", {});
  }

  /** Dá um peixe a um animal; o servidor confere e responde com `fishCount` e `animalFed`. */
  feedAnimal(animalId: string): void {
    if (this.socket.connected) this.socket.emit("feedAnimal", { animalId });
  }

  sendState(state: StateMessage): void {
    if (this.socket.connected) this.socket.volatile.emit("state", state);
  }

  punch(): void {
    if (this.socket.connected) this.socket.emit("punch", {});
  }

  sendReaction(reactionId: number): void {
    if (this.socket.connected) this.socket.emit("reaction", reactionId as ReactionId);
  }
}
