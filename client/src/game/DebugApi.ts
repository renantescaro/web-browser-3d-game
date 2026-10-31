// API de depuração exposta em `window.__jogo` em modo dev (o `Game` chama `createDebugApi`).
// Os testes E2E dependem dela; mantenha `e2e/global.d.ts` em sincronia.
import * as THREE from "three";
import type { Inventory } from "@jogo/shared/inventory";
import type { Outfit } from "@jogo/shared/outfits";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import type { AnimalDebugInfo, AnimalsManager } from "./AnimalsManager";
import type { ChoppingDebugInfo } from "./ChoppingController";
import type { ClothingDebugInfo } from "./ClothingController";
import type { FishingDebugInfo } from "./FishingController";
import type { Interactions } from "./Interactions";
import type { LumberMillDebugInfo } from "./LumberMillController";
import type { MerchantDebugInfo } from "./MerchantController";
import type { RemotePlayers } from "./RemotePlayers";
import type { Scenery } from "./Scenery";
import type { ShootingDebugInfo } from "./ShootingController";
import type { SquareDebugInfo } from "./SquareManager";
import type { ThirdPersonCamera } from "./ThirdPersonCamera";
import type { ToolShopDebugInfo } from "./ToolShopController";

/** API de depuração usada pelos testes E2E (só em desenvolvimento). */
export interface DebugApi {
  selfId: () => string;
  local: () => { x: number; y: number; z: number; rotationY: number; anim: string };
  remotes: () => { id: string; name: string; x: number; y: number; z: number; outfit: Outfit }[];
  /** Gira a câmera para olhar um ponto (assim "W" anda até ele). */
  lookAt: (x: number, z: number) => void;
  trees: () => { id: string; type: string; x: number; z: number; scale: number; chopped: boolean }[];
  square: () => SquareDebugInfo | null;
  /** `label` é o rótulo atual do botão de Ação (de qualquer sistema). */
  fishing: () => FishingDebugInfo & { label: string };
  animals: () => AnimalDebugInfo[];
  merchant: () => MerchantDebugInfo | null;
  shooting: () => ShootingDebugInfo;
  /** Loja de roupas da Deendi e o que o jogador veste. */
  clothing: () => ClothingDebugInfo | null;
  /** Loja de ferramentas do Gabriel e as ferramentas que o jogador carrega. */
  tools: () => ToolShopDebugInfo | null;
  /** Madeireira do Brenno. */
  lumber: () => LumberMillDebugInfo | null;
  /** O que o jogador carrega. */
  inventory: () => Inventory;
  /** Minigame de cortar árvore. */
  chopping: () => ChoppingDebugInfo;
  /** Reconecta reenviando este progresso no `join` (o servidor valida), como depois de uma queda. */
  rejoin: (progress: { money?: number; inventory?: Inventory }) => void;
  /**
   * Põe o jogador em (x, z) na hora. O servidor só aceita a posição nova aos poucos (limite de
   * velocidade), então espere ~1 s a cada 20 m antes de fazer algo que ele confira.
   */
  teleport: (x: number, z: number) => void;
  /** Gira a câmera para o centro da tela (a mira) apontar para o ponto. */
  aimAt: (x: number, y: number, z: number) => void;
}

/** O que a API de debug lê do jogo. */
export interface DebugSources {
  selfId: () => string;
  local: LocalPlayer;
  camera: ThirdPersonCamera;
  remotes: RemotePlayers;
  animals: AnimalsManager;
  scenery: Scenery;
  interactions: Interactions;
  network: Network;
}

export function createDebugApi(g: DebugSources): DebugApi {
  return {
    selfId: g.selfId,
    local: () => {
      const s = g.local.state();
      return { ...s.position, rotationY: s.rotationY, anim: s.anim };
    },
    remotes: () => g.remotes.debugInfo(),
    lookAt: (x, z) => {
      const p = g.local.renderPosition;
      g.camera.yaw = Math.atan2(x - p.x, z - p.z);
    },
    trees: () => g.scenery.trees.debugInfo(),
    square: () => g.scenery.square.debugInfo(),
    fishing: () => ({ ...g.interactions.fishing.debugInfo(), label: g.interactions.label }),
    animals: () => g.animals.debugInfo(),
    merchant: () => g.interactions.merchant.debugInfo(),
    shooting: () => g.interactions.shooting.debugInfo(),
    clothing: () => g.interactions.clothing.debugInfo(),
    tools: () => g.interactions.tools.debugInfo(),
    lumber: () => g.interactions.lumber.debugInfo(),
    inventory: () => ({ ...g.interactions.inventory.current }),
    chopping: () => g.interactions.chopping.debugInfo(),
    rejoin: (progress) => g.network.rejoin(progress),
    teleport: (x, z) => g.local.placeAt(x, z),
    aimAt: (x, y, z) => {
      g.camera.aimAt(new THREE.Vector3(x, y, z));
      g.camera.update(0, g.local.renderPosition);
    },
  };
}

declare global {
  interface Window {
    __jogo?: DebugApi;
  }
}
