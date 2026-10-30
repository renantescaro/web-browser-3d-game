// Teclado/mouse (e toque, se houver) → intenções. Não move nada: o loop de jogo consome as intenções.
import type { TouchControls } from "./TouchControls";

export interface Intents {
  /** Eixo lateral: -1 (A) a 1 (D). */
  moveX: number;
  /** Eixo frontal: -1 (S) a 1 (W). */
  moveZ: number;
  run: boolean;
  jump: boolean;
  /** Botão de Ação (F/clique): bate, ou pesca/fisga na fonte, conforme o contexto. */
  action: boolean;
  /** Sair do que estiver fazendo (Esc/Q), ex.: o minigame de pesca. */
  cancel: boolean;
  /** Liga/desliga a música (tecla M). */
  toggleMusic: boolean;
  /** Índice da reação (0–3) ou null se nenhuma. Teclas 1–4. */
  reaction: number | null;
  lookDX: number;
  lookDY: number;
}

export class Input {
  private readonly keys = new Set<string>();
  private jumpQueued = false;
  private actionQueued = false;
  private cancelQueued = false;
  private musicQueued = false;
  private reactionQueued: number | null = null;
  private lookDX = 0;
  private lookDY = 0;
  /** Avisado quando o pointer lock muda (para a HUD). */
  onPointerLockChange: ((locked: boolean) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly touch: TouchControls | null = null,
  ) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Retorna as intenções acumuladas desde a última chamada e zera as de disparo único. */
  consume(): Intents {
    const k = this.keys;
    const intents: Intents = {
      moveX: (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0),
      moveZ: (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0),
      run: k.has("ShiftLeft") || k.has("ShiftRight"),
      jump: this.jumpQueued,
      action: this.actionQueued,
      cancel: this.cancelQueued,
      toggleMusic: this.musicQueued,
      reaction: this.reactionQueued,
      lookDX: this.lookDX,
      lookDY: this.lookDY,
    };
    if (this.touch) {
      const t = this.touch.consume();
      if (intents.moveX === 0 && intents.moveZ === 0) {
        intents.moveX = t.moveX;
        intents.moveZ = t.moveZ;
        intents.run ||= t.run;
      }
      intents.jump ||= t.jump;
      intents.action ||= t.action;
      if (intents.reaction === null) intents.reaction = t.reaction;
      intents.lookDX += t.lookDX;
      intents.lookDY += t.lookDY;
    }
    this.jumpQueued = false;
    this.actionQueued = false;
    this.cancelQueued = false;
    this.musicQueued = false;
    this.reactionQueued = null;
    this.lookDX = 0;
    this.lookDY = 0;
    return intents;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) this.jumpQueued = true;
    }
    if (e.code === "KeyF" && !e.repeat) this.actionQueued = true;
    if ((e.code === "Escape" || e.code === "KeyQ") && !e.repeat) this.cancelQueued = true;
    if (e.code === "KeyM" && !e.repeat) this.musicQueued = true;
    const reactionIndex = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
    if (reactionIndex !== undefined && !e.repeat) this.reactionQueued = reactionIndex;
    this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
    this.touch?.reset();
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0 || this.touch) return;
    if (this.pointerLocked) {
      this.actionQueued = true;
      return;
    }
    try {
      const result: unknown = this.canvas.requestPointerLock();
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // Pointer lock indisponível (ex.: navegador sem suporte): segue sem ele.
    }
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.lookDX += e.movementX;
    this.lookDY += e.movementY;
  };

  private readonly onLockChange = (): void => {
    // Com o mouse preso o navegador consome o Esc; soltar o mouse também conta como "sair".
    if (!this.pointerLocked) this.cancelQueued = true;
    this.onPointerLockChange?.(this.pointerLocked);
  };

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.touch?.dispose();
    if (this.pointerLocked) document.exitPointerLock();
  }
}
