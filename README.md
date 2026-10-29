# Empurrão

Jogo 3D casual para navegador, em terceira pessoa, para até **10 jogadores online**. Cada jogador escolhe um nome e uma cor, entra num mundo plano e pode andar, correr, pular e dar socos que empurram os outros (ninguém perde vida).

Feito com Three.js, Rapier (física), Socket.IO e Vite, num monorepo com npm workspaces:

| Pasta | O que tem |
|---|---|
| `client/` | Jogo no navegador (Vite + Three.js + Rapier) |
| `server/` | Servidor Node.js (HTTP + Socket.IO). Em produção também serve o cliente |
| `shared/` | Protocolo de rede e constantes usadas pelos dois lados |
| `e2e/` | Testes Playwright |

## Requisitos

- **Node.js 22 ou mais recente** (o Vite 8 exige Node ≥ 20.19, mas recomendamos 22+)
- npm 10 ou mais recente

## Rodando em desenvolvimento

```bash
npm install
npm run dev
```

Isso sobe dois processos juntos:

- **Cliente** (Vite) em http://localhost:5173, com recarregamento automático
- **Servidor** (Socket.IO) na porta 3000, reiniciando sozinho quando o código muda

Abra **http://localhost:5173** no navegador. Para testar o multiplayer, abra uma segunda aba (ou outro navegador) e entre com outro nome e outra cor.

Em desenvolvimento o Vite repassa as conexões `/socket.io` para a porta 3000, então o navegador só precisa acessar a porta 5173.

### Controles

| Tecla | Ação |
|---|---|
| W A S D | Mover (relativo à câmera) |
| Shift | Correr |
| Espaço | Pular |
| Clique esquerdo / F | Bater |
| Mouse | Girar a câmera (clique na tela para capturar o mouse) |
| Esc | Soltar o mouse |

### Outros comandos

```bash
npm run typecheck   # checa os tipos de todos os pacotes
npm run test:e2e    # testes Playwright (sobe o dev server sozinho se não estiver rodando)
npm run build       # build de produção do cliente e do servidor
npm start           # roda o build de produção
```

Na primeira vez que for rodar os testes, instale o navegador do Playwright:

```bash
npx playwright install chromium
```

## Deploy

Em produção roda **um único processo Node**: ele serve os arquivos do jogo e o Socket.IO na mesma porta. Não é preciso hospedar o cliente separado.

### 1. Gerar o build

```bash
npm install          # precisa das devDependencies (Vite) para compilar
npm run build
```

Isso gera:

- `client/dist/`: arquivos estáticos do jogo
- `server/dist/index.js`: servidor empacotado

### 2. Iniciar o servidor

```bash
npm start
```

O servidor escuta na porta **3000** por padrão. Para usar outra, defina a variável `PORT`:

```bash
PORT=8080 npm start
```

Abra `http://SEU_HOST:PORTA` e o jogo carrega direto.

> O `server/dist/index.js` ainda precisa de `node_modules` (por causa do `socket.io`). Rode o `npm start` na pasta do projeto, depois do `npm install`.

### Opção A: Docker / Portainer

O projeto tem um `Dockerfile` (build em duas etapas, imagem final só com o servidor e o jogo compilado, rodando como usuário sem privilégios) e um `docker-compose.yml`.

**Rodando com Docker direto:**

```bash
docker compose up -d --build     # constrói a imagem e sobe em http://localhost:3000
docker compose logs -f           # acompanha os logs (entradas/saídas de jogadores)
docker compose down              # derruba
```

Para usar outra porta no host, troque a da esquerda em `ports` no `docker-compose.yml` (ex.: `"8080:3000"`).

A imagem tem **healthcheck** (o Portainer mostra o container como *healthy*) e encerra limpo no `docker stop`.

**No Portainer**, escolha uma das formas:

1. **Stack a partir de um repositório Git** (mais simples): suba o projeto para um repositório (GitHub, GitLab…), vá em *Stacks → Add stack → Repository*, informe a URL e o caminho `docker-compose.yml`. O Portainer constrói a imagem a partir do `Dockerfile` sozinho. Para atualizar, use *Pull and redeploy*.

2. **Imagem pronta + editor web**: o editor web do Portainer não tem acesso aos arquivos do projeto, então não consegue fazer `build`. Construa e publique a imagem antes (troque `seu-usuario` pelo seu usuário no Docker Hub ou outro registry):

   ```bash
   docker build -t seu-usuario/empurrao:latest .
   docker push seu-usuario/empurrao:latest
   ```

   Depois, em *Stacks → Add stack → Web editor*, cole:

   ```yaml
   services:
     empurrao:
       image: seu-usuario/empurrao:latest
       container_name: empurrao
       restart: unless-stopped
       ports:
         - "3000:3000"
   ```

   Se a máquina do Portainer for ARM (ex.: Raspberry Pi) e a sua for x86, construa com `docker buildx build --platform linux/arm64 ...`.

Para HTTPS, coloque o container atrás de um proxy reverso (Caddy, nginx, Traefik, Nginx Proxy Manager), lembrando de liberar **WebSocket** (veja os exemplos na Opção C).

### Opção B: plataforma gerenciada (Render, Railway, Fly.io etc.)

Crie um serviço web Node apontando para este repositório com:

| Configuração | Valor |
|---|---|
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Porta | a plataforma costuma definir `PORT`, e o servidor já lê essa variável |

Garanta que a plataforma suporte **WebSockets** (as citadas suportam).

### Opção C: servidor próprio (VPS)

1. Instale o Node 22+ no servidor e copie/clone o projeto.
2. Rode `npm install && npm run build`.
3. Mantenha o processo rodando com um gerenciador, por exemplo [pm2](https://pm2.keymetrics.io/):

   ```bash
   npm install -g pm2
   pm2 start npm --name empurrao -- start
   pm2 save
   ```

4. Coloque um proxy reverso com HTTPS na frente. Exemplo com **Caddy** (gera o certificado sozinho e já repassa WebSockets):

   ```
   jogo.seudominio.com {
       reverse_proxy localhost:3000
   }
   ```

   Exemplo com **nginx** (as linhas `Upgrade`/`Connection` são obrigatórias para o WebSocket):

   ```nginx
   server {
       server_name jogo.seudominio.com;
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
       }
   }
   ```

### Limitações do deploy

- **Rode só uma instância.** O estado da sala fica na memória do processo; duas instâncias seriam duas salas separadas, e um balanceador de carga dividiria os jogadores entre elas.
- **Reiniciar o servidor esvazia a sala.** Os jogadores conectados reconectam sozinhos e voltam com o mesmo nome e cor (se a cor ainda estiver livre).
