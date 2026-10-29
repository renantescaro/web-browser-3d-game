// Constantes de gameplay e rede compartilhadas entre cliente e servidor.
// 1 unidade = 1 metro.

// --- Sala / rede ---
export const MAX_PLAYERS = 10;
export const SERVER_PORT = 3000;
/** Frequência (Hz) com que o cliente envia o próprio estado e o servidor faz broadcast de snapshots. */
export const TICK_RATE = 20;
/** Atraso de interpolação dos jogadores remotos (ms). */
export const INTERPOLATION_DELAY_MS = 100;

// --- Nome / cor ---
export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 16;
export const PLAYER_COLORS = [
  "#e63946", // vermelho
  "#f4a261", // laranja
  "#f6d743", // amarelo
  "#2a9d8f", // verde-água
  "#57cc99", // verde
  "#4895ef", // azul
  "#3a0ca3", // anil
  "#9d4edd", // roxo
  "#ff70a6", // rosa
  "#6c4f3d", // marrom
] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

// --- Mundo ---
export const WORLD_SIZE = 200;
export const WORLD_HALF = WORLD_SIZE / 2;
export const SPAWN_RADIUS = 6;

// --- Física / movimento ---
export const PHYSICS_HZ = 60;
export const GRAVITY = -25;
export const WALK_SPEED = 4;
export const RUN_SPEED = 7.5;
export const JUMP_VELOCITY = 8.5;
/** Velocidade (rad/s) com que o personagem gira para a direção do movimento. */
export const TURN_SPEED = 12;

// --- Corpo do jogador ---
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_RADIUS = 0.35;

// --- Soco ---
export const PUNCH_COOLDOWN_MS = 500;
export const PUNCH_RANGE = 1.5;
/** Abertura total do cone de acerto, em graus. */
export const PUNCH_CONE_DEG = 60;
/** Duração total da animação de soco (estende + volta), em ms. */
export const PUNCH_ANIM_MS = 300;
export const KNOCKBACK_HORIZONTAL = 10;
export const KNOCKBACK_UP = 4.5;
/** Quão rápido o empurrão horizontal perde força (1/s). */
export const KNOCKBACK_DAMPING = 4;

// --- Câmera em terceira pessoa ---
export const CAMERA_DISTANCE = 5;
/** Altura do ponto que a câmera mira, acima dos pés. */
export const CAMERA_PIVOT_HEIGHT = 1.5;
export const CAMERA_DEFAULT_PITCH = 0.12;
export const CAMERA_MIN_PITCH = -0.25;
export const CAMERA_MAX_PITCH = 1.2;
export const CAMERA_SENSITIVITY = 0.0025;
/** Suavização do acompanhamento (1/s). Maior = mais rígido. */
export const CAMERA_FOLLOW = 14;

// --- Validação no servidor ---
/** Velocidade máxima plausível (m/s), já considerando knockback. */
export const MAX_PLAUSIBLE_SPEED = 25;
export const MAX_HEIGHT = 30;
