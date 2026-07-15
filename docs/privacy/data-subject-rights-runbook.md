# Runbook de direitos dos titulares

## Entrada e identidade

1. Receber exclusivamente pela Central de ajuda e gerar ID de atendimento.
2. Confirmar identidade de forma proporcional ao risco; nao solicitar copia
   integral de documento quando meio menos invasivo for suficiente.
3. Registrar escopo, direito invocado, sistemas envolvidos e prazo aplicavel.
4. Acusar recebimento sem confirmar a existencia de dados antes da validacao da
   identidade.

## Busca rastreavel

Pesquisar, pelo identificador minimo necessario:

- conta, submissao, participante e anexos no DocuSeal;
- ticket, artefato, evento e registro publico no `pki-bridge`;
- convites e mensagens no provedor de e-mail;
- logs de seguranca dentro da janela de 180 dias;
- backups ainda dentro da janela de 35 dias.

O resultado da busca deve registrar sistema, consulta, data, operador e
contagem, sem copiar conteudo desnecessario para o processo de atendimento.

## Decisao

- Confirmacao e acesso: entregar resposta clara e, quando cabivel, copia em
  formato seguro.
- Correcao: alterar somente dados mutaveis; assinatura e evidencia imutavel
  recebem adendo ou novo documento, sem reescrita historica.
- Eliminacao, bloqueio ou oposicao: verificar obrigacao legal, exercicio regular
  de direitos, segredo profissional e `legal hold`.
- Informacao sobre compartilhamento: usar a lista versionada de operadores e o
  fluxo concreto, sem resposta generica.
- Portabilidade: aplicar o formato regulamentado e excluir segredo de terceiros.
- Decisao automatizada: o portal nao decide direitos juridicos por perfil; um
  bloqueio criptografico pode ser submetido a revisao humana.

## Execucao e backups

Quando a eliminacao for cabivel, excluir referencias e bytes em todos os
sistemas ativos, registrar hash da ordem de exclusao e inserir a decisao na fila
de reaplicacao de backups. Uma restauracao nao pode reativar dados eliminados.

## Resposta e encerramento

Responder pelo mesmo canal autenticado, em linguagem clara, indicando o que foi
localizado, a medida adotada, eventual fundamento de retencao e o canal para
contestacao. Conservar o processo de atendimento por cinco anos para prestacao
de contas, sem anexar copias desnecessarias dos dados tratados.
