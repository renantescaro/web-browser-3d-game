// Utilitários matemáticos usados pelo cliente e pelo servidor.

/**
 * Vetor "para frente" (no plano XZ) de um personagem com rotação `yaw` no eixo Y.
 * Convenção: yaw = 0 olha para +Z (igual ao Object3D.rotation.y do Three.js).
 */
export function forwardFromYaw(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
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
