// Lógica do minigame de pesca (sem DOM): um marcador vai e volta numa barra e o jogador
// precisa apertar Ação quando ele estiver dentro da área certa.
import {
  FISHING_ROUND_PAUSE_MS,
  FISHING_SPEED_BASE,
  FISHING_SPEED_MAX,
  FISHING_SPEED_PER_FISH,
  FISHING_ZONE_BASE,
  FISHING_ZONE_MIN,
  FISHING_ZONE_SHRINK_PER_FISH,
} from "@jogo/shared/constants";

export type FishingPhase = "playing" | "caught" | "missed";

export interface FishingDifficulty {
  /** Velocidade do marcador, em larguras da barra por segundo. */
  speed: number;
  /** Largura da área certa, em fração da barra (0–1). */
  zoneWidth: number;
}

/** Quanto mais peixes o jogador já pescou, mais rápido o marcador e menor a área. */
export function fishingDifficulty(fishCaught: number): FishingDifficulty {
  return {
    speed: Math.min(FISHING_SPEED_MAX, FISHING_SPEED_BASE + fishCaught * FISHING_SPEED_PER_FISH),
    zoneWidth: Math.max(FISHING_ZONE_MIN, FISHING_ZONE_BASE - fishCaught * FISHING_ZONE_SHRINK_PER_FISH),
  };
}

/** Margem das pontas da barra onde a área certa não aparece. */
const EDGE = 0.05;

export class FishingMinigame {
  /** Posição do marcador na barra (0–1). */
  marker = 0;
  zoneStart = 0;
  phase: FishingPhase = "playing";
  difficulty: FishingDifficulty;
  /** Nível mostrado ao jogador (1 = nenhum peixe ainda). */
  level = 1;
  private direction = 1;
  private pauseLeft = 0;

  constructor(fishCaught: number) {
    this.difficulty = fishingDifficulty(fishCaught);
    this.newRound(fishCaught);
  }

  /** Sorteia a área certa e recomeça o marcador, com a dificuldade da contagem atual. */
  newRound(fishCaught: number): void {
    this.difficulty = fishingDifficulty(fishCaught);
    this.level = fishCaught + 1;
    const { zoneWidth } = this.difficulty;
    this.zoneStart = EDGE + Math.random() * (1 - 2 * EDGE - zoneWidth);
    // O marcador começa na ponta mais longe da área.
    const zoneMid = this.zoneStart + zoneWidth / 2;
    this.marker = zoneMid > 0.5 ? 0 : 1;
    this.direction = zoneMid > 0.5 ? 1 : -1;
    this.phase = "playing";
    this.pauseLeft = 0;
  }

  get zoneEnd(): number {
    return this.zoneStart + this.difficulty.zoneWidth;
  }

  /** Tentativa de fisgar. Retorna o resultado ou null se estiver na pausa entre rodadas. */
  press(): "caught" | "missed" | null {
    if (this.phase !== "playing") return null;
    const inside = this.marker >= this.zoneStart && this.marker <= this.zoneEnd;
    this.phase = inside ? "caught" : "missed";
    this.pauseLeft = FISHING_ROUND_PAUSE_MS / 1000;
    return this.phase;
  }

  /** Avança o marcador. Retorna true quando a pausa acabou e é hora de uma nova rodada. */
  update(dt: number): boolean {
    if (this.phase !== "playing") {
      this.pauseLeft -= dt;
      return this.pauseLeft <= 0;
    }
    this.marker += this.direction * this.difficulty.speed * dt;
    if (this.marker >= 1) {
      this.marker = 1;
      this.direction = -1;
    } else if (this.marker <= 0) {
      this.marker = 0;
      this.direction = 1;
    }
    return false;
  }
}
