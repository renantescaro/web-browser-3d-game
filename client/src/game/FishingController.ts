// Pesca na fonte: detecta se o jogador está de frente para ela, abre/fecha o minigame,
// mostra a vara e manda os peixes pescados ao servidor (que os põe no inventário). Com o
// inventário cheio, avisa e não deixa pescar.
import { FISHING_FACING_DEG, FISHING_REACH, FOUNTAIN_RADIUS } from "@jogo/shared/constants";
import { distanceXZ, isFacingFountain } from "@jogo/shared/math";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { FishingPanel } from "../ui/FishingPanel";
import { FishingMinigame, type FishingPhase } from "./FishingMinigame";
import { ACTION_LABELS, type ActionHandler, type ActionLabel } from "./ActionResolver";
import type { Intents } from "./Input";
import { INVENTORY_FULL_NOTICE, type PlayerInventory } from "./PlayerInventory";
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
  /** Aviso curto na tela (ex.: inventário cheio). */
  onNotice: ((text: string) => void) | null = null;

  private readonly panel: FishingPanel;
  private minigame: FishingMinigame | null = null;

  constructor(
    container: HTMLElement,
    touchMode: boolean,
    private readonly local: LocalPlayer,
    private readonly square: SquareManager,
    private readonly network: Network,
    private readonly inventory: PlayerInventory,
  ) {
    this.panel = new FishingPanel(container, touchMode);
    this.panel.onExit = () => this.stop();
  }

  get active(): boolean {
    return this.minigame !== null;
  }

  /** Peixes no inventário (a dificuldade do minigame cresce com eles). */
  private get count(): number {
    return this.inventory.count("fish");
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
        if (this.minigame.update(dt)) {
          // Encheu o inventário com o último peixe: não dá para pescar mais.
          if (!this.inventory.canAdd("fish")) {
            this.stop();
            this.onNotice?.(INVENTORY_FULL_NOTICE);
            return;
          }
          this.minigame.newRound(this.count);
        }
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
      if (this.inventory.canAdd("fish")) this.start();
      else this.onNotice?.(INVENTORY_FULL_NOTICE);
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
