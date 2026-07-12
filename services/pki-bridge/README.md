# pki-bridge

Camada fail-closed entre o workflow DocuSeal, um provider PAdES e o registro público de autenticidade. O código não incorpora o projeto de demonstração da Lacuna; ele implementa contratos próprios a partir da documentação e do OpenAPI oficial.

## Estado operacional

O provider é fail-closed. Sem endpoint HTTPS, credencial injetada em runtime, security context e licença contratados, a geração PAdES permanece desabilitada. Credenciais de exemplo são proibidas. O verificador de autenticidade não transforma um PDF em PAdES e não simula validação ICP-Brasil.

## Contratos implementados

- Preparação de assinatura PDF em `POST /api/signature`.
- Conclusão em `POST /api/signature/completion`.
- Inspeção e validação em `PUT /api/signature-inspection`.
- Webhook `submission.completed` normalizado e identificado por hash idempotente.
- Máquina de estados que impede conclusão fora de ordem.
- Registro externo do SHA-256 do PDF final já assinado.
- Envelope JSON canônico assinado com Ed25519/JWS.
- Atestado Ed25519/JWS do adapter, ligado ao PDF, relatório, workflow, revisão e resumo da validação.
- Storage imutável por conteúdo para PDF, relatório, atestado, folha e envelope.
- Folha A4 separada com ID, hash completo, URL e QR Code.
- API pública de verificação, original restrito por padrão e comparação local no navegador.
- PostgreSQL com identidade imutável, estados append-only, registros, assinaturas, hashes, auditoria encadeada e observações públicas separadas.

O download temporário retornado pelo REST PKI Core só é aceito no mesmo host HTTPS do endpoint configurado. A URL nunca é persistida como evidência; o arquivo deve ser baixado imediatamente, ter seu hash calculado e ser armazenado pelo serviço.

## Invariantes

- O PDF final não é alterado depois do hash.
- O registro exige PAdES ICP-Brasil `AD-RB` ou `AD-RT`, DocMDP e cobertura integral válidos.
- O resumo e o relatório exigem atestado de chave pública presente no keyring do validador.
- Todas as cadeias devem ser válidas e todas as revogações devem retornar `good`.
- `AD-RT` exige carimbo de tempo válido.
- A rota interna usa `timestamp.HMAC-SHA256` com janela de cinco minutos e não é publicada pelo Traefik.
- Registro repetido do mesmo pacote é idempotente; conteúdo divergente no mesmo workflow retorna conflito.
- A folha é representação; o envelope Ed25519 é prova do registro; somente o PAdES é a assinatura do documento.

## Rotas

- `GET /healthz`
- `GET /v/:id`
- `GET /verificacao/:id`
- `POST /verificacao/:id/evento`
- `GET /folha/:id.pdf`
- `GET /original/:id.pdf`
- `GET /chaves/:keyId.pem`
- `POST /internal/authenticity/records`

## Configuração

`DATABASE_URL`, `ARTIFACT_ROOT`, `AUTHENTICITY_PRIVATE_KEY_FILE`, `AUTHENTICITY_KEY_ID` e `AUTHENTICITY_INTERNAL_HMAC_KEY` são obrigatórios em produção. `PUBLIC_BASE_URL` fixa os links canônicos. `ALLOWED_ORIGINS` recebe uma lista separada por vírgulas apenas para previews autorizados. `AUTHENTICITY_PUBLIC_KEYS_DIR` mantém arquivos históricos `{keyId}.pub.pem`; a chave ativa é sempre derivada do arquivo privado montado. `VALIDATOR_PUBLIC_KEYS_DIR` contém chaves públicas e `keyring.json`; diretório sem manifesto mantém a API de registro bloqueada.

`PADES_ALLOWED_POLICY_OIDS` é uma allowlist explícita, separada por vírgulas. Lista vazia bloqueia todo registro. `ALLOW_PUBLIC_ORIGINALS` permanece `false` por padrão e só pode ser ativado após política de autorização e privacidade aprovada.

O manifesto segue `validator-keyring.example.json`. Uma chave `retired` ou `revoked` nunca autoriza registro novo, mesmo que o arquivo público permaneça arquivado.

`POST /verificacao/:id/evento` recebe somente `match`/`mismatch`. O evento é rotulado `untrusted_client_observation`, não entra na cadeia probatória e é amostrado atomicamente uma vez por documento, resultado e janela de dez minutos; rotas GET não têm efeito colateral.

## Teste

```bash
npm run test:pki
```

Fontes técnicas: OpenAPI do REST PKI Core 4.3.1 e commit `c7acac06` do `LacunaSoftware/PkiSuiteSamples`, consultados em 11 de julho de 2026.

Contrato completo: `docs/architecture/padrao-ouro-autenticidade.md`.
