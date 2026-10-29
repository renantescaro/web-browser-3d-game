// Bootstrap: tela de entrada → jogo.
import "./style.css";
import { Game } from "./game/Game";
import { Music } from "./game/Music";
import { Physics } from "./game/Physics";
import { Network } from "./net/Network";
import { JoinScreen, REJECT_MESSAGES } from "./ui/JoinScreen";

const app = document.getElementById("app");
if (!app) throw new Error("Elemento #app não encontrado");
const container = app;

// Carrega o WASM do Rapier enquanto o jogador preenche o formulário.
const physicsReady = Physics.init();
const network = new Network();
// Criada já na tela de entrada para destravar o áudio no primeiro clique/tecla.
const music = new Music();
let game: Game | null = null;

const joinScreen = new JoinScreen(container, network, (welcome, info) => {
  physicsReady
    .then(() => {
      game = new Game(container, network, welcome, info, music);
      game.onKicked = (reason) => {
        game?.dispose();
        game = null;
        network.setSession(null);
        joinScreen.show(REJECT_MESSAGES[reason]);
      };
    })
    .catch((err: unknown) => {
      console.error("Falha ao iniciar a física", err);
      network.setSession(null);
      joinScreen.show("Não foi possível iniciar o jogo neste navegador.");
    });
});
joinScreen.show();
