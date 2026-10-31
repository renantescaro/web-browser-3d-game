// Conexão Socket.IO tipada com o protocolo compartilhado.
import { io, type Socket } from "socket.io-client";
import type { ItemId } from "@jogo/shared/items";
import type { Inventory } from "@jogo/shared/inventory";
import type { Outfit, OutfitItemId } from "@jogo/shared/outfits";
import type { ToolId } from "@jogo/shared/tools";
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

  /** Atualiza o inventário da sessão, reenviado no `join` ao reconectar. */
  rememberInventory(inventory: Inventory): void {
    if (this.session) this.session = { ...this.session, inventory: { ...inventory } };
  }

  /**
   * Só para testes (API de debug): reconecta reenviando o progresso com estes valores, como se o
   * jogador tivesse voltado depois de uma queda. O servidor valida tudo no `join`.
   */
  rejoin(progress: Pick<JoinMessage, "money" | "inventory">): void {
    if (!this.session) return;
    this.session = { ...this.session, ...progress };
    this.socket.disconnect().connect();
  }

  /** Atualiza o dinheiro da sessão, reenviado no `join` ao reconectar. */
  rememberMoney(amount: number): void {
    if (this.session) this.session = { ...this.session, money: amount };
  }

  /** Atualiza as roupas da sessão, reenviadas no `join` ao reconectar. */
  rememberOutfit(outfit: Outfit): void {
    if (this.session) this.session = { ...this.session, outfit: { ...outfit } };
  }

  /** Vende madeira ao Brenno; o servidor confere e responde com `money` e `inventory`. */
  sellWood(amount: number): void {
    if (this.socket.connected) this.socket.emit("sellWood", { amount });
  }

  /** Compra uma ferramenta do Gabriel; o servidor confere e responde com `money` e `inventory`. */
  buyTool(item: ToolId): void {
    if (this.socket.connected) this.socket.emit("buyTool", { item });
  }

  /** Compra (e veste) uma roupa da Deendi; o servidor confere e responde com `money` e `outfit`. */
  buyOutfit(item: OutfitItemId): void {
    if (this.socket.connected) this.socket.emit("buyOutfit", { item });
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

  /** Derrubou uma árvore no minigame; o servidor confere e responde com `inventory` e `treeChopped`. */
  chopTree(treeId: string): void {
    if (this.socket.connected) this.socket.emit("chopTree", { treeId });
  }

  /** Avisa que acertou o minigame de pesca; o servidor confere e responde com `inventory`. */
  catchFish(): void {
    if (this.socket.connected) this.socket.emit("fishCaught", {});
  }

  /** Dá um peixe a um animal; o servidor confere e responde com `inventory` e `animalFed`. */
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
