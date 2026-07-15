# Baseline do fluxo direto de autenticação v1.14.6

Data: 15/07/2026

## Objetivo

Esta baseline fixa o acesso profissional sem etapa manual posterior ao login.
Uma autenticação aceita conduz diretamente ao dashboard; não existe botão
"Acessar ambiente seguro" ou "Abrir ambiente de gestão".

## Fluxo mínimo

### Senha e sessão existente

1. A home obtém o formulário DocuSeal e o token CSRF na mesma origem.
2. O navegador envia credenciais e, quando habilitado, o código TOTP.
3. O DocuSeal autentica e responde com destino `/dashboard`.
4. O portal substitui a entrada atual do histórico por `/dashboard`.

- [V] Uma sessão já autenticada segue imediatamente para `/dashboard`.
- [V] Senha inválida e TOTP pendente permanecem fechados na tela de acesso.
- [V] O teste real em produção criou uma conta efêmera, recebeu `303` para
  `/dashboard`, abriu o dashboard com `200` e removeu a conta ao terminar.

### Certificado digital

1. O host principal emite um desafio de uso único por POST autenticado com
   CSRF.
2. O navegador envia o desafio por POST ao host mTLS dedicado.
3. O host dedicado exige e valida o certificado cliente.
4. O callback de uso único retorna por POST automático ao host principal.
5. O DocuSeal consome o desafio, cria a sessão e redireciona para `/dashboard`.

- [V] Os dois handoffs usam formulário POST automático pelo elemento
  `submit-form`; o botão manual existe somente em `noscript`.
- [V] Estado e callback não são colocados em query string, histórico,
  `Referer` ou logs de acesso.
- [V] O documento de handoff não exige clique. Ele é o limite mínimo entre os
  hosts: um redirect HTTP não consegue trocar o corpo POST pelo callback sem
  expô-lo em URL.
- [V] A conexão sem certificado é recusada durante o handshake TLS.
- [A] Seleção do certificado e PIN do A3 continuam sendo atos humanos exigidos
  pelo dispositivo; não podem ser automatizados nem capturados pelo portal.

## Implementação versionada

| Componente | Versão | Revisão |
|---|---|---|
| Portal | `1.14.6` | `77e8fa36ab10b4570ba5cf6cb4c007970d895db9` |
| DocuSeal Maiocchi | `3.0.1-maiocchi.12` | `e0b548782b2bc600e9152f8a31f8911481bdeba0` |

- [V] O portal removeu o estado visual pós-login e usa
  `window.location.replace("/dashboard")` imediatamente após sucesso.
- [V] O DocuSeal define `/dashboard` como destino padrão de senha e
  certificado.
- [V] O patch reproduzível está em
  `patches/docuseal/0006-direct-authentication-flow.patch`.
- [V] O arquivo-fonte correspondente é
  `compliance/docuseal-maiocchi-3.0.1-maiocchi.12.tar.gz`, SHA-256
  `7e5ed20f6dfa29da021303fa4627acc155769db8a2ba64fd54f2ac1a799863e7`.

## Testes

- [V] Workspace web: build estático de 13 rotas e 98 testes, com 91
  aprovados, sete skips condicionais e zero falha; ESLint aprovado.
- [V] DocuSeal com Ruby 4.0.5 e PostgreSQL real: dez exemplos, zero falha.
- [V] RuboCop analisou os quatro arquivos Ruby alterados sem ofensa.
- [V] Os testes cobrem senha, sessão existente, certificado, host incorreto,
  revogação, expiração, uso único, vínculo inicial e destino final.

## Produção

| Serviço | Imagem | ID |
|---|---|---|
| Portal | `maiocchi/assinatura-portal:1.14.6` | `sha256:8192b67d87e5529842d3a7ff1010a442d045729693d8b2e01250f4e67b40d52c` |
| DocuSeal | `maiocchi/docuseal:3.0.1-maiocchi.12` | `sha256:008a0144d90d93924c16057c62d6690bf22be3e6a1a0a5c6c63b513a16b7e63f` |
| PKI bridge | `maiocchi/pki-bridge:1.3.21` | `sha256:1558a8d1847145862e43d1c17bb636f241852876afbdac438689c834691bcb5b` |
| PAdES provider | `maiocchi/pades-provider:1.2.5` | `sha256:f86ecd7671154decaec935c0281aae7ce883aeda9645cad6b1964d93803444aa` |

- [V] Os quatro containers estão saudáveis e sem `error`, `fatal`,
  `exception`, `panic`, `uncaught` ou resposta `5xx` no intervalo final.
- [V] `/`, `/healthz`, `/ajuda/` e `/validar/` respondem `200`.
- [V] `/dashboard` e `/sign_in`, sem sessão, respondem `302` para
  `/#advogados`.
- [V] A home publicada contém "Área dos advogados, sem página intermediária"
  e não contém os dois comandos removidos.

## Cadeia de suprimentos

- [V] Syft `1.46.0` gerou SBOM CycloneDX das imagens amd64 exatas do portal e
  do DocuSeal implantadas na VPS.
- [V] Grype `0.115.0` encontrou as mesmas 14 correspondências da release
  anterior: três no portal e onze no DocuSeal, sem CVE novo.
- [V] Consideradas também as imagens inalteradas do bridge e do provider, os
  relatórios formam 13 pares produto/CVE distintos.
- [V] `compliance/vex/release-1.14.6.openvex.json` contém exatamente os 13
  pares: zero ausência e zero excedente; `vexctl 0.4.4` o analisou sem erro.
- [V] `compliance/SHA256SUMS` e
  `compliance/releases/portal-v1.14.6.SHA256SUMS` verificam todos os artefatos
  desta release.

## Estado

[V] O login confirmado abre automaticamente o ambiente profissional, as rotas
intermediárias dispensáveis foram removidas e a única transição entre hosts é
automática, de uso único e preserva o sigilo do callback.
