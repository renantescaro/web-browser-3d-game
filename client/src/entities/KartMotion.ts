// Como o kart acelera, freia e vira (só a lógica; quem move o corpo é o `LocalPlayer`).
import {
  KART_ACCEL,
  KART_BRAKE,
  KART_COAST,
  KART_MAX_SPEED,
  KART_REVERSE_SPEED,
  KART_TURN_RATE,
} from "@jogo/shared/constants";
import { clamp } from "@jogo/shared/math";

/** Abaixo desta velocidade (m/s) o volante vira menos (kart parado não gira no lugar). */
const FULL_GRIP_SPEED = 4;
/** No fim da reta a aceleração cai até esta fração (o motor "enche"). */
const TOP_END_ACCEL = 0.35;

export class KartMotion {
  /** Velocidade ao longo da frente do kart (m/s); negativa é ré. */
  speed = 0;

  /**
   * Avança `dt` segundos. `throttle`: 1 acelera, −1 freia (e, parado, dá ré).
   * `steer`: −1 esquerda, 1 direita. Retorna quanto o kart girou (rad, somar ao yaw).
   */
  step(dt: number, throttle: number, steer: number): number {
    if (throttle > 0) {
      if (this.speed < 0) this.speed = Math.min(0, this.speed + KART_BRAKE * dt);
      else this.speed += KART_ACCEL * dt * throttle * (1 - (1 - TOP_END_ACCEL) * (this.speed / KART_MAX_SPEED));
    } else if (throttle < 0) {
      if (this.speed > 0) this.speed = Math.max(0, this.speed - KART_BRAKE * dt);
      else this.speed -= KART_ACCEL * 0.6 * dt;
    } else {
      const coast = KART_COAST * dt;
      this.speed = Math.abs(this.speed) <= coast ? 0 : this.speed - Math.sign(this.speed) * coast;
    }
    this.speed = clamp(this.speed, -KART_REVERSE_SPEED, KART_MAX_SPEED);

    // A direita do kart é −yaw (igual à câmera). De ré, o volante inverte, como num carro.
    const grip = Math.min(1, Math.abs(this.speed) / FULL_GRIP_SPEED);
    return -steer * KART_TURN_RATE * grip * Math.sign(this.speed) * dt;
  }

  /**
   * O kart andou só `actual` m/s para a frente (bateu em algo): perde a velocidade que não usou.
   * Nunca troca o sentido nem acelera.
   */
  limitTo(actual: number): void {
    if (this.speed > 0) this.speed = clamp(actual, 0, this.speed);
    else if (this.speed < 0) this.speed = clamp(actual, this.speed, 0);
  }

  /** Velocidade em km/h (sempre positiva), para o velocímetro. */
  get kmh(): number {
    return Math.abs(this.speed) * 3.6;
  }
}
