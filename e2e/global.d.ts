// API de depuração exposta pelo cliente em modo dev (ver client/src/game/Game.ts).
export {};

declare global {
  interface Window {
    __jogo?: {
      selfId: () => string;
      local: () => { x: number; y: number; z: number; rotationY: number; anim: string };
      remotes: () => { id: string; name: string; x: number; y: number; z: number }[];
      lookAt: (x: number, z: number) => void;
      trees: () => { type: string; x: number; z: number; scale: number }[];
    };
  }
}
