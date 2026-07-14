# Baseline de autenticação por certificado digital

Data: 14/07/2026

## Escopo

Esta baseline registra a correção durável do fluxo de autenticação mTLS da
release `portal-v1.14.1`. A implantação e o ensaio físico com certificado A3
são etapas posteriores: nenhum resultado de produção é inferido deste
documento.

## Causa raiz comprovada

- [V] O cabeçalho observado nos logs do proxy continha uma cadeia de
  certificados em Base64 bruto, separada por vírgulas e com caracteres `+`.
- [V] O caminho anterior aplicava decodificação de formulário ao valor; nesse
  formato, `+` pode ser convertido em espaço e tornar o DER inválido.
- [V] A falha resultante era
  `OpenSSL::X509::CertificateError (nested asn1 error)` antes da criação da
  sessão de autenticação.
- [V] Depois do reparo transitório no container, os endpoints `present` e
  `complete` responderam, respectivamente, `200` e `302`. Isso confirmou a
  causa, mas não substituiu a correção versionada.

## Correção durável

O parser institucional em
`app/models/certificate_auth/client_certificate.rb` agora:

1. preserva `+` durante a decodificação percentual;
2. aceita PEM literal ou percent-encoded;
3. extrai somente o primeiro certificado da cadeia;
4. aceita Base64 DER bruto enviado pelo Traefik;
5. recupera espaços convertidos indevidamente em `+` apenas no fallback
   compatível; e
6. rejeita de forma fail-closed Base64 ou X.509 malformado.

O frontend só reconhece o login como concluído quando a resposta foi realmente
redirecionada, é bem-sucedida e o destino normalizado é `/` ou `/dashboard`:

```typescript
response.redirected &&
  response.ok &&
  (destination === "/" || destination === "/dashboard")
```

O requisito `response.redirected` impede que uma resposta `200` intermediária
ou uma expressão com precedência incorreta seja aceita como sessão autenticada.

## Evidência automatizada

- [V] DocuSeal completo: 259 exemplos, zero falhas e zero ignorados.
- [V] Parser mTLS direcionado: PEM, PEM escapado, Base64 bruto, cadeia
  Traefik, recuperação de espaços e rejeição malformada cobertos.
- [V] Portal: 12 testes, zero falhas e zero ignorados; build estático de 13
  rotas e ESLint aprovados.
- [V] PKI bridge na imagem Node 24: 52 testes, zero falhas e zero ignorados.
- [V] PAdES provider em Maven/JDK 21: 12 testes, zero falhas e zero ignorados.
- [V] Agente local Swift: 9 testes, zero falhas.
- [V] Auditorias npm de produção do portal e PKI bridge: zero vulnerabilidades.

## Imagens locais produzidas

| Componente | Versão | ID da imagem | Usuário |
|---|---|---|---|
| Portal | `1.14.1` | `sha256:fdc6938d185f...` | `101` |
| PKI bridge | `1.3.17` | `sha256:811957378f2e...` | `node` |
| DocuSeal | `3.0.1-maiocchi.6` | `sha256:56cf5f2b6e42...` | `docuseal` |
| PAdES provider | `1.2.5` | `sha256:29de4f45cf8f...` | `10001:10001` |

Os IDs completos e a revisão OCI `72531a0b196ce52dd74e0be0f5918a53adc30a8d`
permanecem nos SBOMs e podem ser conferidos com `docker image inspect`.

## Cadeia de suprimentos

- [V] Syft `1.46.0` gerou SBOM CycloneDX para as quatro imagens.
- [V] Grype, com base `v6.1.7` de 14/07/2026, não encontrou vulnerabilidade
  Critical nem vulnerabilidade com correção disponível.
- [V] Os dois achados High do DocuSeal são correspondências CPE de TIFF sem
  correção da distribuição. O caminho vulnerável não é alcançável pela
  allowlist de MIME baseada nos bytes; a decisão está separada em OpenVEX.
- [V] O manifesto `compliance/SHA256SUMS` valida a distribuição-fonte, o patch
  incremental, os quatro SBOMs, os quatro relatórios Grype e o OpenVEX.

## Critério de promoção

A release só pode ser declarada operacional após: tag assinada, construção
x86_64 na VPS a partir da revisão publicada, implantação atômica, verificação
dos controles de runtime, teste do e-mail real e conclusão visual da sessão
com o token A3 físico. Até lá, o estado de produção permanece pendente.
