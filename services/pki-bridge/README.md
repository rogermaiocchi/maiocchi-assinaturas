# pki-bridge

Camada fail-closed entre o workflow DocuSeal, o provider PAdES privado e o registro público de autenticidade.

## Estado operacional

O provider privado usa DSS 6.4 no servidor. Há duas modalidades: sessão remota em PSC ICP-Brasil, sem software no computador, e agente Swift/CryptoTokenKit para um A3 físico local. Sem trust store ICP-Brasil, política AD-RB e credenciais válidas do provider escolhido, a geração correspondente permanece desabilitada. O verificador de autenticidade não transforma um PDF em PAdES e não simula validação ICP-Brasil.

Arquitetura e gates: [`docs/architecture/private-pades-provider.md`](../../docs/architecture/private-pades-provider.md).

## Contratos implementados

- Preparação de assinatura PDF em `POST /api/signature`.
- Conclusão em `POST /api/signature/completion`.
- Inspeção e validação em `PUT /api/signature-inspection`.
- Sessão de assinatura remota em `POST /api/signature-sessions`, com documento predefinido e certificado `CryptoDevice`.
- Webhook `submission.completed` normalizado e identificado por hash idempotente.
- Máquina de estados que impede conclusão fora de ordem.
- Registro externo do SHA-256 do PDF final já assinado.
- Página final de evidências incorporada antes do PAdES, com identidade, número, hash da entrada, QR, Code 128, metadados e área reservada ao signatário. O cabeçalho mantém o título à esquerda e a modalidade à direita. A marca oficial ICP-Brasil é incluída somente quando o manifesto declara infraestrutura `ICP-Brasil`; assinaturas simples e avançadas recebem, na mesma área do selo, a marca tipográfica PAdES sem alegação ICP-Brasil.
- Filete dourado superior de `3 pt` em todas as páginas. Nas páginas de conteúdo, faixa lateral discreta sem divisor, com o `m.` centralizado e uma única inscrição contínua, sem quebra: `ASSINATURA.MAIOCCHI.ADV.BR - DOCUMENTO <número> - HASH <SHA-256> - CÓDIGO <PQC-MLDSA65> - VERIFICAÇÃO <ID público> - PÁG <atual> DE <total>`. Não há paginação isolada em rodapé.
- Atestado ML-DSA-65 do manifesto pré-assinatura, com chave pública publicada e código `PQC-MLDSA65-*`.
- Segundo atestado ML-DSA-65 externo, emitido após a conclusão, cobre o hash do PDF PAdES final e o hash do relatório de validação.
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
- O hash impresso na página incorporada identifica o conteúdo recebido. O SHA-256 do PDF PAdES final é calculado somente depois da assinatura e exibido pelo verificador; o PDF não tenta conter o próprio hash.
- ML-DSA-65 atesta o manifesto do portal e não altera nem se apresenta como algoritmo da assinatura jurídica ICP-Brasil.
- O código ML-DSA incorporado tem escopo `manifesto pré-assinatura`; o verificador apresenta separadamente o código de escopo `PDF PAdES final`.

## Rotas

- `GET /healthz`
- `GET /api/pades/ticket`
- `POST /api/pades/remote/session`
- `POST /api/pades/remote/complete`
- `GET /api/pades/result`
- `GET /validar?codigo=:id` (endereço canônico público servido pelo portal)
- `GET /v/:id` (compatibilidade: redireciona para o endereço canônico)
- `GET /verificacao/:id`
- `POST /verificacao/:id/evento`
- `GET /folha/:id.pdf`
- `GET /original/:id.pdf`
- `GET /chaves/:keyId.pem`
- `GET /chaves-pqc/:keyId.pem`
- `POST /internal/authenticity/records`

## Configuração

`DATABASE_URL`, `ARTIFACT_ROOT`, `ARTIFACT_ENCRYPTION_KEY_FILE`, `AUTHENTICITY_PRIVATE_KEY_FILE`, `AUTHENTICITY_ML_DSA_PRIVATE_KEY_FILE`, `AUTHENTICITY_KEY_ID` e `AUTHENTICITY_INTERNAL_HMAC_KEY` são obrigatórios em produção. A chave ML-DSA deve ser `ml-dsa-65`; tipo divergente interrompe o serviço. A chave de artefatos contém exatamente 32 bytes e habilita AES-256-GCM com nonce aleatório e a chave de storage como AAD. `PUBLIC_BASE_URL` fixa os links canônicos. `ALLOWED_ORIGINS` recebe uma lista separada por vírgulas apenas para previews autorizados. `AUTHENTICITY_PUBLIC_KEYS_DIR` mantém arquivos históricos `{keyId}.pub.pem`; a chave ativa é sempre derivada do arquivo privado montado. `VALIDATOR_PUBLIC_KEYS_DIR` contém chaves públicas e `keyring.json`; diretório sem manifesto mantém a API de registro bloqueada.

Todo registro novo aponta para `https://assinatura.maiocchi.adv.br/validar?codigo=<ID>`. O endereço oficial `https://validar.iti.gov.br/` é publicado na folha e no JSON somente quando a infraestrutura validada for exatamente ICP-Brasil ou GOV.BR reconhecido. O rótulo genérico “assinatura avançada” não libera esse link.

Assinatura remota só é anunciada quando `REST_PKI_CORE_ENDPOINT`, `REST_PKI_CORE_API_KEY` e `REST_PKI_CORE_SECURITY_CONTEXT_ID` estão todos presentes. Configuração parcial interrompe a inicialização. O ticket do portal nunca é enviado ao PSC: a sessão é vinculada por UUID interno e o retorno só é aceito após conferência do `callbackArgument`, download do PDF, inspeção PAdES e validação de todos os signatários.

Antes de ativar a chave de artefatos em instalação existente, execute uma vez:

```bash
node src/migrate-artifact-encryption.mjs
```

Arquitetura e ativação: [`docs/architecture/remote-signing-no-install.md`](../../docs/architecture/remote-signing-no-install.md). Transição criptográfica: [`docs/security/post-quantum-transition.md`](../../docs/security/post-quantum-transition.md).

`PADES_ALLOWED_POLICY_OIDS` é uma allowlist explícita, separada por vírgulas. Lista vazia bloqueia todo registro. `ALLOW_PUBLIC_ORIGINALS` permanece `false` por padrão e só pode ser ativado após política de autorização e privacidade aprovada.

O manifesto segue `validator-keyring.example.json`. Uma chave `retired` ou `revoked` nunca autoriza registro novo, mesmo que o arquivo público permaneça arquivado.

`POST /verificacao/:id/evento` recebe somente `match`/`mismatch`. O evento é rotulado `untrusted_client_observation`, não entra na cadeia probatória e é amostrado atomicamente uma vez por documento, resultado e janela de dez minutos; rotas GET não têm efeito colateral.

## Teste

```bash
npm run test:pki
```

Fontes técnicas: OpenAPI do REST PKI Core 4.3.1 e commit `c7acac06` do `LacunaSoftware/PkiSuiteSamples`, consultados em 11 de julho de 2026.

Contrato completo: `docs/architecture/padrao-ouro-autenticidade.md`.
