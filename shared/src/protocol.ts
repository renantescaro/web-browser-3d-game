// Tipos de TODAS as mensagens de rede. Fonte única da verdade para cliente e servidor.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** "fish" = parado pescando, com a vara na mão. */
export const ANIM_STATES = ["idle", "walk", "run", "jump", "punch", "fish"] as const;
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
  /** Quantos peixes o jogador já pescou (atributo do jogador, guardado no servidor). */
  fishCaught: number;
}

export type JoinRejectReason = "full" | "invalidName" | "colorTaken";

export type AnimalType = "dog" | "cat" | "horse";
/** Animais que comem peixe (cavalos não comem). */
export const FISH_EATING_ANIMALS: readonly AnimalType[] = ["dog", "cat"];

export interface AnimalData {
  id: string;
  type: AnimalType;
  color: string;
  position: Vec3;
  rotationY: number;
}

/** Tipos de árvore. Para um tipo novo: adicione aqui e crie a classe em `client/src/entities/trees/`. */
export const TREE_TYPES = ["oak", "pine"] as const;
export type TreeType = (typeof TREE_TYPES)[number];

/** Árvore estática do cenário, gerada pelo servidor ao iniciar. */
export interface TreeData {
  id: string;
  type: TreeType;
  /** Posição da base do tronco (y = 0). */
  position: Vec3;
  rotationY: number;
  /** Escala uniforme, entre `TREE_MIN_SCALE` e `TREE_MAX_SCALE`. */
  scale: number;
}

export interface BenchData {
  /** Posição dos pés do banco (y = 0), no mundo. */
  position: Vec3;
  /** O assento olha para a fonte. */
  rotationY: number;
}

export interface SignData {
  position: Vec3;
  /** A face com o texto olha para esta direção (yaw). */
  rotationY: number;
  text: string;
}

export interface FishData {
  id: string;
  color: string;
  /** Tamanho, entre `FISH_MIN_SCALE` e `FISH_MAX_SCALE`; diferente para cada peixe. */
  scale: number;
  /** Posição inicial relativa ao centro da fonte (só x e z importam). */
  position: Vec3;
  rotationY: number;
}

export interface FountainData {
  /** Centro da fonte, no mundo. */
  position: Vec3;
  fish: FishData[];
}

/** A praça da cidade: exatamente uma por servidor, gerada ao iniciar. */
export interface SquareData {
  /** Centro da praça, no mundo (y = 0). */
  position: Vec3;
  benches: BenchData[];
  sign: SignData;
  fountain: FountainData;
}

export type ReactionId = 0 | 1 | 2 | 3;

export interface ReactionMessage {
  playerId: string;
  reactionId: ReactionId;
}

// --- Cliente → servidor ---
export interface JoinMessage {
  name: string;
  color: string;
  /** Peixes já pescados; o cliente reenvia ao reconectar para não perder a contagem. */
  fishCaught?: number;
}

export interface StateMessage {
  position: Vec3;
  rotationY: number;
  velocity: Vec3;
  anim: AnimState;
}

export type PunchMessage = Record<string, never>;

/** O cliente acertou o minigame; o servidor confere se ele está na fonte. */
export type FishCaughtMessage = Record<string, never>;

/** Dar um peixe do inventário a um gato ou cachorro, que passa a seguir o jogador. */
export interface FeedAnimalMessage {
  animalId: string;
}

// --- Servidor → cliente ---
export interface LobbyMessage {
  takenColors: string[];
  playerCount: number;
}

export interface WelcomeMessage {
  selfId: string;
  players: PlayerSnapshot[];
  animals: AnimalData[];
  trees: TreeData[];
  square: SquareData;
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

export interface AnimalSnapshot {
  id: string;
  position: Vec3;
  rotationY: number;
  /** Jogador que o animal segue (o último que lhe deu peixe), ou null. */
  followingId: string | null;
}

export interface SnapshotMessage {
  players: PlayerSnapshot[];
  animals: AnimalSnapshot[];
  /** Horário do servidor (ms). */
  t: number;
}

/** Contagem atualizada de peixes do próprio jogador. */
export interface FishCountMessage {
  count: number;
}

/** Um animal ganhou peixe: todos mostram o coração acima dele. */
export interface AnimalFedMessage {
  animalId: string;
  playerId: string;
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
  fishCaught: (msg: FishCaughtMessage) => void;
  feedAnimal: (msg: FeedAnimalMessage) => void;
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
  fishCount: (msg: FishCountMessage) => void;
  animalFed: (msg: AnimalFedMessage) => void;
}
