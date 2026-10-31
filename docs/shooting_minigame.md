# Especificação de Minigame: Barraca de Tiro ao Alvo

Este documento descreve os requisitos para a criação de um novo minigame de "Tiro ao Alvo" (Shooting Gallery), incluindo um novo NPC, regras de economia (custo e recompensa) e a lógica do jogo. Por favor, gere o código estruturado para implementar esta funcionalidade.

## 1. O NPC: Balotinho

* **Nome:** Balotinho.
* **Aparência:** É um personagem humano, utilizando a mesma base/modelo dos demais personagens do jogo, mas deve possuir propriedades que permitam **personalização visual** (ex: roupas, chapéu, cores específicas) para se destacar como o dono da barraca.
* **Posicionamento:** Ele deve ficar posicionado dentro (ou atrás do balcão) da barraca de Tiro ao Alvo.

## 2. Estrutura da Barraca (Shooting Booth)

* **Visual/Prop:** Uma barraca com o estereótipo clássico de parque de diversões (Tiro ao Alvo).
* **Placa (Sign):** A barraca deve possuir uma placa com o texto: `"Tiro ao Alvo"`.
* **Área de Interação:** Assim como a fonte de água, a barraca deve ter uma zona de interação onde o botão de "Ação" do jogador muda contextualmente (ex: para "Jogar (1 Dinheiro)").

## 3. Regras e Mecânicas do Minigame

* **Custo de Entrada:** Para iniciar o minigame, o jogador deve pagar **1 dinheiro/moeda**. O código deve verificar se o jogador possui o saldo antes de iniciar.
* **Equipamento:** Ao entrar no minigame, o personagem do jogador deve equipar uma **espingarda de pressão** (Air Rifle).
* **Alvos:** O minigame consiste em atirar em alvos móveis com formato de **patos**.
* **Condição de Derrota (Loss):** Se o jogador **errar** um único tiro, o minigame é encerrado imediatamente e ele sai sem ganhar nada (perdeu o 1 dinheiro da entrada).
* **Condição de Vitória (Win):** O jogador deve acertar **5 alvos (patos) em sequência**. Se atingir essa marca, ele vence, o minigame é encerrado e ele recebe **10 dinheiros** de prêmio.
