# Politica operacional de retencao e descarte

## Principios

1. Reter apenas pelo tempo justificado pela finalidade, por obrigacao juridica
   ou pelo exercicio regular de direitos.
2. Nunca apagar automaticamente documento concluido, assinatura, validacao ou
   evidencia probatoria.
3. Suspender descarte quando houver `legal hold`, litigio, fiscalizacao,
   incidente ou instrucao profissional documentada.
4. Tratar exclusao de banco, storage e backups como uma unica operacao de ciclo
   de vida.
5. Registrar a decisao, o executor, a data e o resultado sem reproduzir o
   conteudo eliminado.

## Matriz

| Classe | Prazo operacional padrao | Marco inicial | Destino |
|---|---:|---|---|
| Desafio de login por certificado | ciclo horario apos expiracao | `expires_at` | excluir linha e token derivado |
| Nonce HMAC interno | expiracao criptografica | `expires_at` | exclusao automatica no consumo seguinte |
| Ticket PAdES nao concluido e artefatos sem referencia | 30 dias | expiracao ou estado terminal | excluir eventos, ticket e bytes orfaos, depois de checar referencias |
| Convite, sessao e rascunho encerrado | 90 dias | cancelamento ou expiracao | excluir, salvo incorporacao a evidencia |
| Logs de acesso e seguranca sem incidente | 180 dias | evento | rotacionar e eliminar de modo seguro |
| Documento concluido, PDF assinado e evidencia | dez anos, como padrao interno revisavel | encerramento do expediente | revisao humana; sem exclusao automatica |
| Pedido de titular e resposta | cinco anos | encerramento do pedido | eliminar ou anonimizar conforme necessidade de prestacao de contas |
| Registro de incidente com dados pessoais | minimo de cinco anos | data do registro | revisao apos o minimo normativo e eventual prazo superior |
| Backup cifrado operacional | 35 dias | criacao | exclusao automatica, salvo `legal hold` |

O prazo documental de dez anos e decisao conservadora do escritorio. Ele pode
ser reduzido ou ampliado por classe documental, obrigacao legal, contrato,
segredo profissional ou avaliacao do caso.

## Saneamento automatico

O saneamento pode atingir somente registros identificados por consulta
deterministica e deve operar em lotes limitados. Para artefatos enderecados por
conteudo, a exclusao fisica exige prova de que a chave nao e referenciada por
ticket, workflow, registro de autenticidade ou artefato concluido.

A exclusao usa duas fases: o ticket elegivel e removido em transacao e suas
chaves entram em fila; os bytes somente podem ser avaliados 24 horas depois e
depois que essa fila estiver contida em backup cifrado ja copiado para o
MacBook. A segunda fase para o unico servico escritor, consulta novamente todas
as referencias, preserva chaves compartilhadas e mantem falhas na fila para
nova tentativa. A linha da fila nao e apagada: torna-se tombstone duravel com
estado `deleted` ou `retained`, de modo que uma restauracao reaplique a decisao.

Cada execucao deve oferecer modo `dry-run`, usar lock exclusivo, respeitar o
marcador global de `legal hold`, exigir backup local recente e copia externa do
mesmo ID, falhar de forma fechada e emitir apenas contagens e IDs de correlacao.
O conteudo e os tokens nao entram no log. A exclusao fisica e desabilitada por
padrao no CLI e so e ativada pelo runner governado com o `pki-bridge` parado.

## Backups e restauracao

- Os escritores DocuSeal e PKI sao parados durante o snapshot; dumps e arvores
  pertencem ao mesmo ponto sem novas escritas de aplicacao.
- O dump e o arquivo compactado fluem diretamente para `age`; nao ha copia
  persistente em claro.
- A VPS guarda somente o destinatario publico. A identidade privada de
  decriptacao fica fora do servidor.
- Cada conjunto possui `SHA256SUMS` sobre os arquivos cifrados e publicacao
  atomica. A area SSH exporta somente ciphertext.
- O MacBook copia o conjunto para outro dominio de falha, valida todos os
  hashes e decripta o manifesto somente em memoria antes de confirmar o mesmo
  ID a VPS. Sem essa confirmacao, a exclusao fisica permanece bloqueada.
- Um teste de restauracao trimestral valida hash, importacao em ambiente
  isolado e reaplicacao da fila de exclusoes.
- A presenca do marcador de `legal hold` suspende saneamento e rotacao na VPS e
  no MacBook, nunca a criacao de novo backup.

## Revisao

Revisar esta matriz a cada seis meses e sempre que houver nova modalidade de
assinatura, fornecedor, incidente relevante ou alteracao regulatoria.
