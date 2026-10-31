// API de depuração exposta em `window.__jogo` em modo dev (ver `Game.exposeDebugApi`).
// Os testes E2E dependem dela; mantenha `e2e/global.d.ts` em sincronia.
import type { Outfit } from "@jogo/shared/outfits";
import type { AnimalDebugInfo } from "./AnimalsManager";
import type { ClothingDebugInfo } from "./ClothingController";
import type { FishingDebugInfo } from "./FishingController";
import type { MerchantDebugInfo } from "./MerchantController";
import type { ShootingDebugInfo } from "./ShootingController";
import type { SquareDebugInfo } from "./SquareManager";

/** API de depuração usada pelos testes E2E (só em desenvolvimento). */
export interface DebugApi {
  selfId: () => string;
  local: () => { x: number; y: number; z: number; rotationY: number; anim: string };
  remotes: () => { id: string; name: string; x: number; y: number; z: number; outfit: Outfit }[];
  /** Gira a câmera para olhar um ponto (assim "W" anda até ele). */
  lookAt: (x: number, z: number) => void;
  trees: () => { type: string; x: number; z: number; scale: number }[];
  square: () => SquareDebugInfo | null;
  /** `label` é o rótulo atual do botão de Ação (de qualquer sistema). */
  fishing: () => FishingDebugInfo & { label: string };
  animals: () => AnimalDebugInfo[];
  merchant: () => MerchantDebugInfo | null;
  shooting: () => ShootingDebugInfo;
  /** Loja de roupas da Deendi e o que o jogador veste. */
  clothing: () => ClothingDebugInfo | null;
  /** Gira a câmera para o centro da tela (a mira) apontar para o ponto. */
  aimAt: (x: number, y: number, z: number) => void;
}

declare global {
  interface Window {
    __jogo?: DebugApi;
  }
}
