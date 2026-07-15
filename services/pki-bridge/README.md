# pki-bridge

Camada fail-closed entre o workflow DocuSeal, o provider PAdES privado e o registro público de autenticidade.

## Estado operacional

O provider privado usa DSS 6.4 no servidor. A modalidade pública padrão é a sessão remota em PSC ICP-Brasil, sem software no computador. O agente Swift/CryptoTokenKit para A3 físico local permanece como contingência explicitamente desabilitada. Sem trust store ICP-Brasil, política AD-RB e credenciais válidas do provider escolhido, a geração correspondente permanece desabilitada. O verificador de autenticidade não transforma um PDF em PAdES e não simula validação ICP-Brasil.

Arquitetura e gates: [`docs/architecture/private-pades-provider.md`](../../docs/architecture/private-pades-provider.md).

## Contratos implementados

- Preparação de assinatura PDF em `POST /api/signature`.
- Conclusão em `POST /api/signature/completion`.
- Inspeção e validação em `PUT /api/signature-inspection`.
- Sessão de assinatura remota em `POST /api/signature-sessions`, com documento predefinido e certificado `CryptoDevice`.
- Webhook `submission.completed` normalizado e identificado por hash idempotente.
- Máquina de estados que impede conclusão fora de ordem.
- Registro externo do SHA-256 do PDF final já assinado.
- Página final de evidências incorporada antes do PAdES, com identidade, número, hash da entrada, QR, Code 128, metadados e área reservada ao signatário. Um fundo integral A4 de segurança, gerado de SVG determinístico em `2480x3508` (`300 dpi`), usa guilloché, rosetas, microtexto e os contornos `m.` e `MAIOCCHI.`. Não há moldura perimetral nem contornos nos elementos de autenticação: véus brancos translúcidos, acentos cromáticos estreitos e espaçamento integram as cinco zonas em um único desenho. A área silenciosa clara do QR é preservada sem traço externo. Os dados dinâmicos permanecem texto PDF selecionável. O cabeçalho mantém o título à esquerda e a modalidade à direita. A marca oficial ICP-Brasil é incluída somente quando o manifesto declara infraestrutura `ICP-Brasil`; assinaturas simples e avançadas recebem, na mesma credencial, a marca tipográfica PAdES sem alegação ICP-Brasil.
- Em `VALIDAR O ORIGINAL`, cada endereço é uma linha de link com a mesma tipografia e o ícone vetorial Lucide `Globe`. O portal aparece sempre; o ITI ocupa a segunda linha somente quando o estado de confiança autoriza essa validação externa.
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
- A rota interna usa `timestamp.nonce.HMAC-SHA256`, vinculado a método, destino e SHA-256 do corpo. Cada nonce é consumido uma única vez no PostgreSQL; a resposta é ligada ao nonce, ao hash da requisição, ao status HTTP e ao próprio corpo.
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
- `GET /folha/:id.pdf`
- `GET /original/:id.pdf`
- `GET /chaves/:keyId.pem`
- `GET /chaves-pqc/:keyId.pem`
- `POST /internal/authenticity/records`
- `POST /internal/evidence/compose`
- `POST /internal/evidence/verify`
- `POST /internal/evidence/finalize`
- `POST /internal/pades/tickets`

## Configuração

`DATABASE_URL`, `ARTIFACT_ROOT`, `ARTIFACT_ENCRYPTION_KEY_FILE`, `AUTHENTICITY_PRIVATE_KEY_FILE`, `AUTHENTICITY_ML_DSA_PRIVATE_KEY_FILE`, `AUTHENTICITY_KEY_ID` e `AUTHENTICITY_INTERNAL_HMAC_KEY_FILE` são obrigatórios em produção. `AUTHENTICITY_INTERNAL_HMAC_KEY` permanece apenas como fallback de desenvolvimento e não pode coexistir com o arquivo. O Compose adiciona somente o GID suplementar `3400`; o arquivo montado usa `root:3400`, modo `0440`, dentro de diretório `0750`. A chave ML-DSA deve ser `ml-dsa-65`; tipo divergente interrompe o serviço. A chave de artefatos contém exatamente 32 bytes e habilita AES-256-GCM com nonce aleatório e a chave de storage como AAD. `PUBLIC_BASE_URL` fixa os links canônicos. `ALLOWED_ORIGINS` recebe uma lista separada por vírgulas apenas para previews autorizados. `AUTHENTICITY_PUBLIC_KEYS_DIR` mantém os arquivos Ed25519 históricos `{keyId}.pub.pem`. `AUTHENTICITY_ML_DSA_PUBLIC_KEYS_DIR` mantém, em diretório separado, as chaves ML-DSA-65 históricas `{keyId}.pub.pem`; o nome deve corresponder ao fingerprint derivado e a chave ativa é sempre incluída no keyring. `VALIDATOR_PUBLIC_KEYS_DIR` contém chaves públicas e `keyring.json`; diretório sem manifesto mantém a API de registro bloqueada.

Todo registro novo aponta para `https://assinatura.maiocchi.adv.br/validar?codigo=<ID>`. O endereço oficial `https://validar.iti.gov.br/` é publicado na folha e no JSON somente quando a infraestrutura validada for exatamente ICP-Brasil ou GOV.BR reconhecido. O rótulo genérico “assinatura avançada” não libera esse link.

Assinatura remota só é anunciada quando `REST_PKI_CORE_ENDPOINT`, `REST_PKI_CORE_API_KEY` e `REST_PKI_CORE_SECURITY_CONTEXT_ID` estão todos presentes. Configuração parcial interrompe a inicialização. `REST_PKI_CORE_REDIRECT_ORIGINS` autoriza, por origin HTTPS exata, eventuais hosts de autorização distintos do endpoint; qualquer redirect fora da allowlist é rejeitado. O ticket do portal nunca é enviado ao PSC: a sessão é vinculada por UUID interno e o retorno só é aceito após conferência do `callbackArgument`, download do PDF, inspeção PAdES e validação de todos os signatários.

`ENABLE_LOCAL_A3_SIGNING` permanece `false` por padrão. Ativá-la não elimina a necessidade de bridge instalada no computador que contém o token USB; apenas libera as rotas locais já protegidas. Produção sem bridge homologada deve manter esse valor desabilitado.

Antes de ativar a chave de artefatos em instalação existente, execute uma vez:

```bash
node src/migrate-artifact-encryption.mjs
```

Arquitetura e ativação: [`docs/architecture/remote-signing-no-install.md`](../../docs/architecture/remote-signing-no-install.md). Transição criptográfica: [`docs/security/post-quantum-transition.md`](../../docs/security/post-quantum-transition.md).

`PADES_ALLOWED_POLICY_OIDS` é uma allowlist explícita, separada por vírgulas. Lista vazia bloqueia todo registro. `ALLOW_PUBLIC_ORIGINALS` permanece `false` por padrão e só pode ser ativado após política de autorização e privacidade aprovada.

O manifesto segue `validator-keyring.example.json`. Uma chave `retired` ou `revoked` nunca autoriza registro novo, mesmo que o arquivo público permaneça arquivado.

Rotas públicas de verificação são somente leitura. A comparação SHA-256 acontece no navegador e não escreve na trilha probatória. O listener público ocupa `:3400` e recusa `/internal`; o listener interno ocupa `:3401`, faz bind apenas no endereço da rede Docker `signature-internal` e recusa rotas públicas. Requisições internas usam nonce persistido, HMAC-SHA-256 e correlação criptográfica bidirecional; o proxy público não alcança o listener interno.

## Teste

```bash
npm run test:pki
```

Fontes técnicas: OpenAPI do REST PKI Core 4.3.1 e commit `c7acac06` do `LacunaSoftware/PkiSuiteSamples`, consultados em 11 de julho de 2026.

Contrato completo: `docs/architecture/padrao-ouro-autenticidade.md`.
