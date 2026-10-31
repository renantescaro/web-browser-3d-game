// Painel do minigame de cortar árvore: barra com a área certa, marcador, golpes dados,
// mensagem e botão de sair. Usa o visual do painel da pesca, com cores de madeira.
import { CHOP_HITS_TO_FELL, CHOP_MAX_MISSES } from "@jogo/shared/constants";
import type { ChoppingMinigame } from "../game/ChoppingMinigame";
import { shopButton } from "./shopUi";

export class ChoppingPanel {
  private readonly root = document.createElement("div");
  private readonly pips = document.createElement("span");
  private readonly zone = document.createElement("div");
  private readonly marker = document.createElement("div");
  private readonly message = document.createElement("div");
  /** Clique em "Sair". */
  onExit: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    private readonly touchMode: boolean,
  ) {
    this.root.className = "fishing-panel chopping-panel";
    this.root.dataset.testid = "chopping-panel";
    this.root.hidden = true;

    const title = document.createElement("div");
    title.className = "fishing-title";
    title.textContent = "🪓 Cortando árvore ";
    this.pips.className = "fishing-level chopping-pips";
    title.appendChild(this.pips);

    const bar = document.createElement("div");
    bar.className = "fishing-bar";
    this.zone.className = "fishing-zone";
    this.marker.className = "fishing-marker";
    bar.append(this.zone, this.marker);

    this.message.className = "fishing-message";

    const exit = shopButton("fishing-exit", touchMode ? "Sair" : "Sair (Q)", () => this.onExit?.());
    exit.dataset.testid = "chopping-exit";

    this.root.append(title, bar, this.message, exit);
    container.appendChild(this.root);
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  render(game: ChoppingMinigame): void {
    const hits = "🪵".repeat(game.hits) + "▫️".repeat(Math.max(0, CHOP_HITS_TO_FELL - game.hits));
    const misses = "❌".repeat(game.misses);
    this.pips.textContent = `${hits} ${misses}`;
    this.zone.style.left = `${game.zoneStart * 100}%`;
    this.zone.style.width = `${(game.zoneEnd - game.zoneStart) * 100}%`;
    this.marker.style.left = `${game.marker * 100}%`;
    this.root.dataset.phase = game.phase;
    const left = CHOP_MAX_MISSES - game.misses;
    const messages: Record<typeof game.phase, string> = {
      playing: this.touchMode ? "Toque em Golpear na área amarela!" : "Aperte F na área amarela!",
      hit: "Toc! Mais um golpe…",
      missed: `Errou! ${left} ${left === 1 ? "chance" : "chances"}`,
      felled: "Madeiraaa! A árvore caiu 🪵",
      slipped: "O machado escorregou… tente de novo",
    };
    this.message.textContent = messages[game.phase];
  }

  dispose(): void {
    this.root.remove();
  }
}
