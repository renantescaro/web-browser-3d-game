// API de depuração exposta em `window.__jogo` em modo dev (ver `Game.exposeDebugApi`).
// Os testes E2E dependem dela; mantenha `e2e/global.d.ts` em sincronia.
import type { AnimalDebugInfo } from "./AnimalsManager";
import type { FishingDebugInfo } from "./FishingController";
import type { MerchantDebugInfo } from "./MerchantController";
import type { SquareDebugInfo } from "./SquareManager";

/** API de depuração usada pelos testes E2E (só em desenvolvimento). */
export interface DebugApi {
  selfId: () => string;
  local: () => { x: number; y: number; z: number; rotationY: number; anim: string };
  remotes: () => { id: string; name: string; x: number; y: number; z: number }[];
  /** Gira a câmera para olhar um ponto (assim "W" anda até ele). */
  lookAt: (x: number, z: number) => void;
  trees: () => { type: string; x: number; z: number; scale: number }[];
  square: () => SquareDebugInfo | null;
  fishing: () => FishingDebugInfo;
  animals: () => AnimalDebugInfo[];
  merchant: () => MerchantDebugInfo | null;
}

declare global {
  interface Window {
    __jogo?: DebugApi;
  }
}
