// Cortar árvore: com machado no inventário e de frente para uma árvore em pé, a Ação abre o
// minigame (machado erguido). Cada acerto é um golpe; ao derrubar, manda `chopTree` ao servidor,
// que confere tudo, põe a madeira no inventário e avisa todos para trocar a árvore por um toco.
import { CHOP_RANGE, WOOD_PER_TREE } from "@jogo/shared/constants";
import { distanceXZ } from "@jogo/shared/math";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { ChoppingPanel } from "../ui/ChoppingPanel";
import { ACTION_LABELS, type ActionHandler, type ActionLabel } from "./ActionResolver";
import { ChoppingMinigame, type ChoppingPhase } from "./ChoppingMinigame";
import type { Intents } from "./Input";
import { INVENTORY_FULL_NOTICE, type PlayerInventory } from "./PlayerInventory";
import type { TreesManager } from "./TreesManager";

/** Folga extra (m) antes de o minigame fechar sozinho porque o jogador foi empurrado para longe. */
const LEAVE_SLACK = 0.8;

export interface ChoppingDebugInfo {
  active: boolean;
  treeId: string | null;
  phase: ChoppingPhase | null;
  marker: number;
  zoneStart: number;
  zoneEnd: number;
  hits: number;
  misses: number;
}

export class ChoppingController implements ActionHandler {
  /** Aviso curto na tela (ex.: inventário cheio). */
  onNotice: ((text: string) => void) | null = null;

  private readonly panel: ChoppingPanel;
  private minigame: ChoppingMinigame | null = null;
  private treeId: string | null = null;

  constructor(
    container: HTMLElement,
    touchMode: boolean,
    private readonly local: LocalPlayer,
    private readonly trees: TreesManager,
    private readonly network: Network,
    private readonly inventory: PlayerInventory,
  ) {
    this.panel = new ChoppingPanel(container, touchMode);
    this.panel.onExit = () => this.stop();
  }

  get active(): boolean {
    return this.minigame !== null;
  }

  /** Árvore que seria cortada agora (precisa de machado), ou null. */
  private target(): string | null {
    if (this.inventory.count("axe") <= 0) return null;
    return this.trees.chopTarget(this.local.renderPosition, this.local.rotationY);
  }

  actionLabel(): ActionLabel | null {
    if (this.minigame) return ACTION_LABELS.swing;
    return this.target() ? ACTION_LABELS.chop : null;
  }

  /** Golpeia (no minigame) ou começa a cortar, se couber a madeira. */
  act(): void {
    if (this.minigame && this.treeId) {
      const result = this.minigame.press();
      if (result === "hit" || result === "felled") {
        this.local.character.playChop();
        this.trees.shake(this.treeId);
      }
      if (result === "felled") this.network.chopTree(this.treeId);
      this.panel.render(this.minigame);
      return;
    }
    const treeId = this.target();
    if (!treeId) return;
    if (!this.inventory.canAdd("wood", WOOD_PER_TREE)) {
      this.onNotice?.(INVENTORY_FULL_NOTICE);
      return;
    }
    this.start(treeId);
  }

  private start(treeId: string): void {
    const tree = this.trees.position(treeId);
    if (tree) this.local.faceTowards(tree.x, tree.z);
    this.treeId = treeId;
    this.local.stance = "chop";
    this.minigame = new ChoppingMinigame();
    this.panel.render(this.minigame);
    this.panel.show();
  }

  /** Chamar todo frame, antes de tratar a Ação: sai se pedido e anima o minigame. */
  update(dt: number, intents: Intents): void {
    if (!this.minigame || !this.treeId) return;
    const moving = intents.moveX !== 0 || intents.moveZ !== 0 || intents.jump;
    const felled = this.minigame.phase === "felled";
    // Outro jogador derrubou a árvore primeiro.
    if (!felled && !this.trees.isStanding(this.treeId)) {
      this.stop();
      this.onNotice?.("Alguém derrubou essa árvore antes 🪵");
      return;
    }
    if (intents.cancel || moving || this.pushedAway()) {
      this.stop();
      return;
    }
    if (this.minigame.update(dt)) this.stop();
    else this.panel.render(this.minigame);
  }

  /** Sai do minigame (a árvore continua como estiver). */
  stop(): void {
    if (!this.minigame) return;
    this.minigame = null;
    this.treeId = null;
    this.local.stance = null;
    this.panel.hide();
  }

  /** Foi empurrado (soco) para longe da árvore? */
  private pushedAway(): boolean {
    const tree = this.treeId ? this.trees.position(this.treeId) : null;
    return !tree || distanceXZ(this.local.renderPosition, tree) > CHOP_RANGE + LEAVE_SLACK;
  }

  debugInfo(): ChoppingDebugInfo {
    const m = this.minigame;
    return {
      active: m !== null,
      treeId: this.treeId,
      phase: m?.phase ?? null,
      marker: m?.marker ?? 0,
      zoneStart: m?.zoneStart ?? 0,
      zoneEnd: m?.zoneEnd ?? 0,
      hits: m?.hits ?? 0,
      misses: m?.misses ?? 0,
    };
  }

  dispose(): void {
    this.stop();
    this.panel.dispose();
  }
}
