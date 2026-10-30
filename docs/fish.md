Especificação: Botão de Ação Contextual e Minigame de Pesca

Este documento descreve a refatoração do botão de ataque para um botão de "Ação" contextual, bem como a implementação de um minigame de pescaria vinculado à Fonte de Água da Praça da Cidade. Por favor, gere o código considerando essas regras.

1. O Botão de "Ação" (Contextual Action Button)

O antigo botão/comando de "bater" deve ser renomeado e refatorado para um botão genérico de "Ação". O comportamento deste botão muda dependendo do que está na frente do jogador

Comportamento Padrão (Default): Se não houver nenhum objeto interativo na frente, o botão executa a ação de Bater (atacar outros players).

Comportamento Contextual (Fonte de Água): Se o jogador estiver posicionado de frente para a WaterFountain (na Praça da Cidade), o texto/ícone do botão na interface deve mudar para "Pescar".

2. Ação de Pescar (Fishing Action)

Quando o jogador pressionar o botão "Ação" (agora "Pescar") na frente da fonte:

Visual: O personagem deve equipar/mostrar uma vara de pescar (Fishing Rod) em suas mãos.

Gatilho: O jogo deve iniciar o Minigame de Pescaria.

3. Minigame de Pescaria (Fishing Minigame)

O minigame deve seguir estas regras:

Mecânica Base: Inicia-se um minigame na tela (pode ser um sistema de reflexo, manter uma barra na área correta, ou pressionar botões no tempo certo - implemente uma lógica base).

Escala de Dificuldade: A dificuldade do minigame deve aumentar progressivamente. A variável de controle para a dificuldade é a quantidade total de peixes que aquele jogador já pescou. Quanto mais peixes pescados, mais rápido ou mais difícil o minigame fica.

Saída: O jogador pode sair do minigame a qualquer momento (cancelar a ação).

4. UI e Persistência de Estado (State e HUD)

Contador na Tela: A HUD (Interface de Usuário) do jogador deve exibir constantemente a quantidade de peixes que ele já pescou.

Persistência: O número de peixes pescados é um atributo do jogador (PlayerState ou Inventory). Se o jogador sair do minigame de pesca e for andar pela praça, a quantidade de peixes pescados se mantém salva e visível na tela.