# Especificação de Geração: Praça da Cidade (Town Square)

Este documento descreve os requisitos e a estrutura necessária para a implementação da "Praça" no jogo. Por favor, leia os requisitos abaixo e gere o código correspondente, utilizando boas práticas de orientação a objetos ou ECS (Entity Component System), dependendo da arquitetura do projeto.

## 1. Regra de Instanciação
- **Servidor:** Cada servidor iniciado deve obrigatoriamente gerar e possuir **exatamente 1 (uma) praça** em seu mapa.
- A geração da praça deve ocorrer durante o evento de inicialização/startup do servidor.

## 2. Características e Entidades da Praça
A praça é um local delimitado no mapa que deve conter o seguinte conjunto de características e entidades:

### A. Bancos (Benches)
- **Quantidade:** O código deve gerar aleatoriamente entre **2 a 5 bancos** espalhados pela praça.

### B. Placa (Sign)
- **Quantidade:** Exatamente **1 placa**.
- **Propriedade de Texto:** A placa deve conter a string `"Praça da Cidade"`.

### C. Fonte de Água (Water Fountain)
- **Quantidade:** Exatamente **1 fonte de água**.
- **Entidades Internas (Peixes):** 
  - A fonte deve atuar como um contêiner (ou zona) para peixes.
  - A fonte deve instanciar aleatoriamente entre **2 a 5 peixes**.
- **Comportamento dos Peixes:**
  - **Movimento:** O código deve incluir a lógica de atualização (tick/update) para que os peixes se movam dentro dos limites da fonte de água.
  - **Tamanho:** Cada peixe instanciado deve receber um valor de escala/tamanho diferente (por exemplo, um multiplicador de tamanho aleatório entre um valor mínimo e máximo).
