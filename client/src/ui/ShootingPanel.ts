// Painel do Tiro ao Alvo: patos acertados em sequência, mensagem, botão de sair e a mira
// no centro da tela.
import { SHOOTING_PRIZE, SHOOTING_TARGETS_TO_WIN } from "@jogo/shared/constants";
import type { ShootingPhase } from "@jogo/shared/protocol";
import { formatMoney } from "./shopUi";

/** O que o painel mostra. `lastShot` é o resultado do último tiro, visto no cliente. */
export interface ShootingView {
  ownerName: string;
  phase: ShootingPhase;
  hits: number;
  lastShot: "hit" | "miss" | null;
}

export class ShootingPanel {
  private readonly root = document.createElement("div");
  private readonly name = document.createElement("span");
  private readonly targets: HTMLSpanElement[] = [];
  private readonly message = document.createElement("div");
  private readonly crosshair = document.createElement("div");
  /** Clique em "Sair". */
  onExit: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    private readonly touchMode: boolean,
  ) {
    this.root.className = "shooting-panel";
    this.root.dataset.testid = "shooting-panel";
    this.root.hidden = true;

    const title = document.createElement("div");
    title.className = "shooting-title";
    title.textContent = "🎯 Tiro ao Alvo ";
    this.name.className = "shooting-owner";
    title.appendChild(this.name);

    const progress = document.createElement("div");
    progress.className = "shooting-progress";
    progress.dataset.testid = "shooting-progress";
    for (let i = 0; i < SHOOTING_TARGETS_TO_WIN; i++) {
      const target = document.createElement("span");
      target.className = "shooting-target";
      target.textContent = "🦆";
      this.targets.push(target);
      progress.appendChild(target);
    }

    this.message.className = "shooting-message";
    this.message.dataset.testid = "shooting-message";

    const exit = document.createElement("button");
    exit.type = "button";
    exit.className = "shooting-exit";
    exit.dataset.testid = "shooting-exit";
    exit.textContent = touchMode ? "Sair" : "Sair (Q)";
    exit.addEventListener("click", () => {
      // Tira o foco para o Espaço (pular) não acionar o botão de novo.
      exit.blur();
      this.onExit?.();
    });

    this.crosshair.className = "shooting-crosshair";
    this.crosshair.dataset.testid = "shooting-crosshair";
    this.crosshair.hidden = true;

    this.root.append(title, progress, this.message, exit);
    container.append(this.root, this.crosshair);
  }

  show(): void {
    this.root.hidden = false;
    this.crosshair.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.crosshair.hidden = true;
  }

  render(view: ShootingView): void {
    this.name.textContent = `· ${view.ownerName}`;
    this.root.dataset.phase = view.phase;
    this.crosshair.hidden = view.phase !== "playing";
    this.targets.forEach((t, i) => t.classList.toggle("shooting-target--hit", i < view.hits));
    this.message.textContent = this.messageFor(view);
  }

  private messageFor({ phase, hits, lastShot }: ShootingView): string {
    if (phase === "won") return `Parabéns! Você ganhou ${formatMoney(SHOOTING_PRIZE)}! 🏆`;
    // O erro aparece na hora; o servidor confirma o fim logo depois.
    if (phase === "lost" || lastShot === "miss") return "Errou! Fim de jogo.";
    if (lastShot === "hit") return hits > 0 ? `Acertou! ${hits}/${SHOOTING_TARGETS_TO_WIN}` : "Acertou!";
    const how = this.touchMode ? "Arraste a tela para mirar e toque em Atirar" : "Mire com o mouse e aperte F ou clique";
    return `${how}. Acerte ${SHOOTING_TARGETS_TO_WIN} patos seguidos!`;
  }

  dispose(): void {
    this.root.remove();
    this.crosshair.remove();
  }
}
