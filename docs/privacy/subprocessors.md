# Fornecedores e suboperadores

## Ativos

| Fornecedor | Funcao | Dados possiveis | Controle |
|---|---|---|---|
| Hostinger | VPS, rede, disco e snapshots contratados | dados armazenados e trafego cifrado | acesso administrativo restrito, HTTPS, isolamento Docker, cifragem de artefatos e backup |
| Apple iCloud Mail | entrega de codigos e alertas | destinatario, assunto, corpo e metadados SMTP | remetente unico do dominio, senha especifica de app fora do repositorio, sem documento anexo |

## Software sem transferencia por si so

O DocuSeal e o `pki-bridge` sao executados de forma autogerida na VPS. O uso do
codigo aberto nao transfere documentos aos mantenedores. Telemetria e analytics
permanecem desabilitados.

## Inativos ou dirigidos pelo usuario

- Lacuna Software/REST PKI: provider remoto desabilitado. Ativacao exige
  contratacao, revisao de localizacao, suboperadores, incidente, retorno/exclusao
  e credenciais de producao.
- VALIDAR ITI: link oficial externo. O usuario decide enviar o arquivo e passa a
  se submeter aos termos do servico oficial; o portal nao faz upload oculto.
- Qwen3 ou outro LLM: nao instalado no caminho de assinatura. Um componente de
  IA jamais recebe PIN, chave privada, material CMS/PAdES ou poder para declarar
  validade juridica.

## Revisao

Confirmar semestralmente fornecedor, finalidade, pais de tratamento,
suboperadores, prazos, seguranca, notificacao de incidente e procedimento de
devolucao/exclusao. A lista publica deve ser atualizada antes de nova
transferencia material.
