# Imagem de produção do Empurrão: um único processo Node serve o jogo e o Socket.IO.

# ---------- Etapa 1: build ----------
FROM node:22-slim AS build
WORKDIR /app

# Instala dependências primeiro (aproveita o cache do Docker).
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY client client
RUN npm run build

# ---------- Etapa 2: execução ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

# Só as dependências de execução do servidor (socket.io).
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace server --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/dist/index.js"]
