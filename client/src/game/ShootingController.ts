// Tiro ao Alvo: de frente para o balcão a Ação vira "Jogar". O servidor cobra a entrada e
// responde; aí o jogador pega a espingarda, a câmera vai para o ombro e cada Ação é um tiro
// no centro da tela. O tiro é resolvido no cliente (raio contra os patos) e o servidor
// conta a sequência, encerra no primeiro erro e paga o prêmio.
import * as THREE from "three";
import { SHOOTING_ENTRY_COST, SHOOTING_FACING_DEG, SHOOTING_PLAY_RANGE, SHOOTING_SHOT_COOLDOWN_MS } from "@jogo/shared/constants";
import { distanceXZ, isFacingPoint } from "@jogo/shared/math";
import type { ShootingPhase, ShootingStateMessage } from "@jogo/shared/protocol";
import type { LocalPlayer } from "../entities/LocalPlayer";
import type { Network } from "../net/Network";
import { formatMoney } from "../ui/MerchantPanel";
import { ShootingPanel } from "../ui/ShootingPanel";
import { ACTION_LABELS, type ActionHandler, type ActionLabel } from "./ActionResolver";
import type { Intents } from "./Input";
import type { DuckDebugInfo, ShootingBoothManager } from "./ShootingBoothManager";
import type { ThirdPersonCamera } from "./ThirdPersonCamera";

/** Folga extra (m) antes de sair sozinho porque o jogador foi empurrado para longe. */
const LEAVE_SLACK = 0.8;
/** Sem resposta do servidor ao pedir para jogar, desiste depois disto (ms). */
const START_TIMEOUT_MS = 3000;
/** Quanto tempo o resultado fica na tela antes de guardar a espingarda (ms). */
const RESULT_MS = 1800;
/** O tiro sai do centro da tela. */
const SCREEN_CENTER = new THREE.Vector2(0, 0);

/** idle → starting (esperando o servidor) → playing → over (mostrando o resultado) → idle. */
type Status = "idle" | "starting" | "playing" | "over";

export interface ShootingDebugInfo {
  status: Status;
  hits: number;
  booth: {
    x: number;
    z: number;
    rotationY: number;
    ownerName: string;
    owner: { x: number; z: number };
    signText: string;
  } | null;
  ducks: DuckDebugInfo[];
}

export class ShootingController implements ActionHandler {
  /** Avisos curtos ao jogador (ex.: sem dinheiro para jogar). */
  onNotice: ((text: string) => void) | null = null;

  private readonly panel: ShootingPanel;
  private readonly raycaster = new THREE.Raycaster();
  private status: Status = "idle";
  private phase: ShootingPhase = "playing";
  private hits = 0;
  private lastShot: "hit" | "miss" | null = null;
  private lastShotAt = -Infinity;
  private startRequestedAt = 0;
  private resultLeft = 0;

  constructor(
    container: HTMLElement,
    touchMode: boolean,
    private readonly local: LocalPlayer,
    private readonly booth: ShootingBoothManager,
    private readonly camera: ThirdPersonCamera,
    private readonly view: THREE.PerspectiveCamera,
    private readonly network: Network,
    /** Dinheiro atual do jogador (para conferir a entrada antes de pedir). */
    private readonly money: () => number,
  ) {
    this.panel = new ShootingPanel(container, touchMode);
    this.panel.onExit = () => this.quit();
  }

  /** Com a espingarda na mão (jogando ou vendo o resultado). */
  get active(): boolean {
    return this.status === "playing" || this.status === "over";
  }

  /** O jogador está de frente para o balcão, perto o bastante para jogar? */
  private canPlay(): boolean {
    const counter = this.booth.counterPosition();
    if (!counter) return false;
    return isFacingPoint(this.local.renderPosition, this.local.rotationY, counter, SHOOTING_PLAY_RANGE, SHOOTING_FACING_DEG);
  }

  actionLabel(): ActionLabel | null {
    if (this.active) return ACTION_LABELS.shoot;
    return this.canPlay() ? ACTION_LABELS.play : null;
  }

  /** Atira (jogando) ou pede para jogar. */
  act(): void {
    if (this.status === "playing") this.fire();
    else if (this.status === "idle") this.requestStart();
  }

  /** Confere o saldo e pede ao servidor, que cobra a entrada e responde com `shooting`. */
  private requestStart(): void {
    if (this.money() < SHOOTING_ENTRY_COST) {
      this.onNotice?.(`Você precisa de ${formatMoney(SHOOTING_ENTRY_COST)} para jogar.`);
      return;
    }
    this.status = "starting";
    this.startRequestedAt = performance.now();
    this.network.shootingStart();
  }

  /** Estado vindo do servidor: começo, cada tiro contado e o fim da partida. */
  onState({ phase, hits }: ShootingStateMessage): void {
    if (this.status === "idle") return;
    if (this.status === "starting") this.begin();
    this.phase = phase;
    this.hits = hits;
    if (phase !== "playing" && this.status === "playing") {
      this.status = "over";
      this.resultLeft = RESULT_MS / 1000;
    }
    this.render();
  }

  private begin(): void {
    this.status = "playing";
    this.phase = "playing";
    this.hits = 0;
    this.lastShot = null;
    this.local.stance = "aim";
    this.camera.aiming = true;
    const center = this.booth.aimCenter();
    if (center) {
      this.local.faceTowards(center.x, center.z);
      this.camera.aimAt(center);
    }
    this.panel.show();
  }

  /** Um tiro no centro da tela, contra o que está desenhado agora. */
  private fire(): void {
    const now = performance.now();
    // Depois de um erro, só falta o servidor confirmar o fim.
    if (this.lastShot === "miss" || now - this.lastShotAt < SHOOTING_SHOT_COOLDOWN_MS) return;
    this.lastShotAt = now;
    this.local.character.playShot();
    this.raycaster.setFromCamera(SCREEN_CENTER, this.view);
    const hit = this.booth.shoot(this.raycaster) !== null;
    this.lastShot = hit ? "hit" : "miss";
    this.network.shootingShot(hit);
    this.render();
  }

  /** Chamar todo frame, antes de tratar a Ação. */
  update(dt: number, intents: Intents): void {
    if (this.status === "starting" && performance.now() - this.startRequestedAt > START_TIMEOUT_MS) {
      this.status = "idle";
    }
    if (!this.active) return;
    const moving = intents.moveX !== 0 || intents.moveZ !== 0 || intents.jump;
    if (intents.cancel || moving || this.pushedAway()) {
      this.quit();
      return;
    }
    if (this.status === "playing") {
      // O personagem acompanha a mira.
      this.local.rotationY = this.camera.yaw;
    } else {
      this.resultLeft -= dt;
      if (this.resultLeft <= 0) this.stop();
    }
  }

  /** Sai por vontade própria: no meio da partida, avisa o servidor (a entrada não volta). */
  private quit(): void {
    if (this.status === "playing") this.network.shootingStop();
    this.stop();
  }

  /** Guarda a espingarda e volta a câmera (também ao reconectar). */
  stop(): void {
    if (this.status === "idle") return;
    this.status = "idle";
    this.local.stance = null;
    this.camera.aiming = false;
    this.panel.hide();
  }

  private pushedAway(): boolean {
    const counter = this.booth.counterPosition();
    return !counter || distanceXZ(this.local.renderPosition, counter) > SHOOTING_PLAY_RANGE + LEAVE_SLACK;
  }

  private render(): void {
    this.panel.render({
      ownerName: this.booth.data?.ownerName ?? "",
      phase: this.phase,
      hits: this.hits,
      lastShot: this.lastShot,
    });
  }

  debugInfo(): ShootingDebugInfo {
    const data = this.booth.data;
    return {
      status: this.status,
      hits: this.hits,
      booth: data && {
        x: data.position.x,
        z: data.position.z,
        rotationY: data.rotationY,
        ownerName: data.ownerName,
        owner: { x: data.ownerPosition.x, z: data.ownerPosition.z },
        signText: data.signText,
      },
      ducks: this.booth.ducksDebugInfo(),
    };
  }

  dispose(): void {
    this.stop();
    this.panel.dispose();
  }
}
