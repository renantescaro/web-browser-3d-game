// Pesca na fonte: detecta se o jogador está de frente para ela, abre/fecha o minigame,
// mostra a vara e manda os peixes pescados ao servidor. Guarda a contagem de peixes
// (o inventário de peixes do jogador).
import { FISHING_FACING_DEG, FISHING_REACH, FOUNTAIN_RADIUS } from "@jogo/shared/constants";
import { distanceXZ, isFacingFountain } from "@jogo/shared/math";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { FishingPanel } from "../ui/FishingPanel";
import { FishingMinigame, type FishingPhase } from "./FishingMinigame";
import { ACTION_LABELS, type ActionHandler, type ActionLabel } from "./ActionResolver";
import type { Intents } from "./Input";
import type { SquareManager } from "./SquareManager";

/** Folga extra (m) antes de o minigame fechar sozinho porque o jogador foi empurrado para longe. */
const LEAVE_SLACK = 0.8;

export interface FishingDebugInfo {
  active: boolean;
  count: number;
  phase: FishingPhase | null;
  marker: number;
  zoneStart: number;
  zoneEnd: number;
  speed: number;
}

export class FishingController implements ActionHandler {
  /** Avisado quando a contagem de peixes muda. */
  onCount: ((count: number) => void) | null = null;

  private readonly panel: FishingPanel;
  private minigame: FishingMinigame | null = null;
  private count = 0;

  constructor(
    container: HTMLElement,
    touchMode: boolean,
    private readonly local: LocalPlayer,
    private readonly square: SquareManager,
    private readonly network: Network,
  ) {
    this.panel = new FishingPanel(container, touchMode);
    this.panel.onExit = () => this.stop();
  }

  get active(): boolean {
    return this.minigame !== null;
  }

  get fishCount(): number {
    return this.count;
  }

  /** Contagem vinda do servidor (welcome ou `fishCount`). */
  setCount(count: number): void {
    this.count = count;
    this.network.rememberFishCaught(count);
    this.onCount?.(count);
  }

  /** O jogador está de frente para a fonte, perto o bastante para pescar? */
  private canFish(): boolean {
    const fountain = this.square.fountainPosition();
    if (!fountain) return false;
    const p = this.local.renderPosition;
    return isFacingFountain(p, this.local.rotationY, fountain, FOUNTAIN_RADIUS, FISHING_REACH, FISHING_FACING_DEG);
  }

  /** Chamar todo frame, antes de tratar a Ação: sai da pesca se pedido e anima o minigame. */
  update(dt: number, intents: Intents): void {
    if (this.minigame) {
      const moving = intents.moveX !== 0 || intents.moveZ !== 0 || intents.jump;
      if (intents.cancel || moving || this.pushedAway()) {
        this.stop();
      } else {
        if (this.minigame.update(dt)) this.minigame.newRound(this.count);
        this.panel.render(this.minigame);
      }
    }
  }

  actionLabel(): ActionLabel | null {
    if (this.minigame) return ACTION_LABELS.hook;
    return this.canFish() ? ACTION_LABELS.fish : null;
  }

  /** Fisga (no minigame) ou começa a pescar. */
  act(): void {
    if (!this.minigame) {
      this.start();
      return;
    }
    if (this.minigame.press() === "caught") this.network.catchFish();
    this.panel.render(this.minigame);
  }

  private start(): void {
    const fountain = this.square.fountainPosition();
    if (fountain) this.local.faceTowards(fountain.x, fountain.z);
    this.local.stance = "fish";
    this.minigame = new FishingMinigame(this.count);
    this.panel.render(this.minigame);
    this.panel.show();
  }

  /** Sai do minigame (a contagem continua). */
  stop(): void {
    if (!this.minigame) return;
    this.minigame = null;
    this.local.stance = null;
    this.panel.hide();
  }

  /** Foi empurrado (soco) para longe da fonte? */
  private pushedAway(): boolean {
    const fountain = this.square.fountainPosition();
    if (!fountain) return true;
    return distanceXZ(this.local.renderPosition, fountain) > FOUNTAIN_RADIUS + FISHING_REACH + LEAVE_SLACK;
  }

  debugInfo(): FishingDebugInfo {
    const m = this.minigame;
    return {
      active: m !== null,
      count: this.count,
      phase: m?.phase ?? null,
      marker: m?.marker ?? 0,
      zoneStart: m?.zoneStart ?? 0,
      zoneEnd: m?.zoneEnd ?? 0,
      speed: m?.difficulty.speed ?? 0,
    };
  }

  dispose(): void {
    this.stop();
    this.panel.dispose();
  }
}
