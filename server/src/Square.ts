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
  SQUARE_BENCH_RING,
  SQUARE_MAX_BENCHES,
  SQUARE_MAX_DISTANCE,
  SQUARE_MIN_BENCHES,
  SQUARE_MIN_DISTANCE,
  SQUARE_RADIUS,
  SQUARE_SIGN_TEXT,
} from "@jogo/shared/constants";
import type { BenchData, FishData, SquareData } from "@jogo/shared/protocol";

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
