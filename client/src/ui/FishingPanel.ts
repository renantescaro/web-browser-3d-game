// Painel do minigame de pesca: barra com a área certa, marcador, mensagem e botão de sair.
import type { FishingMinigame } from "../game/FishingMinigame";

export class FishingPanel {
  private readonly root = document.createElement("div");
  private readonly level = document.createElement("span");
  private readonly zone = document.createElement("div");
  private readonly marker = document.createElement("div");
  private readonly message = document.createElement("div");
  /** Clique em "Sair". */
  onExit: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    private readonly touchMode: boolean,
  ) {
    this.root.className = "fishing-panel";
    this.root.dataset.testid = "fishing-panel";
    this.root.hidden = true;

    const title = document.createElement("div");
    title.className = "fishing-title";
    title.textContent = "🎣 Pescando ";
    this.level.className = "fishing-level";
    title.appendChild(this.level);

    const bar = document.createElement("div");
    bar.className = "fishing-bar";
    this.zone.className = "fishing-zone";
    this.marker.className = "fishing-marker";
    bar.append(this.zone, this.marker);

    this.message.className = "fishing-message";

    const exit = document.createElement("button");
    exit.type = "button";
    exit.className = "fishing-exit";
    exit.dataset.testid = "fishing-exit";
    exit.textContent = touchMode ? "Sair" : "Sair (Q)";
    exit.addEventListener("click", () => {
      exit.blur();
      this.onExit?.();
    });

    this.root.append(title, bar, this.message, exit);
    container.appendChild(this.root);
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  render(game: FishingMinigame): void {
    this.level.textContent = `· nível ${game.level}`;
    this.zone.style.left = `${game.zoneStart * 100}%`;
    this.zone.style.width = `${game.difficulty.zoneWidth * 100}%`;
    this.marker.style.left = `${game.marker * 100}%`;
    this.root.dataset.phase = game.phase;
    if (game.phase === "caught") this.message.textContent = "Pegou um peixe! 🐟";
    else if (game.phase === "missed") this.message.textContent = "Escapou… tente de novo";
    else this.message.textContent = this.touchMode ? "Toque em Fisgar na área verde!" : "Aperte F na área verde!";
  }

  dispose(): void {
    this.root.remove();
  }
}
