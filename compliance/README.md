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
- `releases/`: manifestos imutáveis das releases históricas.
- `docuseal-*.tar.gz`: código-fonte correspondente do fork DocuSeal.
- `SHA256SUMS`: integridade dos artefatos da release corrente.
- `releases/docuseal-sso-v3.0.1-maiocchi.15-candidate.SHA256SUMS`: cadeia
  source-plus-patch do candidato SSO; não equivale a uma imagem aprovada.
- `releases/portal-v1.15.1-sso-candidate.contract.json`: contrato fail-closed
  para build isolado, SBOM, scan e promoção do portal estático candidato.

## Verificação

Execute a partir da raiz do repositório:

```bash
shasum -a 256 -c compliance/SHA256SUMS
vexctl merge compliance/vex/*.openvex.json >/dev/null
```

Os resultados e as versões das ferramentas estão registrados na baseline da
release. Uma declaração VEX não substitui atualização de dependência quando
existir correção compatível e alcançável.
