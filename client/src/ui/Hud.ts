// HUD: contador "X/10 online", ajuda de controles, aviso de conexão e dica do mouse.
import { MAX_PLAYERS } from "@jogo/shared/constants";

export class Hud {
  private readonly root = document.createElement("div");
  private readonly online = document.createElement("div");
  private readonly status = document.createElement("div");
  private readonly hint = document.createElement("div");

  constructor(container: HTMLElement) {
    this.root.className = "hud";

    this.online.className = "hud-online";
    this.online.dataset.testid = "online-count";

    this.status.className = "hud-status";
    this.status.hidden = true;

    this.hint.className = "hud-hint";
    this.hint.textContent = "Clique na tela para controlar a câmera";

    const help = document.createElement("div");
    help.className = "hud-help";
    help.innerHTML =
      "<b>WASD</b> mover · <b>Shift</b> correr · <b>Espaço</b> pular<br>" +
      "<b>Clique</b> ou <b>F</b> bater · <b>Mouse</b> câmera · <b>Esc</b> soltar o mouse";

    this.root.append(this.online, this.status, this.hint, help);
    container.appendChild(this.root);
  }

  setOnline(count: number): void {
    this.online.textContent = `${count}/${MAX_PLAYERS} online`;
  }

  setConnected(connected: boolean): void {
    this.status.hidden = connected;
    this.status.textContent = "Conexão perdida. Reconectando…";
  }

  setPointerLocked(locked: boolean): void {
    this.hint.hidden = locked;
  }

  dispose(): void {
    this.root.remove();
  }
}
