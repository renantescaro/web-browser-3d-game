// HUD: contador "X/10 online", botão da música, ajuda de controles, aviso de conexão e dica do mouse.
// No celular (touchMode) a ajuda descreve os controles de toque e não há dica do mouse.
import { MAX_PLAYERS } from "@jogo/shared/constants";

export class Hud {
  private readonly root = document.createElement("div");
  private readonly online = document.createElement("div");
  private readonly status = document.createElement("div");
  private readonly hint = document.createElement("div");
  private readonly musicButton = document.createElement("button");
  /** Clique no botão da música. */
  onMusicToggle: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    private readonly touchMode: boolean,
  ) {
    this.root.className = "hud";

    this.online.className = "hud-online";
    this.online.dataset.testid = "online-count";

    this.status.className = "hud-status";
    this.status.hidden = true;

    this.musicButton.type = "button";
    this.musicButton.className = "hud-music";
    this.musicButton.dataset.testid = "music-toggle";
    this.musicButton.addEventListener("click", () => {
      // Tira o foco para o Espaço (pular) não acionar o botão de novo.
      this.musicButton.blur();
      this.onMusicToggle?.();
    });

    this.hint.className = "hud-hint";
    this.hint.textContent = "Clique na tela para controlar a câmera";
    this.hint.hidden = touchMode;

    const help = document.createElement("div");
    help.className = touchMode ? "hud-help hud-help-touch" : "hud-help";
    help.dataset.testid = "controls-help";
    help.innerHTML = touchMode
      ? "<b>Analógico</b> mover (até a borda: correr)<br><b>Arraste a tela</b> câmera"
      : "<b>WASD</b> mover · <b>Shift</b> correr · <b>Espaço</b> pular<br>" +
        "<b>Clique</b> ou <b>F</b> bater · <b>Mouse</b> câmera · <b>Esc</b> soltar o mouse · <b>M</b> música";

    const topRight = document.createElement("div");
    topRight.className = "hud-top-right";
    topRight.append(this.musicButton, this.online);
    this.root.append(topRight, this.status, this.hint, help);
    container.appendChild(this.root);
  }

  setOnline(count: number): void {
    this.online.textContent = `${count}/${MAX_PLAYERS} online`;
  }

  setMusicMuted(muted: boolean): void {
    this.musicButton.textContent = muted ? "🔇" : "🎵";
    this.musicButton.title = muted ? "Ligar a música" : "Desligar a música";
    this.musicButton.setAttribute("aria-label", this.musicButton.title);
  }

  setConnected(connected: boolean): void {
    this.status.hidden = connected;
    this.status.textContent = "Conexão perdida. Reconectando…";
  }

  setPointerLocked(locked: boolean): void {
    if (!this.touchMode) this.hint.hidden = locked;
  }

  dispose(): void {
    this.root.remove();
  }
}
