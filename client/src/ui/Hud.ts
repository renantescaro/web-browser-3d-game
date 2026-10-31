// HUD: contador "X/10 online", peixes pescados, dinheiro, ação atual, botão da música, ajuda de controles,
// aviso de conexão, avisos curtos e dica do mouse.
// No celular (touchMode) não há ajuda de controles nem dica do mouse.
import { MAX_PLAYERS } from "@jogo/shared/constants";
import { formatMoney } from "./MerchantPanel";

/** Por quanto tempo um aviso curto fica na tela (ms). */
const NOTICE_MS = 2500;

export class Hud {
  private readonly root = document.createElement("div");
  private readonly online = document.createElement("div");
  private readonly status = document.createElement("div");
  private readonly hint = document.createElement("div");
  private readonly musicButton = document.createElement("button");
  private readonly fishCount = document.createElement("div");
  private readonly money = document.createElement("div");
  private readonly action = document.createElement("div");
  private readonly notice = document.createElement("div");
  private noticeTimeout: ReturnType<typeof setTimeout> | null = null;
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

    this.fishCount.className = "hud-fish";
    this.fishCount.dataset.testid = "fish-count";
    this.fishCount.title = "Peixes pescados";
    this.setFishCount(0);

    this.money.className = "hud-money";
    this.money.dataset.testid = "money";
    this.money.title = "Dinheiro";
    this.setMoney(0);

    // No computador mostra o que a tecla de Ação faz agora; no celular o próprio botão muda.
    this.action.className = "hud-action";
    this.action.dataset.testid = "action-label";
    this.action.hidden = touchMode;

    this.notice.className = "hud-notice";
    this.notice.dataset.testid = "hud-notice";
    this.notice.hidden = true;

    this.hint.className = "hud-hint";
    this.hint.textContent = "Clique na tela para controlar a câmera";
    this.hint.hidden = touchMode;

    const topRight = document.createElement("div");
    topRight.className = "hud-top-right";
    topRight.append(this.musicButton, this.fishCount, this.money, this.online);
    this.root.append(topRight, this.status, this.notice, this.hint, this.action);

    // A ajuda de teclas só aparece no computador; no celular os botões já se explicam.
    if (!touchMode) {
      const help = document.createElement("div");
      help.className = "hud-help";
      help.dataset.testid = "controls-help";
      help.innerHTML =
        "<b>WASD</b> mover · <b>Shift</b> correr · <b>Espaço</b> pular<br>" +
        "<b>Clique</b> ou <b>F</b> ação (bater/pescar/negociar/jogar) · <b>Mouse</b> câmera · <b>Esc</b> soltar o mouse · <b>M</b> música · <b>1–4</b> reações";
      this.root.append(help);
    }
    container.appendChild(this.root);
  }

  setOnline(count: number): void {
    this.online.textContent = `${count}/${MAX_PLAYERS} online`;
  }

  setFishCount(count: number): void {
    this.fishCount.textContent = `🐟 ${count}`;
  }

  setMoney(amount: number): void {
    this.money.textContent = `💰 ${formatMoney(amount)}`;
  }

  /** Mostra o que o botão de Ação faz agora (ex.: "Bater", "Pescar"). */
  setAction(label: string): void {
    this.action.innerHTML = `<b>F</b> ${label}`;
  }

  /** Mostra um aviso curto no meio da tela (ex.: sem dinheiro para jogar). */
  notify(text: string): void {
    if (this.noticeTimeout !== null) clearTimeout(this.noticeTimeout);
    this.notice.textContent = text;
    this.notice.hidden = false;
    this.noticeTimeout = setTimeout(() => {
      this.notice.hidden = true;
      this.noticeTimeout = null;
    }, NOTICE_MS);
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
    if (this.noticeTimeout !== null) clearTimeout(this.noticeTimeout);
    this.root.remove();
  }
}
