# Conformidade da release

Este diretório conserva os artefatos verificáveis da cadeia de suprimentos do
portal. O manifesto `SHA256SUMS` cobre a release DocuSeal, o patch institucional,
os SBOMs CycloneDX, os relatórios brutos do Grype, a declaração OpenVEX e os
scripts/configurações críticos de backup, retenção e mTLS.

## Estrutura

- `sbom/`: inventário CycloneDX JSON gerado pelo Syft para cada imagem.
- `vulnerability/`: resultado bruto e não suprimido do Grype.
- `vex/`: avaliação de alcançabilidade em OpenVEX; não altera o relatório bruto.
- `research/`: evidência reduzida de APIs oficiais usada em decisões de arquitetura.
- `sources/`: fontes upstream vendorizadas, com hashes independentes da receita.
- `config/`: configurações fail-closed, versionadas e hashadas dos scanners
  candidatos Syft e Grype.
- `releases/`: manifestos imutáveis das releases históricas.
- `docuseal-*.tar.gz`: código-fonte correspondente do fork DocuSeal.
- `SHA256SUMS`: integridade dos artefatos da release corrente.
- `releases/docuseal-sso-v3.0.1-maiocchi.15-candidate.SHA256SUMS`: cadeia
  source-plus-patch do candidato SSO; não equivale a uma imagem aprovada.
- `releases/docuseal-sso-v3.0.1-maiocchi.15-candidate.contract.json`: contrato
  semântico da cadeia de três patches DocuSeal, bibliotecas nativas, VEX e evidências.
- `releases/portal-v1.15.1-sso-candidate.contract.json`: contrato fail-closed
  para build isolado, SBOM, scan e promoção do portal estático candidato.

## Verificação

Execute a partir da raiz do repositório:

```bash
shasum -a 256 -c compliance/SHA256SUMS
shasum -a 256 -c compliance/releases/docuseal-sso-v3.0.1-maiocchi.15-candidate.SHA256SUMS
shasum -a 256 -c compliance/releases/portal-v1.15.1-sso-candidate.SHA256SUMS
vexctl merge compliance/vex/*.openvex.json >/dev/null
```

As versões e commits autodeclarados pelas ferramentas, o SHA-256 dos binários
Linux/AMD64, os URLs e checksums publicados dos assets oficiais GitHub, a
configuração efetiva e o hash do banco Grype ficam registrados na metadata de
cada candidato e no manifesto do mesmo diretório de evidência. Os builders
resolvem cada scanner uma única vez para caminho absoluto, recusam link
simbólico e conferem o hash antes e depois dos scans; as execuções usam ambiente
mínimo e recebem o image ID imutável, nunca apenas uma tag. Essa cadeia HTTPS e
checksum é evidência rastreável do asset publicado, não uma alegação de
attestation criptográfica do publisher. O template OpenVEX do candidato só pode
ser materializado com o digest
da imagem construída e um novo `urn:uuid`; a versão 1 nunca é reutilizada com
conteúdo alterado. O relatório Grype bruto é preservado; o relatório
filtrado aceita exclusivamente os pares TIFF declarados no contrato. Uma
declaração VEX não substitui atualização de dependência quando existir correção
compatível e alcançável. O preflight valida semanticamente archive, inspect,
SBOM, Grype, metadata e manifesto de pacotes nativos antes de permitir o canário.
Para o Portal, o preflight também reaplica diretamente ao JSON bruto ligado à
imagem a allowlist fechada de severidades `Unknown`, `Negligible`, `Low` e
`Medium`, independentemente do exit code do builder; valor ausente ou não
canônico também falha fechado.
O hash do arquivo local do banco Grype é uma medição before/after do builder; a
proveniência offline reproduzível permanece o URL `from` com checksum. O banco
SQLite completo não integra automaticamente o conjunto de evidências.
