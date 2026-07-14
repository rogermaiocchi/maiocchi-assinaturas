# Baseline do portal translucido e acesso profissional - 2026-07-14

- Status: implantado; prova fisica do login A3 em fechamento
- Ambiente oficial: `https://assinatura.maiocchi.adv.br`
- Portal: `maiocchi/assinatura-portal:1.13.0`
- Codigo implantado: `09e78e72b3b0079fd7294b96ba7c5a0b447e66e4`
- Imagem implantada: `sha256:4183d2e81c4b56c51ae84f600031d695db32107deaf8cb5c4bbde271efb5ec18`
- Backup anterior ao release: `20260714T150823Z`
- Espelho privado Sites: versao 5

Esta baseline registra o redesenho integral do portal publico e o contrato de
acesso profissional por senha ou certificado digital. O dominio oficial
continua sendo a unica entrada publica. O espelho Sites permanece privado e
nao substitui DNS, DocuSeal, PKI bridge, provider ou bancos da VPS.

## Contrato visual

- `[V]` O hero usa a fotografia institucional de 6144 x 10920 pixels,
  convertida para WebP de 2400 x 4266, em composicao full-bleed com fusao
  inferior e header translucido.
- `[V]` A area profissional usa a fotografia horizontal fornecida pelo
  operador, em 2752 x 1536, com a figura central entre introducao e
  autenticacao translucidas.
- `[V]` A validacao usa a fachada de vidro em 2000 x 1345 e o fluxo usa a
  imagem de linhas douradas em 2000 x 1333.
- `[V]` O acesso profissional apresenta controle segmentado `Certificado` e
  `Senha`; certificado e o metodo inicial e o primeiro vinculo remete para a
  senha sem abrir pagina publica intermediaria.
- `[V]` O sistema respeita `prefers-reduced-motion`, contraste forcado, foco
  visivel e alvos de toque. A composicao foi conferida em 1440 x 1000,
  820 x 1180, 390 x 844 e 320 x 700.
- `[V]` Em 1440, 820 e 390 pixels, `scrollWidth` foi igual a `innerWidth`;
  imagens carregaram com dimensao natural e nao houve erro de console.

## Publicacao e HTTP

| Controle | Evidencia |
|---|---|
| Container | `healthy` com tag `1.13.0` |
| Home, ajuda, privacidade, validacao e ICP | HTTP `200` |
| Quatro WebPs do novo tema | HTTP `200`, `image/webp` |
| Healthcheck | HTTP `200` |
| HSTS | `max-age=31536000; includeSubDomains` |
| CSP de formularios | `self` e somente o host mTLS de certificado |
| Frame externo | somente `https://validar.iti.gov.br` |
| Build Next | 14 rotas estaticas, sem erro |
| Testes | 64 totais, 61 aprovados, 3 skips condicionais, 0 falha |
| Lint e diff | aprovados |

O relay do certificado respondeu `200`, metodo `POST`, destino exato
`https://certificado.assinatura.maiocchi.adv.br/certificate_auth/login/present`
e encaminhou apenas o campo oculto `state`. O navegador nao pode escolher
origem, caminho ou campos arbitrarios.

## Acesso por senha

`[V]` Uma conta efemera, isolada na conta existente, autenticou por
`/portal-auth/session`, recebeu `303` para a origem oficial e abriu
`/dashboard` com HTTP `200`. O `trap` de limpeza removeu a conta no mesmo
ensaio; a conferencia posterior registrou uma conta total e zero contas de
teste. Nenhuma credencial real foi lida, alterada ou registrada.

## Identidade ICP-Brasil

O bootstrap administrativo usa o proprio certificado publico incorporado ao
PAdES aprovado pelo VALIDAR ITI. O PDF
`Relatorio-Inteligencia-Juridica-assinado (9).pdf` possui SHA-256
`8870db2d0846a3fe8f8ab3b18ea1b93cfd3d862f03d5189971effbae6c5f3336`,
identico ao relatorio oficial emitido em 13/07/2026 as 22:53:54 BRT.

O relatorio registrou assinatura `Aprovado`, caminho `Valid`, estrutura em
conformidade, resumo criptografico `true`, politica
`PA_PAdES_AD_RB_v1_3.der`, atributos obrigatorios aprovados e
`IdAaEtsSignerAttr` valido. O certificado A3 tem fingerprint SHA-256
`eddf5b808eda6186925b3bcbb4e303a6b0c3cb8f3e6801864c454c49675fdb92`
e validade ate 17/02/2028.

`[V]` A fingerprint foi vinculada a unica conta ativa por
`CertificateAuth::ClientCertificate`, que calculou resumo, emissor, serial e
periodo com a mesma implementacao usada pelo fluxo mTLS. O registro ficou
`active` e `valid_now: true`. O vinculo nao autentica por si: o login continua
dependendo da apresentacao do mesmo certificado e da prova de posse da chave
privada pelo token.

`[A]` No fechamento inicial desta baseline, o desafio de login havia sido
criado, mas a apresentacao do certificado permanecia no seletor nativo do
macOS. O estado final deve substituir este marcador por evidencia de desafio
verificado, consumido e sessao aberta no dashboard.

## Regressao

1. Preservar o dominio oficial, o relay POST e a allowlist exata do host mTLS.
2. Nunca mapear certificado por nome, CPF, e-mail ou header nao validado.
3. Novo certificado exige fluxo autenticado de enrollment ou bootstrap
   administrativo com PAdES e relatorio oficial coincidentes por SHA-256.
4. Toda revisao visual repete build, testes, viewports, headers, rotas e prova
   de senha; mudanca de autenticacao repete tambem mTLS com token real.
5. Nao registrar senha, PIN, token, chave privada, cookie ou codigo de desafio.
