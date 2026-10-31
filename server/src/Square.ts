// Geração da praça da cidade: exatamente uma por servidor, sorteada quando ele inicia.
import {
  FISH_COLORS,
  FISH_MAX_SCALE,
  FISH_MIN_SCALE,
  FOUNTAIN_MAX_FISH,
  FOUNTAIN_MIN_FISH,
  FOUNTAIN_PILLAR_RADIUS,
  FOUNTAIN_RADIUS,
  FOUNTAIN_WALL_THICKNESS,
  PLAYER_RADIUS,
  SPAWN_MAX_DISTANCE,
  SPAWN_MIN_DISTANCE,
  SQUARE_BENCH_RING,
  SQUARE_MAX_BENCHES,
  SQUARE_MAX_DISTANCE,
  SQUARE_MIN_BENCHES,
  SQUARE_MIN_DISTANCE,
  SQUARE_RADIUS,
  SQUARE_SIGN_TEXT,
} from "@jogo/shared/constants";
import { distanceXZ, wrapAngle } from "@jogo/shared/math";
import type { BenchData, FishData, SquareData, Vec3 } from "@jogo/shared/protocol";

/** Distância da placa até a borda do piso (m). */
const SIGN_INSET = 1.2;
/** Quanto cada banco pode desviar do espaçamento uniforme (fração do passo). */
const BENCH_JITTER = 0.15;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Bancos em volta da fonte, espaçados por igual (com um pouco de variação) e longe da placa. */
function generateBenches(cx: number, cz: number, signAngle: number): BenchData[] {
  const count = randInt(SQUARE_MIN_BENCHES, SQUARE_MAX_BENCHES);
  const step = (Math.PI * 2) / count;
  const benches: BenchData[] = [];
  for (let i = 0; i < count; i++) {
    const angle = signAngle + step * (i + 0.5) + rand(-BENCH_JITTER, BENCH_JITTER) * step;
    benches.push({
      position: { x: cx + Math.sin(angle) * SQUARE_BENCH_RING, y: 0, z: cz + Math.cos(angle) * SQUARE_BENCH_RING },
      // Virado para o centro da praça.
      rotationY: angle + Math.PI,
    });
  }
  return benches;
}

/**
 * Peixes da fonte. A faixa de tamanhos é dividida em fatias e cada peixe sorteia
 * dentro de uma fatia diferente, então nenhum tem o mesmo tamanho.
 */
function generateFish(): FishData[] {
  const count = randInt(FOUNTAIN_MIN_FISH, FOUNTAIN_MAX_FISH);
  const slice = (FISH_MAX_SCALE - FISH_MIN_SCALE) / count;
  const scales = Array.from({ length: count }, (_, i) => FISH_MIN_SCALE + slice * (i + rand(0.1, 0.9)));
  scales.sort(() => Math.random() - 0.5);

  const inner = FOUNTAIN_PILLAR_RADIUS + 0.4;
  const outer = FOUNTAIN_RADIUS - FOUNTAIN_WALL_THICKNESS - 0.4;
  return scales.map((scale, i) => {
    const angle = rand(0, Math.PI * 2);
    const r = rand(inner, outer);
    return {
      id: `fish-${i}`,
      color: pick(FISH_COLORS),
      scale,
      position: { x: Math.sin(angle) * r, y: 0, z: Math.cos(angle) * r },
      rotationY: rand(0, Math.PI * 2),
    };
  });
}

export function generateSquare(): SquareData {
  // Perto o bastante da área de nascimento para ser vista logo de cara.
  const dirAngle = rand(0, Math.PI * 2);
  const distance = rand(SQUARE_MIN_DISTANCE, SQUARE_MAX_DISTANCE);
  const cx = Math.sin(dirAngle) * distance;
  const cz = Math.cos(dirAngle) * distance;

  // A placa fica na borda virada para o centro do mapa, com o texto para quem chega.
  const signAngle = Math.atan2(-cx, -cz);
  const signDist = SQUARE_RADIUS - SIGN_INSET;

  return {
    position: { x: cx, y: 0, z: cz },
    benches: generateBenches(cx, cz, signAngle),
    sign: {
      position: { x: cx + Math.sin(signAngle) * signDist, y: 0, z: cz + Math.cos(signAngle) * signDist },
      rotationY: signAngle,
      text: SQUARE_SIGN_TEXT,
    },
    fountain: { position: { x: cx, y: 0, z: cz }, fish: generateFish() },
  };
}

/** Vão (em ângulo, a partir do centro da praça) entre dois bancos vizinhos. */
export interface BenchGap {
  /** Ângulo do meio do vão (convenção de `forwardFromYaw`). */
  center: number;
  width: number;
  /** A placa da praça fica dentro deste vão. */
  hasSign: boolean;
}

/** Os vãos entre bancos vizinhos, do maior para o menor. */
export function benchGaps(square: SquareData): BenchGap[] {
  const { x: cx, z: cz } = square.position;
  const angleOf = (p: { x: number; z: number }) => Math.atan2(p.x - cx, p.z - cz);
  const sign = angleOf(square.sign.position);
  // Ângulos dos bancos medidos a partir da placa, em [0, 2π), em ordem.
  const angles = square.benches
    .map((b) => {
      const a = (angleOf(b.position) - sign) % (Math.PI * 2);
      return a < 0 ? a + Math.PI * 2 : a;
    })
    .sort((a, b) => a - b);
  return angles
    .map((start, i) => {
      // O último vão dá a volta e contém a placa (ângulo 0).
      const last = i === angles.length - 1;
      const end = last ? (angles[0] ?? 0) + Math.PI * 2 : (angles[i + 1] ?? start);
      return { center: sign + (start + end) / 2, width: end - start, hasSign: last };
    })
    .sort((a, b) => b.width - a.width);
}

/**
 * Os dois lados da placa: o meio de cada vão entre ela e o banco vizinho (ângulos a partir do
 * centro da praça), o mais largo primeiro. O comerciante fica no mais largo e a loja de
 * roupas no outro; assim os dois ficam do lado de quem chega do centro do mapa.
 */
export function signSides(square: SquareData): { wide: number; narrow: number } {
  const { x: cx, z: cz } = square.position;
  const angleOf = (p: { x: number; z: number }) => Math.atan2(p.x - cx, p.z - cz);
  const sign = angleOf(square.sign.position);
  // Ângulo de cada banco medido a partir da placa, em (0, 2π).
  const benches = square.benches.map((b) => {
    const a = angleOf(b.position) - sign;
    const wrapped = a % (Math.PI * 2);
    return wrapped <= 0 ? wrapped + Math.PI * 2 : wrapped;
  });
  const after = Math.min(...benches, Math.PI * 2);
  const before = Math.PI * 2 - Math.max(...benches, 0);
  const afterSide = wrapAngle(sign + after / 2);
  const beforeSide = wrapAngle(sign - before / 2);
  return after >= before ? { wide: afterSide, narrow: beforeSide } : { wide: beforeSide, narrow: afterSide };
}

/** Menor diferença entre dois ângulos, em [0, π]. */
function angleBetween(a: number, b: number): number {
  return Math.abs(wrapAngle(a - b));
}

/**
 * O ângulo (a partir do centro da praça) mais longe de tudo o que já está em volta dela: placa,
 * bancos e as barracas em `occupied`. Fica no meio de um vão entre bancos, com caminho livre até
 * a fonte. Usado pela loja de ferramentas, a última a escolher lugar.
 */
export function quietestSide(square: SquareData, occupied: readonly { x: number; z: number }[]): number {
  const { x: cx, z: cz } = square.position;
  const angleOf = (p: { x: number; z: number }) => Math.atan2(p.x - cx, p.z - cz);
  const taken = [square.sign.position, ...square.benches.map((b) => b.position), ...occupied].map(angleOf);
  const samples = 360;
  let best = 0;
  let bestClearance = -1;
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const clearance = Math.min(...taken.map((t) => angleBetween(angle, t)));
    if (clearance > bestClearance) {
      best = angle;
      bestClearance = clearance;
    }
  }
  return wrapAngle(best);
}

/** Onde um jogador nasce: um ponto na praça, longe dos `others`, virado para a fonte (`center`). */
export function findSpawn(center: { x: number; z: number }, others: readonly Vec3[]): { position: Vec3; rotationY: number } {
  const { x: cx, z: cz } = center;
  let position: Vec3 = { x: cx, y: 0, z: cz + SPAWN_MIN_DISTANCE };
  for (let attempt = 0; attempt < 20; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const r = SPAWN_MIN_DISTANCE + Math.random() * (SPAWN_MAX_DISTANCE - SPAWN_MIN_DISTANCE);
    position = { x: cx + Math.sin(angle) * r, y: 0, z: cz + Math.cos(angle) * r };
    if (others.every((p) => distanceXZ(p, position) > PLAYER_RADIUS * 4)) break;
  }
  return { position, rotationY: Math.atan2(cx - position.x, cz - position.z) };
}
