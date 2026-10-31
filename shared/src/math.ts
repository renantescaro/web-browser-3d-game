// Utilitários matemáticos usados pelo cliente e pelo servidor.

/**
 * Vetor "para frente" (no plano XZ) de um personagem com rotação `yaw` no eixo Y.
 * Convenção: yaw = 0 olha para +Z (igual ao Object3D.rotation.y do Three.js).
 */
export function forwardFromYaw(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/**
 * Converte um ponto (lx, lz) do espaço local de um objeto girado `yaw` para o mundo,
 * igual ao `rotation.y` do Three.js (+Z local vira `forwardFromYaw(yaw)`).
 */
export function localToWorldXZ(
  origin: { x: number; z: number },
  yaw: number,
  lx: number,
  lz: number,
): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: origin.x + lx * c + lz * s, z: origin.z - lx * s + lz * c };
}

/** Normaliza um ângulo para o intervalo (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Distância entre dois pontos no plano XZ. */
export function distanceXZ(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** O jogador está a até `maxDist` de `target` e olhando para ele, dentro do cone `coneDeg`? */
export function isFacingPoint(
  player: { x: number; z: number },
  rotationY: number,
  target: { x: number; z: number },
  maxDist: number,
  coneDeg: number,
): boolean {
  const dist = distanceXZ(player, target);
  if (dist > maxDist || dist < 0.01) return false;
  const forward = forwardFromYaw(rotationY);
  const cos = (forward.x * (target.x - player.x) + forward.z * (target.z - player.z)) / dist;
  return cos >= Math.cos(((coneDeg / 2) * Math.PI) / 180);
}

/**
 * O jogador está de frente para a fonte e perto da borda?
 * `reach` é a distância máxima do centro do jogador até a borda.
 */
export function isFacingFountain(
  player: { x: number; z: number },
  rotationY: number,
  fountain: { x: number; z: number },
  fountainRadius: number,
  reach: number,
  coneDeg: number,
): boolean {
  return isFacingPoint(player, rotationY, fountain, fountainRadius + reach, coneDeg);
}
