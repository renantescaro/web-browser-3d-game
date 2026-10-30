// Tipos de TODAS as mensagens de rede. Fonte única da verdade para cliente e servidor.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const ANIM_STATES = ["idle", "walk", "run", "jump", "punch"] as const;
export type AnimState = (typeof ANIM_STATES)[number];

export interface PlayerSnapshot {
  id: string;
  name: string;
  color: string;
  /** Posição dos pés do personagem. */
  position: Vec3;
  rotationY: number;
  velocity: Vec3;
  anim: AnimState;
}

export type JoinRejectReason = "full" | "invalidName" | "colorTaken";

export type ReactionId = 0 | 1 | 2 | 3;

export interface ReactionMessage {
  playerId: string;
  reactionId: ReactionId;
}

// --- Cliente → servidor ---
export interface JoinMessage {
  name: string;
  color: string;
}

export interface StateMessage {
  position: Vec3;
  rotationY: number;
  velocity: Vec3;
  anim: AnimState;
}

export type PunchMessage = Record<string, never>;

// --- Servidor → cliente ---
export interface LobbyMessage {
  takenColors: string[];
  playerCount: number;
}

export interface WelcomeMessage {
  selfId: string;
  players: PlayerSnapshot[];
}

export interface JoinRejectedMessage {
  reason: JoinRejectReason;
}

export interface PlayerJoinedMessage {
  player: PlayerSnapshot;
}

export interface PlayerLeftMessage {
  id: string;
}

export interface SnapshotMessage {
  players: PlayerSnapshot[];
  /** Horário do servidor (ms). */
  t: number;
}

export interface HitMessage {
  attackerId: string;
  targetId: string;
  knockback: Vec3;
}

/** Eventos que o cliente envia (tipagem do Socket.IO). */
export interface ClientToServerEvents {
  join: (msg: JoinMessage) => void;
  state: (msg: StateMessage) => void;
  punch: (msg: PunchMessage) => void;
  reaction: (reactionId: ReactionId) => void;
}

/** Eventos que o servidor envia (tipagem do Socket.IO). */
export interface ServerToClientEvents {
  lobby: (msg: LobbyMessage) => void;
  welcome: (msg: WelcomeMessage) => void;
  joinRejected: (msg: JoinRejectedMessage) => void;
  playerJoined: (msg: PlayerJoinedMessage) => void;
  playerLeft: (msg: PlayerLeftMessage) => void;
  snapshot: (msg: SnapshotMessage) => void;
  hit: (msg: HitMessage) => void;
  reaction: (msg: ReactionMessage) => void;
}
