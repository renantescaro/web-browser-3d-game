// Tipos de TODAS as mensagens de rede. Fonte única da verdade para cliente e servidor.
import type { ItemId } from "./items";
import type { Outfit, OutfitItemId } from "./outfits";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** "fish" = parado pescando, com a vara na mão; "aim" = mirando com a espingarda de pressão. */
export const ANIM_STATES = ["idle", "walk", "run", "jump", "punch", "fish", "aim"] as const;
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
  /** Dinheiro do jogador, em reais. */
  money: number;
  /** Roupas e acessórios que o jogador veste (comprados da Deendi). */
  outfit: Outfit;
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

/** Estilos de chapéu de um personagem. */
export const HAT_STYLES = ["cap", "wide", "boater"] as const;
export type HatStyle = (typeof HAT_STYLES)[number];

/** Aparência de um personagem humano. Jogadores só escolhem a cor da camisa; NPCs podem mudar tudo. */
export interface CharacterAppearance {
  /** Camisa (e a borda do rótulo do nome). Nos jogadores, a cor escolhida. */
  shirtColor: string;
  /** Calça; se ausente, a camisa escurecida. */
  pantsColor?: string;
  /** Pele; se ausente, o tom padrão. */
  skinColor?: string;
  hat?: { style: HatStyle; color: string };
  /** Avental na frente do tronco. */
  apronColor?: string;
  /** Bigode. */
  mustacheColor?: string;
  /** Gravata-borboleta. */
  bowTieColor?: string;
  /** Colete por cima da camisa. */
  vestColor?: string;
  /** Roupas e acessórios do catálogo (`outfits.ts`), os mesmos que os jogadores compram. */
  outfit?: Outfit;
}

/** Quanto de cada item o comerciante tem. */
export type MerchantStock = Record<ItemId, number>;

/** O comerciante: um humano atrás de uma mesa com placa, ao lado da praça. */
export interface MerchantData {
  name: string;
  appearance: CharacterAppearance;
  /** Posição dos pés do comerciante. */
  position: Vec3;
  /** Olha para o lado dos clientes (a mesa fica à frente dele). */
  rotationY: number;
  /** Centro da mesa (y = 0). Para negociar, o jogador fica perto dela. */
  table: Vec3;
  /** Texto da placa da mesa. */
  signText: string;
  stock: MerchantStock;
}

/** A barraca de Tiro ao Alvo: balcão, patos andando no fundo e o Balotinho num canto. */
export interface ShootingBoothData {
  ownerName: string;
  appearance: CharacterAppearance;
  /** Pés do dono, atrás do balcão. */
  ownerPosition: Vec3;
  /** Centro do balcão (y = 0). Para jogar, o jogador fica perto dele. */
  position: Vec3;
  /** A frente do balcão (lado dos clientes) olha para esta direção (yaw). */
  rotationY: number;
  signText: string;
}

/** A loja de roupas e acessórios da Deendi: um balcão com arara, ao lado da praça. */
export interface ClothingShopData {
  sellerName: string;
  appearance: CharacterAppearance;
  /** Pés da vendedora, atrás do balcão. */
  position: Vec3;
  /** Olha para o lado dos clientes (o balcão fica à frente dela). */
  rotationY: number;
  /** Centro do balcão (y = 0). Para comprar, o jogador fica perto dele. */
  counter: Vec3;
  signText: string;
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
  /** Dinheiro (reais); reenviado ao reconectar, como os peixes. */
  money?: number;
  /** Roupas vestidas; reenviadas ao reconectar, como o dinheiro. */
  outfit?: Outfit;
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

/** Do ponto de vista do jogador: comprar do comerciante ou vender para ele. */
export type TradeAction = "buy" | "sell";

/** Compra ou venda de uma unidade de um item com o comerciante. */
export interface TradeMessage {
  item: ItemId;
  action: TradeAction;
}

/** Pagar a entrada e começar o Tiro ao Alvo. */
export type ShootingStartMessage = Record<string, never>;

/** Um tiro no Tiro ao Alvo: o cliente diz se acertou um pato (a mira roda no cliente). */
export interface ShootingShotMessage {
  hit: boolean;
}

/** Sair do Tiro ao Alvo no meio (perde a entrada). */
export type ShootingStopMessage = Record<string, never>;

/** Comprar (e já vestir) uma roupa ou acessório da Deendi. */
export interface BuyOutfitMessage {
  item: OutfitItemId;
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
  merchant: MerchantData;
  shootingBooth: ShootingBoothData;
  clothingShop: ClothingShopData;
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

/** Dinheiro atualizado do próprio jogador (reais). */
export interface MoneyMessage {
  amount: number;
}

/** O estoque do comerciante mudou porque `playerId` negociou com ele. Vai para todos. */
export interface MerchantStockMessage {
  stock: MerchantStock;
  playerId: string;
}

/** Um animal ganhou peixe: todos mostram o coração acima dele. */
export interface AnimalFedMessage {
  animalId: string;
  playerId: string;
}

/** "playing" = jogo valendo; "won"/"lost" = acabou (ganhou o prêmio ou errou um tiro). */
export type ShootingPhase = "playing" | "won" | "lost";

/** Estado do Tiro ao Alvo do próprio jogador, decidido pelo servidor. */
export interface ShootingStateMessage {
  phase: ShootingPhase;
  /** Patos acertados em sequência nesta partida. */
  hits: number;
}

/** Uma partida acabou: todos veem a reação do dono da barraca. */
export interface ShootingResultMessage {
  playerId: string;
  won: boolean;
}

/** Roupas atualizadas do próprio jogador, depois de uma compra. */
export interface OutfitMessage {
  outfit: Outfit;
}

/** `playerId` comprou na loja de roupas: todos veem a Deendi comemorar. */
export interface OutfitSoldMessage {
  playerId: string;
  item: OutfitItemId;
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
  trade: (msg: TradeMessage) => void;
  shootingStart: (msg: ShootingStartMessage) => void;
  shootingShot: (msg: ShootingShotMessage) => void;
  shootingStop: (msg: ShootingStopMessage) => void;
  buyOutfit: (msg: BuyOutfitMessage) => void;
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
  money: (msg: MoneyMessage) => void;
  merchantStock: (msg: MerchantStockMessage) => void;
  shooting: (msg: ShootingStateMessage) => void;
  shootingResult: (msg: ShootingResultMessage) => void;
  outfit: (msg: OutfitMessage) => void;
  outfitSold: (msg: OutfitSoldMessage) => void;
}
