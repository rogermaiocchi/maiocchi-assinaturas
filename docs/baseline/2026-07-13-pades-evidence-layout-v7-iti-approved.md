# Baseline homologada da folha de evidencias v7 - 2026-07-13

- Status: canonico
- Ambiente: producao, `assinatura.maiocchi.adv.br`
- Portal: `maiocchi/assinatura-portal:1.11.2`
- Bridge: `maiocchi/pki-bridge:1.3.8`
- Provider: `maiocchi/pades-provider:1.2.3`
- Codigo implantado: `9249e777fad8f0ff55d20b7095c4350ecdd7e105`
- Backup anterior ao deploy: `20260714T014118Z`
- Validador externo: VALIDAR ITI

Esta baseline fixa a composicao visual v7 da folha de evidencias e do cabecalho
das paginas de conteudo. O ensaio usou um PDF de 12 paginas, preparado em
producao, assinado novamente com certificado ICP-Brasil A3 em token externo e
submetido ao VALIDAR ITI. O PDF final tem 13 paginas.

## Contrato visual homologado

- Todas as paginas recebem a linha dourada superior.
- As 12 paginas de conteudo recebem um cabecalho centralizado com a marca `m.`,
  codigo, numero documental, SHA-256 do arquivo de entrada e atestado ML-DSA-65.
- A folha final nao repete esse cabecalho nem apresenta numeracao de pagina.
- O titulo `EVIDENCIAS DA ASSINATURA DIGITAL` fica a esquerda e a modalidade
  comprovada fica no lado oposto.
- O quadro `VALIDAR O ORIGINAL` mostra
  `assinatura.maiocchi.adv.br/validar` e, quando elegivel,
  `validar.iti.gov.br`, sem repetir o identificador publico.
- O QR nao recebe o rotulo isolado `VALIDAR`.
- O Code 128 codifica `MAI|{publicId}|R1`, mas o payload nao e impresso.
- Para ICP-Brasil, o selo usa a marca oficial e a base fisica exata
  `MP 2.200-2/2001, art. 10, § 1º · L 14.063/2020, art. 4º, III.`.
- O texto `Assinatura eletronica qualificada`, o rotulo
  `Validacao externa` e a linha `Pagina X de Y` permanecem ausentes.
- Assinaturas nao ICP-Brasil usam a marca PAdES; somente modalidades
  reconhecidas pelo VALIDAR recebem o endereco oficial do ITI.

## Ensaio real A3

O relatorio oficial emitido em 13/07/2026 as 22:53:54 BRT registrou:

| Controle | Resultado |
|---|---|
| Resultado resumido | `Assinatura aprovada.` |
| Status da assinatura | `Aprovado` |
| Caminho de certificacao | `Valid` |
| Estrutura | `Em conformidade com o padrao` |
| Cifra assimetrica | `Aprovada` |
| Resumo criptografico | `true` |
| Politica | `PA_PAdES_AD_RB_v1_3.der` |
| Atributos obrigatorios | `Aprovados` |
| Atributo opcional `IdAaEtsSignerAttr` | `Valid` |
| Mensagem de erro ou alerta | `Nenhuma mensagem de alerta` |

O relatorio registrou uma assinatura ancorada, LPA `PAdES v2` valida e cadeia
completa ate a Autoridade Certificadora Raiz Brasileira v5. Os atributos
`IdMessageDigest`, `IdContentType`, `IdAaEtsSigPolicyId`,
`IdAaSigningCertificateV2` e `SignatureDictionary` foram individualmente
classificados como `Valid`.

## Artefatos rastreaveis

| Artefato | Identificador ou SHA-256 |
|---|---|
| Documento publico | `MAI-2026-N6TZ-YCJ4-FFH0-Y5DG` |
| Numero do documento | `20260714015027128612677818923` |
| PDF recebido, 12 paginas | `0b5fd83d7eaeb0b983bb4a32b0e16a4dd4c139a0053036643283c0cb19e01282` |
| PDF PAdES final, 13 paginas | `8870db2d0846a3fe8f8ab3b18ea1b93cfd3d862f03d5189971effbae6c5f3336` |
| Relatorio PDF do VALIDAR ITI | `3411cb96ace908e6937522838d7641252e872415ec46a370e65e0e5ed6ff0455` |
| Captura do resultado resumido | `0ccfb81c41b3d856c251c48622b20749cf6dfad98358024703aeb7f4ac675469` |
| Captura do relatorio completo | `92135e1d8dbc686ba81ee146e094aa07b587e340dbd0f811ea2ea3d71b1f6777` |
| Registro publico capturado | `307914637b4d72f769b65bd246cffc7f499c372d5b1994e9bf13818d90f126f9` |
| Render da primeira pagina | `6c58beef286e86411ce831276642d7375c0f560efbd035bcb80ad643cb648d25` |
| Render da folha de evidencias | `7f8c7ec8f83403bc22494b70e3aec95b1b36c99f75458fcc95a1495122290068` |

As evidencias privadas permanecem em
`~/.claude/audit/runs/2026-07-13-evidence-layout-v7/` e nao integram o
repositorio. O registro publico retornou `active`, `proofVerified: true`, o
mesmo hash final, perfil `AD-RB`, `docMdp: valid` e OID
`2.16.76.1.7.1.11.1.3`.

## Imagens imutaveis implantadas

| Servico | Imagem | ID validado |
|---|---|---|
| Portal | `maiocchi/assinatura-portal:1.11.2` | `sha256:b1687aa406c6081a511050666b5c440df483d53f95bd7b30cb692bd5cfe9d72d` |
| Bridge | `maiocchi/pki-bridge:1.3.8` | `sha256:028d4a2601ae6fd3e95475c86a3a523b64e75abba5599e4a186ce20220337bec` |
| Provider | `maiocchi/pades-provider:1.2.3` | `sha256:8bd9918d0442de1e510a3c179a34816d1059d28094f31c6a096cb3f47d50ca51` |

Os tres containers estavam saudaveis durante o ensaio. A rota publica de
verificacao confirmou a prova ML-DSA-65 e o hash final do documento.

## Verificacao de regressao

A suite terminou com 63 testes: 60 aprovados, nenhum reprovado e tres skips
esperados. `lint`, build Next.js, build do laboratorio visual, testes Maven do
provider e `git diff --check` passaram. As variantes ICP-Brasil, GOV.BR e
simples foram renderizadas separadamente para confirmar marca e elegibilidade
do endereco ITI.

Esta baseline substitui a
[baseline dos enderecos](2026-07-13-validator-address-iti-approved.md) quanto
ao layout, ao bridge, ao codigo implantado e ao ensaio externo. As baselines
anteriores permanecem como historico imutavel.

## Fontes

- [VALIDAR ITI](https://validar.iti.gov.br/)
- [Servico oficial VALIDAR](https://www.gov.br/pt-br/servicos/validar-servico-de-validacao-de-assinaturas-eletronicas)
- [DOC-ICP-15.03 v9.1](https://repositorio.iti.gov.br/instrucoes-normativas/IN2021_03_DOC-ICP-15.03.htm)
