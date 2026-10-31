// Lógica do minigame de cortar árvore (sem DOM): um marcador vai e volta numa barra e cada
// Ação dentro da área certa é um golpe no tronco. `CHOP_HITS_TO_FELL` golpes derrubam a árvore;
// `CHOP_MAX_MISSES` erros e o machado escorrega (a árvore fica em pé).
import { CHOP_HITS_TO_FELL, CHOP_MAX_MISSES, CHOP_PAUSE_MS, CHOP_SPEED, CHOP_ZONE_WIDTH } from "@jogo/shared/constants";

/** "hit"/"missed" = pausa depois de um golpe; "felled"/"slipped" = acabou (derrubou ou desistiu). */
export type ChoppingPhase = "playing" | "hit" | "missed" | "felled" | "slipped";

/** Margem das pontas da barra onde a área certa não aparece. */
const EDGE = 0.05;

export class ChoppingMinigame {
  /** Posição do marcador na barra (0–1). */
  marker = 0;
  zoneStart = 0;
  phase: ChoppingPhase = "playing";
  hits = 0;
  misses = 0;
  private direction = 1;
  private pauseLeft = 0;

  constructor() {
    this.newRound();
  }

  get zoneEnd(): number {
    return this.zoneStart + CHOP_ZONE_WIDTH;
  }

  /** Acabou (derrubou a árvore ou o machado escorregou)? */
  get over(): boolean {
    return this.phase === "felled" || this.phase === "slipped";
  }

  /** Sorteia outra área certa, longe do marcador. */
  private newRound(): void {
    this.zoneStart = EDGE + Math.random() * (1 - 2 * EDGE - CHOP_ZONE_WIDTH);
    const zoneMid = this.zoneStart + CHOP_ZONE_WIDTH / 2;
    this.marker = zoneMid > 0.5 ? 0 : 1;
    this.direction = zoneMid > 0.5 ? 1 : -1;
    this.phase = "playing";
  }

  /** Um golpe. Retorna o resultado ou null se estiver na pausa entre golpes. */
  press(): ChoppingPhase | null {
    if (this.phase !== "playing") return null;
    const inside = this.marker >= this.zoneStart && this.marker <= this.zoneEnd;
    if (inside) {
      this.hits++;
      this.phase = this.hits >= CHOP_HITS_TO_FELL ? "felled" : "hit";
    } else {
      this.misses++;
      this.phase = this.misses >= CHOP_MAX_MISSES ? "slipped" : "missed";
    }
    // No fim, a pausa é mais longa para dar tempo de ler o resultado.
    this.pauseLeft = (this.over ? CHOP_PAUSE_MS * 2 : CHOP_PAUSE_MS) / 1000;
    return this.phase;
  }

  /** Avança o marcador. Retorna true quando o minigame acabou e a pausa final terminou. */
  update(dt: number): boolean {
    if (this.phase !== "playing") {
      this.pauseLeft -= dt;
      if (this.pauseLeft > 0) return false;
      if (this.over) return true;
      this.newRound();
      return false;
    }
    this.marker += this.direction * CHOP_SPEED * dt;
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
