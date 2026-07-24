# ADR 0005 — SSO host-only entre Portal Maiocchi e DocuSeal

- Estado: fundação transitória superseded; ativação de produção proibida
- Data: 2026-07-18
- Fonte do fork: `compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz`
- SHA-256 da fonte: `e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c`
- Patches derivados, em ordem: `patches/docuseal/0009-maiocchi-uno-sso.patch`,
  `patches/docuseal/0010-pin-build-inputs.patch` e
  `patches/docuseal/0011-update-native-image-libraries.patch`

## Decisão

Esta fundação transitória usa o apex canônico `maiocchi.adv.br` para emitir um
authorization code de uso único. `www` é redirect-only e nunca pode atuar como
issuer, authorize endpoint ou token endpoint. O DocuSeal continua responsável
pela própria sessão, sempre em cookie host-only. Não há cookie com
`Domain=.maiocchi.adv.br`, token reutilizável no navegador nem compartilhamento
de sessão entre hosts.

O desenho foi superseded como alvo de produção pela ADR de identidade OIDC
central em `id.maiocchi.adv.br`. O código permanece somente como fundação de
transição e ensaio isolado; enquanto o issuer OIDC e seus gates G0-G8 não forem
materializados, os gates públicos de SSO permanecem desligados.

O fluxo usa `/sso/maiocchi/start` e `/sso/maiocchi/callback`, `state`, `nonce` e
PKCE S256 gerados por `SecureRandom`. O callback consome o estado da sessão antes
do backchannel. O code é trocado em HTTPS com credencial Basic própria, lida do
arquivo montado `/run/signature-secrets/api_signature_sso_client_secret`; a
credencial não integra query string, browser storage ou log.

O DTO aceito é uma allowlist exata. O DocuSeal exige `issuer`, `audience`,
`scope`, `nonce`, `subject`, `role`, `auth_time`, `exchange_id`, `issued_at`,
`expires_at` e `expires_in`. `issued_at` precisa ser fresco, `expires_at` futuro e
o intervalo absoluto deve coincidir com `expires_in`, limitado a 30 segundos.

## Vínculo de identidade

O par imutável `provider + subject` é a chave externa. O vínculo persiste o
`user_id` e o `account_id` locais, com unicidade também por usuário. Cada
`exchange_id` aceito entra em ledger próprio e único, impedindo replay local.

O account de destino é uma allowlist exata por UUID. Roles externas aceitas:
`admin`, `advogado` e `staff`; todas mapeiam para o único papel administrativo
existente no fork DocuSeal. Um e-mail local já existente nunca é descoberto ou
vinculado automaticamente. Para o usuário histórico, o primeiro vínculo depende
de `MAIOCCHI_SSO_BOOTSTRAP_USER_UUID`, UUID local escolhido explicitamente e com
igualdade de account e e-mail. Sem bootstrap, só é criado usuário quando o e-mail
é globalmente inédito. Qualquer drift posterior de subject, account, e-mail ou
role falha fechado e exige reconciliação administrativa rastreável.

## Sessão e fallback

A autenticação bem-sucedida executa `reset_session` antes do `sign_in`. Em
produção, o cookie é `__Host-docuseal_session`, `Secure`, `HttpOnly`,
`SameSite=Lax`, `Path=/` e sem atributo `Domain`. Logout, certificado ICP-Brasil
e senha/OTP locais permanecem disponíveis. O SSO passa a ser o botão principal
do portal, mas não remove os fallbacks.

Todas as respostas do fluxo recebem `Cache-Control: no-store`, `Pragma:
no-cache` e `Referrer-Policy: no-referrer`. O contrato verifica a presença
semântica da diretiva `no-store`, não uma serialização redundante com
`max-age=0`: o [RFC 9111, seção 5.2.2.5](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.5)
proíbe armazenamento e reuso com `no-store`, e o
[Rails 8.1.3](https://github.com/rails/rails/blob/v8.1.3/actionpack/lib/action_dispatch/http/cache.rb#L261-L296)
normaliza esse caso para a forma canônica `no-store`.

## Evidência e testes negativos

O patch contém specs para:

- state divergente, expirado e replay;
- nonce divergente, PKCE recusado pelo provider e code inválido;
- issuer, audience, scope, role e prazo divergentes;
- resposta extra/malformada ou acima de 32 KiB;
- replay de `exchange_id`;
- colisão de e-mail, account incorreto, role não permitida e bootstrap divergente;
- derivação da fonte `.14`, cookie host-only, Traefik e preservação dos fallbacks.

`tests/maiocchi-sso-contract.test.mjs` verifica localmente o contrato rastreável
sem depender de runtime. As specs Rails acompanham o patch e somente contam como
executadas depois da construção da imagem candidata e de PostgreSQL 16 isolado.

## Candidato do portal estático

O botão SSO não integra a imagem produtiva `1.15.0`. Ele compõe um candidato com
tag exclusiva no padrão `1.15.1-sso-<recipe-sha12>-a<tentativa>`, com versão
coerente em `package.json`, `package-lock.json`, label OCI, fonte OCI e compose.
As duas imagens-base do Dockerfile estão fixadas por digest.

O contexto de build não nasce da worktree: o script reconstrói o commit exato
`7e864d548b39ff3bbdcc6693f0bc05b3a72ed44d`, aplica o patch de hash fixo e só
então executa build, testes e lint. Arquivos sujos ou não rastreados — inclusive
duplicados locais — não ingressam no snapshot. O canário usa container próprio e
rede `internal`, sem porta nem router público; portanto não substitui a instância
produtiva por simples execução do compose candidato.

O contrato `portal-v1.15.1-sso-candidate.contract.json` exige `docker inspect`,
archive da imagem efetivamente construída, SBOM CycloneDX bruto do Syft,
relatório Grype bruto, metadata dos scanners e do banco de vulnerabilidades,
gate `--fail-on high`, label do commit assinado da receita e manifesto SHA-256.
O build captura o image ID `sha256:` imediatamente após a
construção; inspect, archive, Syft e Grype operam nesse ID, com origem Docker
explícita, e a tag é conferida outra vez no fim. A tag recebe lock atômico dentro
do Git dir real — inclusive em worktrees — e o diretório-folha de evidência é
reservado por `mkdir` atômico. Ausência de qualquer evidência mantém o status
NO-GO; SBOM ou scan de versão anterior não podem ser reaproveitados.

## Candidato DocuSeal e supply chain

O candidato DocuSeal reconstrói o archive `.14`, aplica `0009`, `0010` e `0011`
por hash, fixa Ruby por digest e fixa por commit/release + SHA-256 os assets
externos de fontes, modelo e PDFium. A fonte oficial libtiff 4.7.2 de
`https://download.osgeo.org/libtiff/tiff-4.7.2.tar.gz` é vendorizada
em `compliance/sources/tiff-4.7.2.tar.gz`, com SHA-256
`672bd7d10aee4606171afb864f3570b83340f6a33e2c186dc0512f7145ffdf6a`
e SHA-512 upstream
`bad66954a7e7e158c6dcbfc0e2d0032b8f3e2a354b6d0fdbb8038a7963e36c5b8a433dd4ee81c6c4dabfb50094152d440aa1f32b5299098c9ae29e55de2e41fc`.

O `0011` deriva o APKBUILD do Alpine 3.24, preserva `cmake3.5`, executa `ctest`
como usuário não-root e produz um repositório APK local assinado por chave
efêmera. A imagem instala `tiff=4.7.2-r0` sem `--allow-untrusted`, exige os quatro
subpacotes OpenEXR runtime em `3.4.13-r0`, conserva apenas a chave pública e o
pacote verificável e comprova o linkage de `libvips` com `libtiff.so.6`. A chave
privada nunca ingressa na imagem final nem no conjunto de evidências.

O build produz `docker inspect`, archive da imagem, SBOM, APK TIFF, manifesto do
repositório, manifesto fechado dos cinco pacotes nativos, Grype bruto, OpenVEX
com identidade documental nova ligado ao digest imutável, Grype filtrado,
metadata dos scanners e manifesto SHA-256 no mesmo diretório novo de evidência.
O relatório bruto só pode conter
como High/Critical o subconjunto dos dois matches CPE de TIFF previsto no
contrato. O filtrado deve conter zero High/Critical e suas supressões devem ser
idênticas ao conjunto bruto autorizado: CVE-2023-52356 como `not_affected` pela
restrição oficial de versão e CVE-2026-4775 como `fixed` em 4.7.2. OpenEXR não
admite VEX; qualquer achado novo falha fechado.

Syft 1.46.0 e Grype 0.115.0 são aceitos somente quando os binários Linux/AMD64
possuem o SHA-256 exato derivado dos assets oficiais GitHub cujos checksums
publicados constam dos contratos. O builder resolve cada scanner uma única vez
para caminho absoluto, recusa link simbólico, confere o hash antes de consultar
versão ou banco e o repete após os scans; todas as chamadas posteriores usam o
mesmo path. Versão e commit autodeclarados são uma confirmação adicional, não a
prova exclusiva de identidade. Essa cadeia HTTPS/checksum é rastreável, mas não
é descrita como attestation criptográfica do publisher. As configurações ficam
versionadas em `compliance/config/` e cada invocação roda sob `env -i`, herdando
apenas `HOME` e `PATH`. O Grype atualiza o banco explicitamente antes dos scans; em seguida,
auto-update permanece desligado, o banco precisa ser válido, ter schema v6,
checksum remoto e idade máxima de 24 horas, e seu status e SHA-256 devem ficar
idênticos durante o conjunto raw/filtered. A metadata registra versões, commits,
hashes dos binários e assets, schema e hash do banco e ingressa no mesmo conjunto
fechado de evidências.

O preflight não confia apenas nos nomes ou hashes dos arquivos. Ele liga o image
ID ao descriptor do archive Docker 29, valida manifesto, config, camadas e
tamanhos, compara o inspect com a config arquivada e exige que SBOM e Grype
incorporem a mesma config e o commit assinado da receita. Como Docker 29 e a API
lida pelo Grype podem recomprimir camadas e produzir digests de manifesto
distintos, o vínculo entre as duas representações usa a fronteira estável:
config digest, quantidade de `diff_ids` e sequência exata de `mediaType + size`;
cada manifesto continua obrigado a corresponder ao próprio digest. O
archive só pode conter os dois diretórios OCI, os três arquivos de metadata e os
blobs efetivamente referenciados; spelling não canônico, blob órfão, link ou
entrada duplicada falha fechado.

A configuração efetiva do Grype é comparada como objeto fechado, inclusive os
parâmetros que habilitam matching por CPE em cada ecossistema. Os relatórios
registram timestamps RFC 3339 reais: o scan raw deve estar no máximo 24 horas
após o build do banco, o filtrado deve suceder o raw em até uma hora e o OpenVEX
deve preceder ambos dentro da mesma janela. Na conservação DocuSeal, o objeto
completo de cada match precisa reaparecer no relatório filtrado; somente
`appliedIgnoreRules` pode ser acrescentado ao mover os dois achados TIFF para
`ignoredMatches`.
No Portal, o preflight reaplica ao relatório bruto ligado à imagem a allowlist
fechada `Unknown`/`Negligible`/`Low`/`Medium`, independentemente do gate
executado pelo builder; severidade ausente ou não canônica falha. No
DocuSeal, tanto builder quanto preflight exigem `Config.User=docuseal`; uma
imagem coerente internamente, mas configurada para root, permanece NO-GO.

O SHA-256 do arquivo SQLite do Grype é uma medição executada antes e depois dos
scans pelo builder, não uma promessa de prova offline permanente: o banco é um
artefato de grande volume e não é duplicado em cada evidência. A referência
histórica independente é o URL imutável com checksum registrado em `from`; uma
auditoria que exija o próprio SQLite deve reter esse artefato separadamente.

O compose candidato possui PostgreSQL 16, banco, volume, rede e secrets
exclusivos, sem porta ou nome produtivo. Ele não é iniciado durante o build. O
harness `scripts/test-docuseal-sso-pg16-isolated.sh` usa outro namespace, rede
interna e banco em tmpfs para executar todas as migrations, confirmar os dois
triggers SSO, rodar os quatro specs focados e fazer smoke `/up`; sua limpeza só
aceita nomes e labels pertencentes ao próprio run.

Resolução de pacotes Alpine, Bundler e Yarn ainda impede alegar reprodução
bit-a-bit da imagem inteira. O APK TIFF é construído de fonte vendorizada com
epoch fixo e tem prova repetida de payload; a assinatura usa chave efêmera por
build. A verdade imutável da release é o archive hashado da imagem construída a
partir do commit assinado, não uma promessa narrativa de reprodutibilidade.

`scripts/validate-release-patch-indexes.sh` reconstrói as duas fontes, compara
todos os blob IDs declarados antes e depois dos patches `0001`, `0009`, `0010` e `0011`
e confronta a contagem bruta de linhas com `git apply --numstat`, recusando
metadado stale ou cauda fora de hunk. O builder DocuSeal verifica a sintaxe Ruby
dos quatro specs SSO; o harness repete esse gate num container Ruby pinado,
isolado e somente leitura antes do build completo. Depois dos builds, o único
caminho contratual para Compose é `scripts/run-sso-candidate-compose.sh`: ele
lê os IDs dos diretórios
fechados de evidência, executa `shasum -c`, relê os IDs para fechar TOCTOU e chama
`scripts/validate-sso-candidate-images.sh` imediatamente antes do Compose. O
preflight exige commit assinado e limpo, `linux/amd64` e todas as labels exatas.
Ele também relê da imagem imutável o manifesto dos dez arquivos TIFF/OpenEXR e
compara os hashes com a evidência, impedindo que um manifesto sintaticamente
válido substitua os bytes realmente executados.
O wrapper fixa projeto, diretório, env-file e os dois YAMLs; não admite `run`,
`exec`, overlays ou opções de publicação. `config` só pode ser silencioso e sem
interpolação, para não materializar credenciais na saída.

## Gates de ativação

1. Construir tags únicas contendo o SHA congelado para Portal 1.15.1 e DocuSeal
   3.0.1-maiocchi.15; não reutilizar tag/evidence dir anterior.
2. Executar o harness PostgreSQL 16, migrations, triggers, specs Rails e smoke.
3. Gerar SBOM CycloneDX, metadata dos scanners e, para DocuSeal, APK, manifesto
   dos pacotes nativos, Grype bruto, OpenVEX ligado ao digest e Grype filtrado
   das imagens efetivamente construídas.
4. Validar os diretórios fechados de evidência e as imagens por ID imutável no
   preflight obrigatório do wrapper Compose.
5. Instalar a mesma credencial SSO distinta nos dois lados, sem expô-la.
6. Cadastrar o UUID exato do account e, se necessário, o UUID bootstrap.
7. Ensaiar backup/restore e rollback em clone isolado.
8. Ativar primeiro em canário privado e executar E2E navegador completo.

Até todos os gates produzirem evidência, `MAIOCCHI_SSO_ENABLED` permanece
`false`; este ADR não afirma execução em produção.
