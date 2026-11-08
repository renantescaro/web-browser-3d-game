// Corrida de kart: de frente para o balcão do Vitinho a Ação vira "Correr". O servidor cobra a
// entrada e manda o estado da corrida (`kartRace`) a todos; quem está inscrito senta no kart no
// grid, espera a largada e dirige com acelerar/frear e esquerda/direita (W/S e A/D). Bater em
// alguém com o kart avisa o servidor, que empurra o outro. No fim, desce na frente da barraca.
import { KART_BUMP_COOLDOWN_MS, KART_BUMP_MIN_SPEED, KART_ENTRY_COST, KART_FACING_DEG, KART_JOIN_RANGE, MAX_PLAYERS } from "@jogo/shared/constants";
import { gridSlot, kartExitSpot, pathPoint } from "@jogo/shared/kart";
import { isFacingPoint } from "@jogo/shared/math";
import type { KartPhase, KartRaceMessage } from "@jogo/shared/protocol";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { KartPanel } from "../ui/KartPanel";
import { formatMoney } from "../ui/shopUi";
import { ACTION_LABELS, type ActionHandler, type ActionLabel } from "./ActionResolver";
import type { Intents } from "./Input";
import type { KartTrackManager } from "./KartTrackManager";
import type { ThirdPersonCamera } from "./ThirdPersonCamera";
import type { TouchControls } from "./TouchControls";

/** Fases em que quem está inscrito fica sentado no kart. */
const IN_KART: readonly KartPhase[] = ["lobby", "countdown", "racing"];
/** Reações do Vitinho: largada e chegada (para todos verem). */
const OWNER_REACTIONS = { start: "🏁", finish: "🏆" } as const;
const HORN_MS = 260;

export interface KartDebugInfo {
  phase: KartPhase;
  driving: boolean;
  /** Velocidade do próprio kart (km/h). */
  kmh: number;
  racers: { id: string; name: string; slot: number; lap: number; place: number; finishMs: number | null }[];
  track: {
    center: { x: number; z: number };
    width: number;
    /** Comprimento de uma volta (m). */
    length: number;
    /** Linha de largada e para onde ela aponta. */
    start: { x: number; z: number; rotationY: number };
    laps: number;
    ownerName: string;
    owner: { x: number; z: number };
    counter: { x: number; z: number };
    rotationY: number;
    signText: string;
  } | null;
}

export interface KartDeps {
  container: HTMLElement;
  touchMode: boolean;
  local: LocalPlayer;
  manager: KartTrackManager;
  camera: ThirdPersonCamera;
  network: Network;
  touch: TouchControls | null;
  /** Dinheiro atual do jogador (para conferir a entrada antes de pedir). */
  money: () => number;
  selfId: () => string;
  /** Id do jogador remoto dono de um colisor (para saber em quem o kart bateu). */
  remoteIdOf: (handle: number) => string | null;
}

export class KartController implements ActionHandler {
  /** Avisos curtos ao jogador (ex.: sem dinheiro, corrida em andamento). */
  onNotice: ((text: string) => void) | null = null;

  private readonly panel: KartPanel;
  private race: KartRaceMessage | null = null;
  private receivedAt = 0;
  private driving = false;
  private readonly lastBumpAt = new Map<string, number>();
  private audio: AudioContext | null = null;

  constructor(private readonly d: KartDeps) {
    this.panel = new KartPanel(d.container, d.touchMode);
    this.panel.onExit = () => this.quit();
  }

  /** Sentado no kart: a Ação é a buzina. */
  get active(): boolean {
    return this.driving;
  }

  private canJoin(): boolean {
    const counter = this.d.manager.counterPosition();
    if (!counter) return false;
    return isFacingPoint(this.d.local.renderPosition, this.d.local.rotationY, counter, KART_JOIN_RANGE, KART_FACING_DEG);
  }

  actionLabel(): ActionLabel | null {
    if (this.driving) return ACTION_LABELS.horn;
    return this.canJoin() ? ACTION_LABELS.race : null;
  }

  act(): void {
    if (this.driving) this.honk();
    else this.requestJoin();
  }

  /** Confere o que dá para conferir aqui e pede ao servidor, que cobra e responde com `kartRace`. */
  private requestJoin(): void {
    const phase = this.race?.phase ?? "idle";
    if (phase === "countdown" || phase === "racing" || phase === "results") {
      this.onNotice?.("Corrida em andamento! Espere a próxima largada.");
    } else if ((this.race?.racers.length ?? 0) >= MAX_PLAYERS) {
      this.onNotice?.("O grid está cheio! Espere a próxima corrida.");
    } else if (this.d.money() < KART_ENTRY_COST) {
      this.onNotice?.(`Você precisa de ${formatMoney(KART_ENTRY_COST)} para correr.`);
    } else {
      this.d.network.kartJoin();
    }
  }

  /** Estado da corrida vindo do servidor (para todos, inscritos ou não). */
  setRace(msg: KartRaceMessage): void {
    const before = this.race?.phase;
    this.race = msg;
    this.receivedAt = performance.now();
    if (before === "countdown" && msg.phase === "racing") this.d.manager.playReaction(OWNER_REACTIONS.start);
    if (before === "racing" && msg.phase === "results" && msg.winnerId) this.d.manager.playReaction(OWNER_REACTIONS.finish);

    const me = msg.racers.find((r) => r.id === this.d.selfId());
    const inKart = me !== undefined && IN_KART.includes(msg.phase);
    if (inKart && !this.driving) this.enter(me.slot);
    else if (!inKart && this.driving) this.exit();
    if (this.driving || (msg.phase === "results" && me)) this.panel.show(this.driving);
    else this.panel.hide();
    this.render();
  }

  /** Senta no kart, no lugar do grid. */
  private enter(slot: number): void {
    const layout = this.d.manager.layout;
    if (!layout) return;
    const spot = gridSlot(layout.path, layout.inside, slot);
    this.d.local.enterKart(spot.x, spot.z, spot.rotationY);
    this.d.camera.yaw = spot.rotationY;
    this.d.touch?.setKartMode(true);
    this.driving = true;
  }

  /** Desce do kart na frente da barraca. */
  private exit(): void {
    this.driving = false;
    this.d.touch?.setKartMode(false);
    const data = this.d.manager.data;
    const spot = data ? kartExitSpot(data.counter, data.rotationY) : this.d.local.renderPosition;
    this.d.local.exitKart(spot.x, spot.z);
    if (data) this.d.local.faceTowards(data.counter.x, data.counter.z);
  }

  /** Desiste: avisa o servidor (a entrada não volta) e desce do kart. */
  private quit(): void {
    if (!this.driving) {
      this.panel.hide();
      return;
    }
    this.d.network.kartLeave();
    this.exit();
    this.panel.hide();
  }

  /** Chamar todo frame, antes de tratar a Ação: pedais, volante, batidas e painel. */
  update(intents: Intents): void {
    if (this.driving) {
      if (intents.cancel) {
        this.quit();
        return;
      }
      this.d.local.setKartControls(intents.moveZ, intents.moveX, this.race?.phase !== "racing");
      this.sendBumps();
      this.panel.setSpeed(this.d.local.kartKmh);
    }
    if (this.panel.visible) this.render();
  }

  /** Avisa o servidor de cada jogador em que o kart encostou andando (com um intervalo por alvo). */
  private sendBumps(): void {
    const touched = this.d.local.takeTouched();
    if (Math.abs(this.d.local.kartSpeed) < KART_BUMP_MIN_SPEED) return;
    const now = performance.now();
    for (const handle of touched) {
      const id = this.d.remoteIdOf(handle);
      if (!id || now - (this.lastBumpAt.get(id) ?? -Infinity) < KART_BUMP_COOLDOWN_MS) continue;
      this.lastBumpAt.set(id, now);
      this.d.network.kartBump(id);
    }
  }

  /** Buzina: um "fom-fom" curto, só para quem dirige ouvir. */
  private honk(): void {
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      for (const [delay, freq] of [[0, 392], [HORN_MS / 1000 + 0.05, 330]] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        const t = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + HORN_MS / 1000);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + HORN_MS / 1000);
      }
    } catch {
      // Sem Web Audio: fica sem buzina.
    }
  }

  private render(): void {
    const race = this.race;
    const data = this.d.manager.data;
    if (!race || !data) return;
    this.panel.render({
      ownerName: data.ownerName,
      phase: race.phase,
      msLeft: Math.max(0, race.msLeft - (performance.now() - this.receivedAt)),
      laps: data.laps,
      selfId: this.d.selfId(),
      racers: race.racers,
      winnerId: race.winnerId,
      prize: race.prize,
    });
  }

  /** Estado vindo do `welcome` (também ao reconectar: o id mudou, então desce do kart). */
  reset(race: KartRaceMessage): void {
    if (this.driving) this.exit();
    this.panel.hide();
    this.lastBumpAt.clear();
    this.setRace(race);
  }

  debugInfo(): KartDebugInfo {
    const data = this.d.manager.data;
    const layout = this.d.manager.layout;
    return {
      phase: this.race?.phase ?? "idle",
      driving: this.driving,
      kmh: this.d.local.kartKmh,
      racers: (this.race?.racers ?? []).map(({ id, name, slot, lap, place, finishMs }) => ({ id, name, slot, lap, place, finishMs })),
      track: data && layout && {
        center: { x: data.center.x, z: data.center.z },
        width: data.width,
        length: layout.path.length,
        start: pathPoint(layout.path, 0),
        laps: data.laps,
        ownerName: data.ownerName,
        owner: { x: data.position.x, z: data.position.z },
        counter: { x: data.counter.x, z: data.counter.z },
        rotationY: data.rotationY,
        signText: data.signText,
      },
    };
  }

  dispose(): void {
    if (this.driving) this.exit();
    this.panel.dispose();
    void this.audio?.close();
  }
}
