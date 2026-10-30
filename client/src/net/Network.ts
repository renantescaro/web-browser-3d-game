// Conexão Socket.IO tipada com o protocolo compartilhado.
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, JoinMessage, ReactionId, ServerToClientEvents, StateMessage } from "@jogo/shared/protocol";

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
