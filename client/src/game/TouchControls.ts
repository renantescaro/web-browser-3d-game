// Controles de toque para celular: analógico (mover/correr), arrastar a tela (câmera) e botões.
// Assim como o Input, só acumula intenções; quem as aplica é o loop de jogo.
import { TOUCH_LOOK_SCALE, TOUCH_RUN_THRESHOLD, TOUCH_STICK_RADIUS } from "@jogo/shared/constants";

/** Dispositivo com tela de toque como ponteiro principal (celular/tablet). */
export function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0;
}

export interface TouchIntents {
  moveX: number;
  moveZ: number;
  run: boolean;
  jump: boolean;
  action: boolean;
  reaction: number | null;
  lookDX: number;
  lookDY: number;
}

export class TouchControls {
  private readonly root = document.createElement("div");
  private readonly stick = document.createElement("div");
  private readonly knob = document.createElement("div");
  private readonly actionButton: HTMLButtonElement;
  private stickPointer: number | null = null;
  private lookPointer: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;
  private moveX = 0;
  private moveZ = 0;
  private jumpQueued = false;
  private actionQueued = false;
  private reactionQueued: number | null = null;
  private lookDX = 0;
  private lookDY = 0;

  constructor(
    container: HTMLElement,
    private readonly lookSurface: HTMLElement,
  ) {
    this.root.className = "touch-controls";
    this.stick.className = "touch-stick";
    this.stick.dataset.testid = "touch-stick";
    this.knob.className = "touch-stick-knob";
    this.stick.appendChild(this.knob);

    const jump = this.createButton("Pular", "touch-jump", () => (this.jumpQueued = true));
    this.actionButton = this.createButton("Bater", "touch-action", () => (this.actionQueued = true));
    const reactionEmojis = ["😊", "😢", "😠", "💡"] as const;
    const reactionContainer = document.createElement("div");
    reactionContainer.className = "touch-reactions";
    for (let i = 0; i < reactionEmojis.length; i++) {
      const idx = i;
      reactionContainer.appendChild(
        this.createButton(reactionEmojis[idx] ?? "", `touch-reaction touch-reaction-${idx}`, () => {
          this.reactionQueued = idx;
        }),
      );
    }
    this.root.append(this.stick, jump, this.actionButton, reactionContainer);
    container.appendChild(this.root);

    this.stick.addEventListener("pointerdown", this.onStickDown);
    this.stick.addEventListener("pointermove", this.onStickMove);
    this.stick.addEventListener("pointerup", this.onStickUp);
    this.stick.addEventListener("pointercancel", this.onStickUp);
    lookSurface.addEventListener("pointerdown", this.onLookDown);
    window.addEventListener("pointermove", this.onLookMove);
    window.addEventListener("pointerup", this.onLookUp);
    window.addEventListener("pointercancel", this.onLookUp);
  }

  consume(): TouchIntents {
    const tilt = Math.hypot(this.moveX, this.moveZ);
    const intents: TouchIntents = {
      moveX: this.moveX,
      moveZ: this.moveZ,
      run: tilt >= TOUCH_RUN_THRESHOLD,
      jump: this.jumpQueued,
      action: this.actionQueued,
      reaction: this.reactionQueued,
      lookDX: this.lookDX * TOUCH_LOOK_SCALE,
      lookDY: this.lookDY * TOUCH_LOOK_SCALE,
    };
    this.jumpQueued = false;
    this.actionQueued = false;
    this.reactionQueued = null;
    this.lookDX = 0;
    this.lookDY = 0;
    return intents;
  }

  /** Texto do botão de Ação conforme o contexto (Bater, Pescar, Fisgar). */
  setActionLabel(label: string): void {
    this.actionButton.textContent = label;
  }

  private createButton(label: string, className: string, onPress: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `touch-btn ${className}`;
    button.dataset.testid = className;
    button.textContent = label;
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onPress();
    });
    return button;
  }

  // ---------- Analógico ----------

  private readonly onStickDown = (e: PointerEvent): void => {
    if (this.stickPointer !== null) return;
    e.preventDefault();
    this.stickPointer = e.pointerId;
    this.stick.setPointerCapture(e.pointerId);
    this.updateStick(e);
  };

  private readonly onStickMove = (e: PointerEvent): void => {
    if (e.pointerId === this.stickPointer) this.updateStick(e);
  };

  private readonly onStickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointer) return;
    this.stickPointer = null;
    this.moveX = 0;
    this.moveZ = 0;
    this.knob.style.transform = "";
  };

  private updateStick(e: PointerEvent): void {
    const rect = this.stick.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > TOUCH_STICK_RADIUS) {
      dx *= TOUCH_STICK_RADIUS / dist;
      dy *= TOUCH_STICK_RADIUS / dist;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.moveX = dx / TOUCH_STICK_RADIUS;
    // Para cima na tela = para frente.
    this.moveZ = -dy / TOUCH_STICK_RADIUS;
  }

  // ---------- Câmera (arrastar a tela) ----------

  private readonly onLookDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" || this.lookPointer !== null) return;
    e.preventDefault();
    this.lookPointer = e.pointerId;
    this.lastLookX = e.clientX;
    this.lastLookY = e.clientY;
  };

  private readonly onLookMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.lookPointer) return;
    this.lookDX += e.clientX - this.lastLookX;
    this.lookDY += e.clientY - this.lastLookY;
    this.lastLookX = e.clientX;
    this.lastLookY = e.clientY;
  };

  private readonly onLookUp = (e: PointerEvent): void => {
    if (e.pointerId === this.lookPointer) this.lookPointer = null;
  };

  /** Solta tudo (ex.: a aba perdeu o foco). */
  reset(): void {
    this.stickPointer = null;
    this.lookPointer = null;
    this.moveX = 0;
    this.moveZ = 0;
    this.knob.style.transform = "";
  }

  dispose(): void {
    this.lookSurface.removeEventListener("pointerdown", this.onLookDown);
    window.removeEventListener("pointermove", this.onLookMove);
    window.removeEventListener("pointerup", this.onLookUp);
    window.removeEventListener("pointercancel", this.onLookUp);
    this.root.remove();
  }
}
