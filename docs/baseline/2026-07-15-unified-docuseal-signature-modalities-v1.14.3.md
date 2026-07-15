# Baseline unificada do portal e das modalidades de assinatura

Data: 15/07/2026

## Escopo

Esta baseline congela a integração visual e operacional do portal público,
DocuSeal, e-mails, relatório de auditoria e três modalidades de assinatura sob
o padrão Maiocchi Advogado. A release pública é `portal-v1.14.3`; o fork
DocuSeal correspondente é `3.0.1-maiocchi.9`.

## Imagens publicadas

| Serviço | Versão | Digest da imagem | Revisão OCI |
|---|---|---|---|
| Portal | `1.14.3` | `sha256:35f485bccf429ecf0795f5bc017c023bab48e6644794086dea5262ae949190a3` | `portal-v1.14.3` |
| DocuSeal | `3.0.1-maiocchi.9` | `sha256:0c4b759489aad5a8000bbbfffd15739e1896ffe706c83705e3008cc0cfccd31b` | `d8c997c31c704eed3847811f981d54d9b7e5c3a4` |
| PKI bridge | `1.3.19` | `sha256:6a5a9cc909a2cda5bb46acaade6ecba137f04dc0c3f6876a752d7b31119a6bb5` | `f16ddb2705ef` |
| PAdES provider | `1.2.5` | `sha256:f86ecd7671154decaec935c0281aae7ce883aeda9645cad6b1964d93803444aa` | `72531a0b196ce52dd74e0be0f5918a53adc30a8d` |

Os quatro containers estavam `healthy` depois da promoção. O DocuSeal anterior
foi preservado como `3.0.1-maiocchi.9-pre-d8c997c`; os backups de referência são
`20260715T003557Z`, `assinatura-config-20260715T005940Z` e
`docuseal-compose-before-d8c997c.yml`.

## Padrão visual uno

- [V] Layout, navegação, autenticação, páginas internas, páginas públicas,
  estados vazios e erros do DocuSeal usam a identidade Maiocchi Advogado.
- [V] O painel concentra as três modalidades sem expor páginas redundantes.
- [V] O portal responde sem overflow em `390x844` e `1440x1000`; a área dos
  advogados mantém as abas Certificado e Senha no mesmo fluxo visual.
- [V] `/dashboard` e `/sign_in` reconduzem a `/#advogados`; o domínio legado
  reconduz permanentemente ao domínio canônico.
- [V] Não há link público para código-fonte na interface ou nos e-mails.

## Modalidades

| Modalidade | Prova principal | Base apresentada | Evidência integrada |
|---|---|---|---|
| Simples rastreável | manifestação eletrônica e trilha auditável | MP 2.200-2/2001, art. 10, § 2º; Lei 14.063/2020, art. 4º, I | identidade, IP, data/hora, hash, QR, código e eventos |
| Avançada | OTP entregue por e-mail e vínculo ao signatário | Lei 14.063/2020, art. 4º, II | confirmação OTP, identidade, IP, data/hora, hash, QR, código e eventos |
| Qualificada | PAdES com certificado ICP-Brasil no provider privado | MP 2.200-2/2001, art. 10, § 1º; Lei 14.063/2020, art. 4º, III | cadeia do certificado, atributos PAdES, sinais ICP-Brasil, hash, QR e validação |

As três configurações são persistidas por conta e aparecem no painel. O modo
qualificado permanece fail-closed: somente o retorno criptográfico validado do
provider permite a marca ICP-Brasil. O ensaio físico A3 anterior continua
registrado em `docs/audit/2026-07-14-certificate-login-v1.14.2.md`; esta
promoção preservou o protocolo e não repetiu a cerimônia com PIN.

## Documento e auditoria

- [V] A última página segue o padrão canônico "Evidências da assinatura
  digital", com QR, hash, código de barras, código verificável, metadados,
  atestado ML-DSA-65 separado e sinais condicionais por modalidade.
- [V] As páginas anteriores recebem a linha superior de 3 pt e a inscrição
  lateral canônica; a página final não duplica essa inscrição.
- [V] Novos relatórios de auditoria são emitidos com `Creator` Maiocchi.
  Assinatura, `Author` Maiocchi Advogado e título institucional.
- [V] O relatório existente não foi reescrito: evidência histórica permanece
  imutável. A geração real de um novo relatório assinado foi coberta pelo RSpec.

## E-mail

- [V] Remetente e endereço institucional: `roger@maiocchi.adv.br`.
- [V] Cabeçalho com linha amarela de 3 pt, mini-logo `m.`, saudação
  "Prezado(a)", fechamento "Respeitosamente," e assinatura
  "Advogado Roger Maiocchi".
- [V] Aviso automático de não resposta integra todos os modelos.
- [V] SMTP iCloud e remetente canônico permanecem configurados em produção.

## Verificação executada

- [V] Workspace web: 66 testes, 63 aprovados, zero falhas e três integrações
  opcionais ignoradas no runtime local.
- [V] Next.js: build estático aprovado para 13 rotas; ESLint aprovado.
- [V] Fork DocuSeal: 24 exemplos RSpec, zero falhas.
- [V] RuboCop: 29 arquivos Ruby alterados, zero ofensas.
- [V] `git diff --check`: aprovado no portal e no fork.
- [V] Produção: `/` `200`, `/validar/` `200`, `/up` `200`, `/dashboard`
  `302` e `/sign_in` `302` para o fluxo uno.
- [V] CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, política de permissões e
  política de referência presentes na resposta pública.
- [V] Nenhum fatal, panic, uncaught, unhandled, exception ou error foi
  encontrado no log DocuSeal nos 30 minutos posteriores à promoção.

## Cadeia de suprimentos

- [V] Código-fonte exato do fork arquivado em
  `compliance/docuseal-maiocchi-3.0.1-maiocchi.9.tar.gz`, SHA-256
  `cb47ff6ecd46df2640d73c98a618024009c4119a6276c239d37cc519cf43d12b`.
- [V] SBOM CycloneDX foi gerado das imagens reais do DocuSeal, portal, PKI
  bridge e PAdES provider.
- [V] O Grype bruto permanece preservado: DocuSeal 2 High, 8 Medium e 1 Low;
  portal 3 Medium; PKI bridge 3 Medium; nenhuma ocorrência possui correção
  indicada pelo scanner.
- [V] Todas as 17 correspondências brutas foram avaliadas em
  `compliance/vex/release-1.14.3.openvex.json`. O resultado é zero achado
  explorável no caminho de produção: versões não afetadas, componente ausente
  ou código sem entrada controlável pelo adversário.
- [V] A declaração foi analisada e mesclada sem erro pelo `vexctl 0.4.4`
  oficial para macOS arm64, após conferência do SHA-256 da release.
- [V] A mitigação TIFF é dupla: detecção MIME pelos bytes com rejeição antes do
  libvips e `VIPS_BLOCK_UNTRUSTED=1`. Existe regressão automatizada para TIFF
  disfarçado de JPEG.

O VEX não suprime o relatório bruto e deverá ser revisto quando o Alpine
publicar libtiff posterior a `4.7.1-r0` ou quando qualquer caminho de entrada
aceito for ampliado.

## Conclusão

[V] A release integra em produção o padrão visual Maiocchi, painel unificado,
três modalidades, e-mails e auditoria documental. Não há pendência de código,
configuração ou publicação conhecida nesta baseline. A validade de cada
assinatura continua sendo determinada pelos fatos criptográficos e pela
modalidade efetivamente concluída, nunca pela aparência visual isolada.
