# Arquitetura do pki-bridge

## Fronteira

O DocuSeal administra documentos e coleta dados. O `pki-bridge` administra a revisão imutável do PDF e o ciclo criptográfico. A integração ocorre por webhook autenticado, API interna e anexos explícitos no registro da submissão.

## Estados

```text
docuseal_draft
  -> docuseal_completed
  -> pdf_frozen
  -> pki_pending
  -> pki_in_progress
  -> pki_completed
  -> validated
  -> delivered
```

Estados laterais: `cancelled`, `expired`, `rejected`, `validation_failed` e `retryable_error`.

Uma transição exige comparação otimista de versão. Eventos repetidos retornam o estado já produzido. Uma revisão do PDF não pode regressar nem ser substituída depois de `pki_in_progress`.

## Entidades

### `pki_workflows`

- UUID interno;
- conta e submissão DocuSeal;
- revisão do documento;
- modalidade;
- estado e versão otimista;
- hash e tamanho do PDF congelado;
- horários de criação, expiração, conclusão e cancelamento.

### `pki_signers`

- workflow e signatário DocuSeal;
- ordem;
- `signature_requirement`;
- estado;
- referência pública do certificado e resultado de validação;
- horários e motivo de falha.

### `pki_sessions`

- identificador opaco de uso único;
- signatário, expiração e estado;
- hash da requisição para idempotência;
- referência ao estado remoto Lacuna;
- nenhum segredo, PIN ou chave privada.

### `pki_artifacts`

- tipo: `docuseal_original`, `pades_revision`, `pades_final` ou `validation_report`;
- hash SHA-256, tamanho e content type;
- storage key imutável;
- revisão anterior e signatário responsável.

### `pki_events`

Trilha append-only com evento, ator, workflow, versão anterior/nova, correlação e horário. Payloads não armazenam documento, credencial ou PIN.

## Contratos HTTP

### Webhook interno

`POST /internal/docuseal/events`

- valida HMAC antes do parse de negócio;
- exige UUID do evento;
- aceita somente tipos permitidos;
- aplica idempotência;
- busca o PDF pela API do DocuSeal;
- calcula hash antes de criar o workflow.

### Assinatura

- `POST /v1/workflows/:id/signatures/start`
- `POST /v1/workflows/:id/signatures/complete`
- `GET /v1/workflows/:id/status`
- `GET /v1/workflows/:id/artifacts/final`

O início exige que o chamador corresponda ao signatário atual. A conclusão exige sessão válida, não usada, não expirada e vinculada ao mesmo workflow.

### GOV.BR externo

- `GET /v1/workflows/:id/govbr/original`
- `POST /v1/workflows/:id/govbr/upload`
- `GET /v1/workflows/:id/govbr/validation`

O upload não avança o workflow até que assinatura, cadeia, cobertura do PDF e vínculo com a revisão sejam validados.

## PDF canônico

O PDF canônico é o mesmo conjunto de bytes apresentado ao primeiro signatário PKI. O sistema registra SHA-256, tamanho, storage key e revisão. Qualquer regeneração, linearização, compressão, marca ou mudança posterior cria nova revisão e invalida as sessões existentes.

Cada assinatura PAdES usa como entrada a revisão anterior. A verificação final rejeita `ByteRange` inconsistente, revisão não coberta ou alteração posterior não autorizada.

## Integração com DocuSeal

O fork receberá uma extensão mínima:

- metadados do workflow PKI;
- anexo do PDF DocuSeal congelado;
- anexo do PDF PAdES final;
- anexo do relatório de validação;
- estado visível e ação para retomar a assinatura.

O anexo original nunca é sobrescrito. O download principal só aponta ao PAdES quando o workflow está `validated`.

## Provider Lacuna

A interface interna separa o domínio do cliente do contrato da Lacuna:

- `prepareSignature`;
- `completeSignature`;
- `validateSignature`;
- `requestTimestamp` quando previsto;
- `health`.

O provider `disabled` é o único permitido sem licença. Ele retorna indisponibilidade explícita e nunca produz PDF marcado como assinado. Providers de teste são compilados somente para testes automatizados.
