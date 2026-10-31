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
      square: () => {
        x: number;
        z: number;
        benches: number;
        signText: string;
        fountain: { x: number; z: number; innerRadius: number; outerRadius: number };
        fish: { id: string; scale: number; x: number; z: number }[];
      } | null;
      fishing: () => {
        active: boolean;
        label: string;
        count: number;
        phase: "playing" | "caught" | "missed" | null;
        marker: number;
        zoneStart: number;
        zoneEnd: number;
        speed: number;
      };
      animals: () => {
        id: string;
        type: "dog" | "cat" | "horse";
        x: number;
        z: number;
        followingId: string | null;
      }[];
      merchant: () => {
        name: string;
        signText: string;
        x: number;
        z: number;
        rotationY: number;
        table: { x: number; z: number };
        stock: Record<string, number>;
        money: number;
        open: boolean;
      } | null;
      shooting: () => {
        status: "idle" | "starting" | "playing" | "over";
        hits: number;
        booth: {
          x: number;
          z: number;
          rotationY: number;
          ownerName: string;
          owner: { x: number; z: number };
          signText: string;
        } | null;
        ducks: { id: string; x: number; y: number; z: number; hittable: boolean }[];
      };
      aimAt: (x: number, y: number, z: number) => void;
    };
  }
}
