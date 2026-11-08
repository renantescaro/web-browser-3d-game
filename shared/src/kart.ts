// Geometria do kartódromo, igual no cliente e no servidor. O traçado é uma curva fechada (Catmull-Rom
// centrípeta) passando pelos pontos de `KART_TRACK_POINTS`, com retas e curvas, em volta da praça.
// Ele é amostrado em pontos igualmente espaçados: `s` é a distância percorrida desde a linha de
// largada (s = 0), no sentido da corrida; "lateral" é a distância para a direita do sentido.
import { KART_GRID_LANE_OFFSET, KART_GRID_ROW_SPACING, KART_TRACK_WIDTH } from "./constants";
import { localToWorldXZ } from "./math";

type Point = { x: number; z: number };

/**
 * Pontos de controle do meio da pista (m, relativos ao centro da praça, antes de girar), na ordem da
 * corrida. O primeiro é a linha de largada, no meio da reta principal (com o grid logo atrás dela).
 * Tem a reta principal, uma curva longa, uma reta do lado, o "S" de cima (que entra para o meio),
 * um cotovelo e a curva de volta. Cabe numa caixa de ±52 × ±47 m.
 */
export const KART_TRACK_POINTS: readonly (readonly [number, number])[] = [
  [0, -46],
  [16, -46],
  [32, -45],
  [46, -38],
  [52, -22],
  [52, -4],
  [50, 14],
  [43, 31],
  [28, 42],
  [14, 42],
  [2, 33],
  [-12, 34],
  [-26, 44],
  [-42, 41],
  [-51, 26],
  [-48, 12],
  [-42, 0],
  [-45, -14],
  [-50, -28],
  [-44, -42],
  [-30, -46],
  [-16, -46],
];
/** Espaçamento (m) aproximado entre os pontos amostrados do traçado. */
const SAMPLE_STEP = 1;

/** O traçado amostrado, já no mundo. */
export interface KartPath {
  /** Pontos do meio da pista; o ponto i fica em s = i × `step`. */
  points: Point[];
  /** Direção da corrida em cada ponto (vetor unitário). */
  dirs: Point[];
  step: number;
  /** Comprimento de uma volta (m). */
  length: number;
}

/** Ponto do Catmull-Rom centrípeto entre p1 e p2, com `u` de 0 a 1. */
function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, u: number): Point {
  const knot = (a: Point, b: Point) => Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)), 1e-4);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const lerp = (a: Point, b: Point, ta: number, tb: number): Point => {
    const k = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/** Monta o traçado no mundo: os pontos de controle girados por `rotation` em volta de `center`. */
export function buildKartPath(center: Point, rotation: number): KartPath {
  const control = KART_TRACK_POINTS.map(([x, z]) => localToWorldXZ(center, rotation, x, z));
  const n = control.length;
  // Curva bem densa, depois reamostrada com espaçamento igual.
  const dense: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p = (k: number) => control[(i + k + n) % n]!;
    for (let j = 0; j < 40; j++) dense.push(catmullRom(p(-1), p(0), p(1), p(2), j / 40));
  }
  const cumulative = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1]!;
    const b = dense[i % dense.length]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = cumulative[dense.length]!;
  const count = Math.round(length / SAMPLE_STEP);
  const step = length / count;
  const points: Point[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    while (cumulative[j + 1]! < s) j++;
    const a = dense[j]!;
    const b = dense[(j + 1) % dense.length]!;
    const k = (s - cumulative[j]!) / Math.max(cumulative[j + 1]! - cumulative[j]!, 1e-9);
    points.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
  }
  const dirs = points.map((_, i) => {
    const prev = points[(i - 1 + count) % count]!;
    const next = points[(i + 1) % count]!;
    const d = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
    return { x: (next.x - prev.x) / d, z: (next.z - prev.z) / d };
  });
  return { points, dirs, step, length };
}

/** Direita do sentido da corrida (a direita de quem olha para +Z é −X, igual ao personagem). */
export function rightOf(dir: Point): Point {
  return { x: -dir.z, z: dir.x };
}

/** Ponto na distância `s` da largada (dá a volta) e `lateral` metros para a direita, e o yaw do sentido. */
export function pathPoint(path: KartPath, s: number, lateral = 0): { x: number; z: number; rotationY: number } {
  const n = path.points.length;
  const pos = (((s % path.length) + path.length) % path.length) / path.step;
  const i = Math.floor(pos) % n;
  const k = pos - Math.floor(pos);
  const a = path.points[i]!;
  const b = path.points[(i + 1) % n]!;
  const da = path.dirs[i]!;
  const db = path.dirs[(i + 1) % n]!;
  const dir = { x: da.x + (db.x - da.x) * k, z: da.z + (db.z - da.z) * k };
  const r = rightOf(dir);
  return {
    x: a.x + (b.x - a.x) * k + r.x * lateral,
    z: a.z + (b.z - a.z) * k + r.z * lateral,
    rotationY: Math.atan2(dir.x, dir.z),
  };
}

/**
 * Ponto do traçado mais perto de `p`: índice, distância `s` da largada, lado (`lateral`) e distância
 * até o meio da pista. Com `hint`, só procura até `window` pontos para cada lado dele (mais rápido e
 * não deixa "pular" para outro trecho da pista que passe perto).
 */
export function nearestOnPath(
  path: KartPath,
  p: Point,
  hint?: number,
  window = 30,
): { index: number; s: number; lateral: number; distance: number } {
  const n = path.points.length;
  const from = hint === undefined ? 0 : hint - window;
  const to = hint === undefined ? n - 1 : hint + window;
  let best = 0;
  let bestDist = Infinity;
  for (let k = from; k <= to; k++) {
    const i = ((k % n) + n) % n;
    const q = path.points[i]!;
    const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  const q = path.points[best]!;
  const dir = path.dirs[best]!;
  const along = (p.x - q.x) * dir.x + (p.z - q.z) * dir.z;
  const r = rightOf(dir);
  return {
    index: best,
    s: (best * path.step + along + path.length) % path.length,
    lateral: (p.x - q.x) * r.x + (p.z - q.z) * r.z,
    distance: Math.sqrt(bestDist),
  };
}

/** De que lado (+1 direita, −1 esquerda) fica o lado de dentro da pista, perto de `s`. */
export function insideSide(path: KartPath, center: Point, s = 0): 1 | -1 {
  const p = pathPoint(path, s);
  const r = rightOf({ x: Math.sin(p.rotationY), z: Math.cos(p.rotationY) });
  return (center.x - p.x) * r.x + (center.z - p.z) * r.z > 0 ? 1 : -1;
}

/** O ponto está dentro do contorno do meio da pista? */
export function insideTrack(path: KartPath, p: Point): boolean {
  let inside = false;
  const pts = path.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Lugar no grid de largada: filas de dois karts lado a lado, atrás da linha de largada.
 * O 0 é a pole, por dentro; o 1 fica ao lado dele, por fora.
 */
export function gridSlot(path: KartPath, inside: 1 | -1, slot: number): { x: number; z: number; rotationY: number } {
  const row = Math.floor(slot / 2);
  const lane = slot % 2 === 0 ? inside : -inside;
  return pathPoint(path, -KART_GRID_ROW_SPACING * (row + 0.7), lane * KART_GRID_LANE_OFFSET);
}

/** Meia largura da pista (m). */
export const KART_HALF_WIDTH = KART_TRACK_WIDTH / 2;

/** Onde o piloto desce do kart: na frente do balcão do Vitinho (`counter`, que olha para `rotationY`). */
export function kartExitSpot(counter: Point, rotationY: number): Point {
  return { x: counter.x + Math.sin(rotationY) * 1.6, z: counter.z + Math.cos(rotationY) * 1.6 };
}
