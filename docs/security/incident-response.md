# Resposta a incidente com dados pessoais

## Acionamento

Qualquer perda de confidencialidade, integridade, disponibilidade ou
autenticidade envolvendo dados pessoais abre um registro de incidente. Uma
vulnerabilidade sem exploracao e tratada como evento de seguranca; sua
exploracao pode elevar o caso a incidente.

## Primeira hora

1. Gerar ID, registrar hora de conhecimento e designar Roger Maiocchi, OAB/DF
   31.249, como responsavel pela decisao do controlador.
2. Conter sem destruir evidencia: revogar sessao, isolar servico, preservar logs
   e capturar hashes.
3. Rotacionar segredos potencialmente expostos por canal seguro.
4. Determinar sistemas, categorias, volume aproximado e titulares afetados.
5. Acionar operador envolvido e exigir fatos, horario, alcance e mitigacao.

## Avaliacao

Comunicar quando estiverem presentes, cumulativamente, incidente confirmado,
dados pessoais sujeitos a LGPD e possibilidade de risco ou dano relevante.
Considerar dados sensiveis, de autenticacao, financeiros, de grupos
vulneraveis, segredo profissional, escala, possibilidade de identificacao e
eficacia da criptografia/mitigacao.

## Comunicacao

- ANPD e titulares: ate tres dias uteis quando houver risco ou dano relevante,
  ressalvado prazo legal especifico.
- Se faltarem dados, fazer comunicacao preliminar fundamentada e complementar
  no prazo regulamentar.
- A comunicacao ao titular deve ser direta e individual quando possivel, em
  linguagem simples, com natureza dos dados, controles, riscos, medidas, data
  de conhecimento e contato.
- Peticionar a ANPD pelo canal oficial e classificar corretamente informacoes
  protegidas por segredo profissional, comercial ou industrial.

## Registro minimo

Conservar por pelo menos cinco anos, inclusive quando nao houver comunicacao:
data de conhecimento, circunstancias, categorias e quantidade, titulares,
avaliacao de risco, medidas, comunicacoes e motivo da nao comunicacao.

## Recuperacao

Restaurar de backup cifrado em ambiente isolado, validar hashes e migracoes,
reaplicar exclusoes pendentes, executar testes de assinatura/validacao e obter
aprovacao humana antes de recolocar o servico em producao.

## Pos-incidente

Produzir causa-raiz, linha do tempo, controles corretivos, responsavel e prazo.
Atualizar ameacas, testes, fornecedores, retencao e treinamento. Nenhum
encerramento ocorre apenas por narrativa: cada controle deve ter evidencia
tecnica ou documental rastreavel.

## Fontes oficiais

- Resolucao CD/ANPD 2/2022: agentes de tratamento de pequeno porte.
- Resolucao CD/ANPD 15/2024: comunicacao e registro de incidentes.
- Canal oficial: `gov.br/anpd`, area de Comunicacao de Incidente de Seguranca.
