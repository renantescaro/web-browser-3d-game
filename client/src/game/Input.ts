// Teclado/mouse → intenções. Não move nada: o loop de jogo consome as intenções.

export interface Intents {
  /** Eixo lateral: -1 (A) a 1 (D). */
  moveX: number;
  /** Eixo frontal: -1 (S) a 1 (W). */
  moveZ: number;
  run: boolean;
  jump: boolean;
  punch: boolean;
  lookDX: number;
  lookDY: number;
}

export class Input {
  private readonly keys = new Set<string>();
  private jumpQueued = false;
  private punchQueued = false;
  private lookDX = 0;
  private lookDY = 0;
  /** Avisado quando o pointer lock muda (para a HUD). */
  onPointerLockChange: ((locked: boolean) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
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
      punch: this.punchQueued,
      lookDX: this.lookDX,
      lookDY: this.lookDY,
    };
    this.jumpQueued = false;
    this.punchQueued = false;
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
    if (e.code === "KeyF" && !e.repeat) this.punchQueued = true;
    this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    if (this.pointerLocked) {
      this.punchQueued = true;
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
    this.onPointerLockChange?.(this.pointerLocked);
  };

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    if (this.pointerLocked) document.exitPointerLock();
  }
}
