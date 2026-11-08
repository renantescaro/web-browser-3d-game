// Painel da corrida de kart: fase (espera, contagem, volta, resultado), classificação, botão de
// sair, a contagem grande no meio da tela e o velocímetro (0 a 60 km/h).
import { KART_MAX_SPEED_KMH, MAX_PLAYERS } from "@jogo/shared/constants";
import type { KartPhase, KartRacer } from "@jogo/shared/protocol";
import { formatMoney } from "./shopUi";

/** O que o painel mostra. */
export interface KartView {
  ownerName: string;
  phase: KartPhase;
  msLeft: number;
  laps: number;
  selfId: string;
  racers: KartRacer[];
  winnerId: string | null;
  prize: number;
}

/** Quanto tempo o "JÁ!" fica na tela depois da largada (ms). */
const GO_MS = 900;
/** Mostrador: centro, raio e ângulo (graus, 0 = para cima) do 0 e do máximo. */
const DIAL = { cx: 60, cy: 62, r: 46, from: -120, to: 120 } as const;

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: DIAL.cx + Math.sin(a) * r, y: DIAL.cy - Math.cos(a) * r };
}

/** O desenho do velocímetro (arco, marcas de 10 em 10 e o ponteiro). */
function speedometerSvg(): string {
  const start = polar(DIAL.from, DIAL.r);
  const end = polar(DIAL.to, DIAL.r);
  let marks = "";
  for (let kmh = 0; kmh <= KART_MAX_SPEED_KMH; kmh += 10) {
    const angle = DIAL.from + ((DIAL.to - DIAL.from) * kmh) / KART_MAX_SPEED_KMH;
    const a = polar(angle, DIAL.r - 2);
    const b = polar(angle, DIAL.r - 9);
    const t = polar(angle, DIAL.r - 18);
    marks += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`;
    marks += `<text x="${t.x}" y="${t.y}">${kmh}</text>`;
  }
  return (
    `<svg viewBox="0 0 120 92" aria-hidden="true">` +
    `<path class="kart-speedo-arc" d="M ${start.x} ${start.y} A ${DIAL.r} ${DIAL.r} 0 1 1 ${end.x} ${end.y}" />` +
    `<g class="kart-speedo-marks">${marks}</g>` +
    `<line class="kart-speedo-needle" x1="${DIAL.cx}" y1="${DIAL.cy}" x2="${DIAL.cx}" y2="${DIAL.cy - DIAL.r + 8}" />` +
    `<circle class="kart-speedo-hub" cx="${DIAL.cx}" cy="${DIAL.cy}" r="4" />` +
    `</svg>`
  );
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

export class KartPanel {
  private readonly root = document.createElement("div");
  private readonly status = document.createElement("div");
  private readonly standings = document.createElement("ol");
  private readonly countdown = document.createElement("div");
  private readonly speedo = document.createElement("div");
  private readonly speedValue = document.createElement("div");
  private readonly needle: SVGLineElement | null;
  private lastPhase: KartPhase = "idle";
  private goUntil = 0;
  /** Clique em "Sair". */
  onExit: (() => void) | null = null;

  constructor(container: HTMLElement, touchMode: boolean) {
    this.root.className = "kart-panel";
    this.root.dataset.testid = "kart-panel";
    this.root.hidden = true;

    const title = document.createElement("div");
    title.className = "kart-title";
    title.textContent = "🏁 Kartódromo";
    this.status.className = "kart-status";
    this.status.dataset.testid = "kart-status";
    this.standings.className = "kart-standings";
    this.standings.dataset.testid = "kart-standings";

    const exit = document.createElement("button");
    exit.type = "button";
    exit.className = "kart-exit";
    exit.dataset.testid = "kart-exit";
    exit.textContent = touchMode ? "Sair" : "Sair (Q)";
    exit.addEventListener("click", () => {
      exit.blur();
      this.onExit?.();
    });
    this.root.append(title, this.status, this.standings);
    if (!touchMode) {
      const help = document.createElement("div");
      help.className = "kart-help";
      help.innerHTML = "<b>W</b> acelerar · <b>S</b> frear/ré · <b>A</b>/<b>D</b> virar";
      this.root.append(help);
    }
    this.root.append(exit);

    this.countdown.className = "kart-countdown";
    this.countdown.dataset.testid = "kart-countdown";
    this.countdown.hidden = true;

    this.speedo.className = touchMode ? "kart-speedo kart-speedo--touch" : "kart-speedo";
    this.speedo.dataset.testid = "kart-speedo";
    this.speedo.hidden = true;
    this.speedo.innerHTML = speedometerSvg();
    this.needle = this.speedo.querySelector(".kart-speedo-needle");
    this.speedValue.className = "kart-speed-value";
    this.speedValue.dataset.testid = "kart-speed";
    this.speedo.append(this.speedValue);
    this.setSpeed(0);

    container.append(this.root, this.countdown, this.speedo);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** Mostra o painel; `driving` também mostra o velocímetro. */
  show(driving: boolean): void {
    this.root.hidden = false;
    this.speedo.hidden = !driving;
  }

  hide(): void {
    this.root.hidden = true;
    this.speedo.hidden = true;
    this.countdown.hidden = true;
  }

  /** Velocidade do kart (km/h): ponteiro e número. */
  setSpeed(kmh: number): void {
    const shown = Math.min(Math.round(kmh), KART_MAX_SPEED_KMH);
    const angle = DIAL.from + ((DIAL.to - DIAL.from) * Math.min(kmh, KART_MAX_SPEED_KMH)) / KART_MAX_SPEED_KMH;
    this.needle?.setAttribute("transform", `rotate(${angle.toFixed(1)} ${DIAL.cx} ${DIAL.cy})`);
    this.speedValue.dataset.kmh = String(shown);
    this.speedValue.innerHTML = `${shown}<small>km/h</small>`;
  }

  render(view: KartView, now = performance.now()): void {
    if (this.lastPhase === "countdown" && view.phase === "racing") this.goUntil = now + GO_MS;
    this.lastPhase = view.phase;
    this.root.dataset.phase = view.phase;
    this.status.textContent = this.statusFor(view);
    this.renderCountdown(view, now);
    this.renderStandings(view);
  }

  private renderCountdown(view: KartView, now: number): void {
    const counting = view.phase === "countdown";
    const go = view.phase === "racing" && now < this.goUntil;
    this.countdown.hidden = !counting && !go;
    this.countdown.textContent = counting ? String(Math.max(1, Math.ceil(view.msLeft / 1000))) : "JÁ!";
  }

  private statusFor(view: KartView): string {
    const me = view.racers.find((r) => r.id === view.selfId);
    const seconds = Math.ceil(view.msLeft / 1000);
    switch (view.phase) {
      case "lobby":
        return `Esperando pilotos… largada em ${seconds} s (${view.racers.length}/${MAX_PLAYERS})`;
      case "countdown":
        return "Prepare-se!";
      case "racing":
        if (!me) return "Corrida em andamento";
        if (me.finishMs !== null) return `Você chegou em ${me.place}º! ${formatTime(me.finishMs)} · esperando os outros (${seconds} s)`;
        return `Volta ${me.lap}/${view.laps} · ${me.place}º de ${view.racers.length}`;
      case "results": {
        const winner = view.racers.find((r) => r.id === view.winnerId);
        if (!winner) return "Ninguém completou as voltas.";
        const prize = view.prize > 0 ? ` e ganhou ${formatMoney(view.prize)}` : "";
        return winner.id === view.selfId ? `Você venceu${prize}! 🏆` : `${winner.name} venceu${prize}! 🏆`;
      }
      default:
        return "";
    }
  }

  private renderStandings(view: KartView): void {
    const racing = view.phase === "racing" || view.phase === "results";
    this.standings.replaceChildren(
      ...view.racers.map((r) => {
        const li = document.createElement("li");
        li.classList.toggle("kart-standings-me", r.id === view.selfId);
        li.style.setProperty("--racer-color", r.color);
        const name = document.createElement("span");
        name.className = "kart-standings-name";
        name.textContent = r.name;
        const info = document.createElement("span");
        info.className = "kart-standings-info";
        info.textContent = !racing ? "" : r.finishMs !== null ? formatTime(r.finishMs) : view.phase === "results" ? "não terminou" : `volta ${r.lap}`;
        li.append(name, info);
        return li;
      }),
    );
  }

  dispose(): void {
    this.root.remove();
    this.countdown.remove();
    this.speedo.remove();
  }
}
