// Tela de entrada: nome + cor. Só sai daqui depois de receber `welcome`.
import { MAX_PLAYERS, NAME_MAX_LENGTH, NAME_MIN_LENGTH, PLAYER_COLORS } from "@jogo/shared/constants";
import type { JoinMessage, JoinRejectReason, LobbyMessage, WelcomeMessage } from "@jogo/shared/protocol";
import type { Network } from "../net/Network";

const COLOR_NAMES = ["vermelho", "laranja", "amarelo", "verde-água", "verde", "azul", "anil", "roxo", "rosa", "marrom"];

export const REJECT_MESSAGES: Record<JoinRejectReason, string> = {
  full: "Sala cheia, tente novamente em instantes",
  invalidName: "Nome inválido. Use de 1 a 16 caracteres, sem HTML.",
  colorTaken: "Essa cor já está em uso. Escolha outra.",
};

export type JoinedHandler = (welcome: WelcomeMessage, info: JoinMessage) => void;

export class JoinScreen {
  private readonly root = document.createElement("div");
  private readonly nameInput = document.createElement("input");
  private readonly swatches = new Map<string, HTMLButtonElement>();
  private readonly status = document.createElement("p");
  private readonly error = document.createElement("p");
  private readonly submit = document.createElement("button");
  private selectedColor: string | null = null;
  private takenColors = new Set<string>();
  private playerCount = 0;
  private pending: JoinMessage | null = null;

  constructor(
    container: HTMLElement,
    private readonly network: Network,
    private readonly onJoined: JoinedHandler,
  ) {
    this.build();
    container.appendChild(this.root);

    const socket = network.socket;
    socket.on("lobby", this.onLobby);
    socket.on("welcome", this.onWelcome);
    socket.on("joinRejected", ({ reason }) => this.onRejected(reason));
    socket.on("connect", () => this.updateStatus());
    socket.on("disconnect", () => this.updateStatus());
    this.updateStatus();
  }

  private build(): void {
    this.root.className = "join-screen";
    const form = document.createElement("form");
    form.className = "join-card";
    form.noValidate = true;

    const title = document.createElement("h1");
    title.textContent = "Empurrão";
    const subtitle = document.createElement("p");
    subtitle.className = "subtitle";
    subtitle.textContent = "Escolha um nome e uma cor para entrar.";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Nome";
    this.nameInput.type = "text";
    this.nameInput.name = "name";
    this.nameInput.maxLength = NAME_MAX_LENGTH;
    this.nameInput.autocomplete = "off";
    this.nameInput.placeholder = "Seu nome";
    nameLabel.appendChild(this.nameInput);

    const colorLabel = document.createElement("label");
    colorLabel.textContent = "Cor";
    colorLabel.id = "color-label";
    const grid = document.createElement("div");
    grid.className = "color-grid";
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-labelledby", colorLabel.id);
    PLAYER_COLORS.forEach((color, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "color-swatch";
      b.style.backgroundColor = color;
      b.dataset.color = color;
      b.setAttribute("aria-label", `Cor ${COLOR_NAMES[i] ?? color}`);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => this.selectColor(color));
      this.swatches.set(color, b);
      grid.appendChild(b);
    });

    this.status.className = "join-status";
    this.error.className = "join-error";
    this.error.setAttribute("role", "alert");
    this.submit.type = "submit";
    this.submit.textContent = "Entrar";

    form.append(title, subtitle, nameLabel, colorLabel, grid, this.status, this.error, this.submit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.trySubmit();
    });
    this.root.appendChild(form);
  }

  private selectColor(color: string | null): void {
    this.selectedColor = color;
    for (const [c, b] of this.swatches) b.setAttribute("aria-pressed", String(c === color));
  }

  private trySubmit(): void {
    const name = this.nameInput.value.trim();
    if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH || /[<>]/.test(name)) {
      this.showError(REJECT_MESSAGES.invalidName);
      return;
    }
    // Com a sala cheia todas as cores estão ocupadas; o servidor responde "full" mesmo sem cor.
    const roomFull = this.playerCount >= MAX_PLAYERS;
    if (!this.selectedColor && !roomFull) {
      this.showError("Escolha uma cor.");
      return;
    }
    // Se ainda não conectou, o Socket.IO guarda o `join` e envia assim que a conexão abrir.
    this.showError(this.network.connected ? "" : "Conectando ao servidor… você entra assim que a conexão abrir.");
    this.pending = { name, color: this.selectedColor ?? "" };
    this.submit.disabled = true;
    this.network.join(this.pending);
  }

  private readonly onLobby = (msg: LobbyMessage): void => {
    this.takenColors = new Set(msg.takenColors);
    for (const [color, b] of this.swatches) b.disabled = this.takenColors.has(color);
    if (this.selectedColor && this.takenColors.has(this.selectedColor) && !this.pending) this.selectColor(null);
    this.playerCount = msg.playerCount;
    this.updateStatus();
  };

  private updateStatus(): void {
    this.status.textContent = this.network.connected
      ? `${this.playerCount}/${MAX_PLAYERS} online`
      : "Conectando ao servidor…";
  }

  private readonly onWelcome = (msg: WelcomeMessage): void => {
    if (!this.pending || this.root.hidden) return;
    const info = this.pending;
    this.pending = null;
    this.submit.disabled = false;
    this.network.setSession(info);
    this.hide();
    this.onJoined(msg, info);
  };

  private onRejected(reason: JoinRejectReason): void {
    if (this.root.hidden) return;
    this.pending = null;
    this.submit.disabled = false;
    if (reason === "colorTaken") this.selectColor(null);
    this.showError(REJECT_MESSAGES[reason]);
  }

  private showError(text: string): void {
    this.error.textContent = text;
  }

  show(errorText = ""): void {
    this.root.hidden = false;
    this.pending = null;
    this.submit.disabled = false;
    this.showError(errorText);
    this.nameInput.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }
}
