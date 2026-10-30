// Liga o botão de Ação à pesca: detecta se o jogador está de frente para a fonte,
// abre/fecha o minigame, mostra a vara e manda os peixes pescados ao servidor.
import { FISHING_FACING_DEG, FISHING_REACH, FOUNTAIN_RADIUS } from "@jogo/shared/constants";
import { distanceXZ, isFacingFountain } from "@jogo/shared/math";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { FishingPanel } from "../ui/FishingPanel";
import { FishingMinigame, type FishingPhase } from "./FishingMinigame";
import type { Intents } from "./Input";
import type { SquareManager } from "./SquareManager";

/** Rótulos do botão de Ação. */
export const ACTION_LABELS = { punch: "Bater", fish: "Pescar", hook: "Fisgar" } as const;
export type ActionLabel = (typeof ACTION_LABELS)[keyof typeof ACTION_LABELS];

/** Folga extra (m) antes de o minigame fechar sozinho porque o jogador foi empurrado para longe. */
const LEAVE_SLACK = 0.8;

export interface FishingDebugInfo {
  active: boolean;
  label: ActionLabel;
  count: number;
  phase: FishingPhase | null;
  marker: number;
  zoneStart: number;
  zoneEnd: number;
  speed: number;
}

export class FishingController {
  /** Avisado quando o rótulo da Ação muda. */
  onActionLabel: ((label: ActionLabel) => void) | null = null;
  /** Avisado quando a contagem de peixes muda. */
  onCount: ((count: number) => void) | null = null;

  private readonly panel: FishingPanel;
  private minigame: FishingMinigame | null = null;
  private label: ActionLabel = ACTION_LABELS.punch;
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

  /** Chamar todo frame, antes de tratar a Ação: sai da pesca se pedido e atualiza o rótulo. */
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
    this.setLabel(this.minigame ? ACTION_LABELS.hook : this.canFish() ? ACTION_LABELS.fish : ACTION_LABELS.punch);
  }

  /** Trata o botão de Ação. Retorna false se não for com a pesca (aí a Ação é bater). */
  handleAction(): boolean {
    if (this.minigame) {
      if (this.minigame.press() === "caught") this.network.catchFish();
      this.panel.render(this.minigame);
      return true;
    }
    if (!this.canFish()) return false;
    this.start();
    return true;
  }

  private start(): void {
    const fountain = this.square.fountainPosition();
    if (fountain) this.local.faceTowards(fountain.x, fountain.z);
    this.local.fishing = true;
    this.minigame = new FishingMinigame(this.count);
    this.panel.render(this.minigame);
    this.panel.show();
    this.setLabel(ACTION_LABELS.hook);
  }

  /** Sai do minigame (a contagem continua). */
  stop(): void {
    if (!this.minigame) return;
    this.minigame = null;
    this.local.fishing = false;
    this.panel.hide();
  }

  /** Foi empurrado (soco) para longe da fonte? */
  private pushedAway(): boolean {
    const fountain = this.square.fountainPosition();
    if (!fountain) return true;
    return distanceXZ(this.local.renderPosition, fountain) > FOUNTAIN_RADIUS + FISHING_REACH + LEAVE_SLACK;
  }

  private setLabel(label: ActionLabel): void {
    if (label === this.label) return;
    this.label = label;
    this.onActionLabel?.(label);
  }

  debugInfo(): FishingDebugInfo {
    const m = this.minigame;
    return {
      active: m !== null,
      label: this.label,
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
