// Constantes de gameplay e rede compartilhadas entre cliente e servidor.
// 1 unidade = 1 metro.
import type { CharacterAppearance } from "./protocol";

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

// --- Controles de toque (celular) ---
/** Raio (px) que o analógico virtual percorre do centro até a borda. */
export const TOUCH_STICK_RADIUS = 50;
/** Acima desta inclinação do analógico (0–1) o personagem corre. */
export const TOUCH_RUN_THRESHOLD = 0.9;
/** Multiplicador do arrasto do dedo em relação ao movimento do mouse. */
export const TOUCH_LOOK_SCALE = 1.6;

// --- Música de fundo (gerada no cliente com Web Audio) ---
/** Andamento da música, em batidas por minuto. */
export const MUSIC_BPM = 100;
/** Volume geral da música (0–1); baixo para não abafar o jogo. */
export const MUSIC_VOLUME = 0.22;

// --- Animais ---
/** Cores disponíveis para cachorro e gato (branco, preto, cinza, amarelo). */
export const ANIMAL_COLORS_SMALL = ["#f0ede8", "#1a1a1a", "#7a7a7a", "#c8960c"] as const;
/** Cores disponíveis para cavalos (marrom, preto). */
export const ANIMAL_COLORS_HORSE = ["#7b4f2e", "#1a1a1a"] as const;

// --- Dar peixe aos animais ---
/** Distância máxima (m) do jogador até o gato/cachorro para dar peixe. */
export const FEED_RANGE = 2;
/** Abertura total (graus) do cone em que o jogador precisa estar olhando para o animal. */
export const FEED_FACING_DEG = 90;
/** Intervalo mínimo entre dois peixes dados, conferido no servidor (ms). */
export const FEED_COOLDOWN_MS = 500;
/** Distância (m) que o animal mantém do jogador que ele segue. */
export const ANIMAL_FOLLOW_DISTANCE = 1.6;
/** Seguindo: quanto a velocidade cresce por metro de atraso (1/s) e o máximo (m/s), acima da corrida. */
export const ANIMAL_FOLLOW_CATCH_UP = 1.5;
export const ANIMAL_FOLLOW_MAX_SPEED = 8.5;

// --- Árvores ---
/** Quantas árvores o servidor gera ao iniciar. */
export const TREE_COUNT = 10;
/** Faixa da escala aleatória de cada árvore (1 = tamanho base, ~5 m de altura). */
export const TREE_MIN_SCALE = 0.8;
export const TREE_MAX_SCALE = 1.6;
/** Distância mínima entre árvores (m). */
export const TREE_MIN_SPACING = 8;
/** Raio livre no centro do mapa, onde os jogadores nascem (m). */
export const TREE_SPAWN_CLEAR_RADIUS = 20;
/** Distância mínima das bordas do mapa (m). */
export const TREE_EDGE_MARGIN = 10;

// --- Reações ---
/** Emojis disponíveis, indexados pelo ReactionId (0–3). */
export const REACTIONS = ["😊", "😢", "😠", "💡"] as const;
/** Duração total da animação de reação, em ms. */
export const REACTION_DURATION_MS = 2500;

// --- Praça da Cidade ---
/** Raio do piso de pedra da praça (m). */
export const SQUARE_RADIUS = 11;
/** Faixa de distância do centro do mapa até o centro da praça (m). */
export const SQUARE_MIN_DISTANCE = 30;
export const SQUARE_MAX_DISTANCE = 45;
/** Folga extra ao redor da praça onde não nascem árvores (m). */
export const SQUARE_TREE_CLEARANCE = 3;
export const SQUARE_SIGN_TEXT = "Praça da Cidade";
/** Quantidade de bancos sorteada entre estes valores (inclusive). */
export const SQUARE_MIN_BENCHES = 2;
export const SQUARE_MAX_BENCHES = 5;
/** Distância do centro da praça até os bancos (m). */
export const SQUARE_BENCH_RING = 6.5;

// --- Fonte e peixes ---
/** Raio externo da borda da fonte (m). */
export const FOUNTAIN_RADIUS = 2.6;
export const FOUNTAIN_WALL_HEIGHT = 0.6;
export const FOUNTAIN_WALL_THICKNESS = 0.3;
/**
 * Os jogadores nascem na praça, de frente para a fonte, num anel entre ela e os bancos (m, a partir do
 * centro). O mínimo fica fora do alcance da pesca, para a Ação não começar como "Pescar".
 */
export const SPAWN_MIN_DISTANCE = 4.3;
export const SPAWN_MAX_DISTANCE = 5.4;
/** Raio da coluna central da fonte (m). */
export const FOUNTAIN_PILLAR_RADIUS = 0.35;
/** Quantidade de peixes sorteada entre estes valores (inclusive). */
export const FOUNTAIN_MIN_FISH = 2;
export const FOUNTAIN_MAX_FISH = 5;
/** Faixa do tamanho de cada peixe (1 = ~30 cm). Cada peixe recebe um valor diferente. */
export const FISH_MIN_SCALE = 0.6;
export const FISH_MAX_SCALE = 1.5;
/** Velocidade de nado (m/s). */
export const FISH_SPEED = 0.5;
export const FISH_COLORS = ["#ff7b25", "#ffd23f", "#f25c54", "#f5f5f5", "#e8a33d"] as const;

// --- Pesca (botão de Ação na fonte) ---
/** Distância máxima (m) do jogador até a borda da fonte para poder pescar. */
export const FISHING_REACH = 1.2;
/** Abertura total (graus) do cone em que o jogador precisa estar olhando para a fonte. */
export const FISHING_FACING_DEG = 100;
/** Intervalo mínimo entre dois peixes pescados, conferido no servidor (ms). */
export const FISH_CATCH_COOLDOWN_MS = 800;
/** Limite do contador (protege o `join` de valores absurdos). */
export const MAX_FISH_CAUGHT = 99_999;
/** Pausa entre uma rodada do minigame e a próxima, mostrando o resultado (ms). */
export const FISHING_ROUND_PAUSE_MS = 1200;
/** Velocidade do marcador (larguras da barra por segundo): base, ganho por peixe e máximo. */
export const FISHING_SPEED_BASE = 0.55;
export const FISHING_SPEED_PER_FISH = 0.08;
export const FISHING_SPEED_MAX = 2.4;
/** Largura da área certa (fração da barra): base, quanto encolhe por peixe e mínimo. */
export const FISHING_ZONE_BASE = 0.3;
export const FISHING_ZONE_SHRINK_PER_FISH = 0.015;
export const FISHING_ZONE_MIN = 0.07;

// --- Comerciante (preços e estoque de cada item ficam em `items.ts`) ---
export const MERCHANT_NAME = "Seu Joaquim";
/** Aparência do comerciante; mude à vontade (ver `CharacterAppearance`). */
export const MERCHANT_APPEARANCE: CharacterAppearance = {
  shirtColor: "#3d6b8c",
  pantsColor: "#4a3b2c",
  skinColor: "#c98f65",
  hat: { style: "wide", color: "#d9b56b" },
  apronColor: "#efe6d2",
  mustacheColor: "#3b2a1e",
};
export const MERCHANT_SIGN_TEXT = "Comerciante";
/** Distância (m) da borda da praça até onde o comerciante fica, do lado de fora. */
export const MERCHANT_SQUARE_GAP = 2.5;
/** Distância (m) do comerciante até o centro da mesa, à frente dele. */
export const MERCHANT_TABLE_OFFSET = 0.9;
/** Distância máxima (m) do jogador até o centro da mesa para negociar. */
export const MERCHANT_TRADE_RANGE = 2.2;
/** Abertura total (graus) do cone em que o jogador precisa estar olhando para a mesa. */
export const MERCHANT_FACING_DEG = 100;
/** Intervalo mínimo entre duas negociações, conferido no servidor (ms). */
export const TRADE_COOLDOWN_MS = 150;
/** Limite do dinheiro de um jogador (protege o `join` de valores absurdos). */
export const MAX_MONEY = 999_999;

// --- Tiro ao Alvo (barraca do Balotinho) ---
export const SHOOTING_OWNER_NAME = "Balotinho";
/** Aparência do dono da barraca: camisa listrada de parque, colete, gravata-borboleta e chapéu de palha. */
export const SHOOTING_OWNER_APPEARANCE: CharacterAppearance = {
  shirtColor: "#e9e4d8",
  pantsColor: "#2b2d42",
  skinColor: "#e3b48c",
  hat: { style: "boater", color: "#e8c766" },
  vestColor: "#c1121f",
  bowTieColor: "#1d3557",
  mustacheColor: "#5a3a22",
};
export const SHOOTING_SIGN_TEXT = "Tiro ao Alvo";
/** Quanto custa jogar uma partida (reais). */
export const SHOOTING_ENTRY_COST = 1;
/** Prêmio por acertar `SHOOTING_TARGETS_TO_WIN` patos em sequência (reais). */
export const SHOOTING_PRIZE = 10;
export const SHOOTING_TARGETS_TO_WIN = 5;
/** Intervalo mínimo entre dois tiros (ms). O servidor aceita uma pequena folga de rede. */
export const SHOOTING_SHOT_COOLDOWN_MS = 400;
/** Uma partida sem terminar expira depois disto (ms) e conta como derrota. */
export const SHOOTING_MAX_SESSION_MS = 120_000;
/** Distância (m) da borda da praça até o balcão, do lado de fora. */
export const SHOOTING_SQUARE_GAP = 3.5;
/** Meia-largura da barraca e profundidade do balcão até a parede do fundo (m). */
export const SHOOTING_BOOTH_HALF_WIDTH = 2.1;
export const SHOOTING_BOOTH_DEPTH = 3.4;
/** Onde o Balotinho fica, no espaço da barraca (+Z = frente do balcão): num canto, fora da linha de tiro. */
export const SHOOTING_OWNER_OFFSET = { x: 1.6, z: -0.8 } as const;
/** Distância máxima (m) do jogador até o centro do balcão para jogar. */
export const SHOOTING_PLAY_RANGE = 2.2;
/** Abertura total (graus) do cone em que o jogador precisa estar olhando para o balcão. */
export const SHOOTING_FACING_DEG = 100;
/** Velocidade (m/s) dos patos em cada fileira; fileiras alternam o sentido. */
export const SHOOTING_DUCK_SPEEDS = [1.1, 1.6] as const;
/** Patos por fileira. */
export const SHOOTING_DUCKS_PER_ROW = 3;
/** Mirando: distância da câmera e deslocamento para o lado (por cima do ombro direito), em m. */
export const AIM_CAMERA_DISTANCE = 2.2;
export const AIM_CAMERA_SHOULDER = 0.6;
/** Quão rápido a câmera entra/sai do modo de mira (1/s). */
export const AIM_CAMERA_BLEND = 10;
