# Baseline canônico PAdES por modalidade aprovado pelo ITI - 2026-07-13

- Status: canônico
- Ambiente: produção, `assinatura.maiocchi.adv.br`
- Portal: `maiocchi/assinatura-portal:1.11.1`
- Bridge: `maiocchi/pki-bridge:1.3.6`
- Provider: `maiocchi/pades-provider:1.2.3`
- Código homologado do renderer/provider: `b42bf163d5fe6a830970c64597fd7e2d0da7e8fd`
- Agente local atual: `1.2.1`, código `ac14b4f027026622d1b0f17154ba340eeee050a6`
- Validador externo: VALIDAR ITI

Esta baseline promove a composição condicional por modalidade. A assinatura
qualificada usa a marca ICP-Brasil e o link externo do ITI. Assinaturas
eletrônicas simples ou avançadas usam a marca tipográfica PAdES no mesmo espaço
e não recebem marca, OID, link ou alegação ICP-Brasil.

## Resultado oficial

O PDF real de 12 páginas foi preparado em produção, assinado novamente pelo
token ICP-Brasil A3 conectado ao MacBook e submetido ao VALIDAR ITI. O relatório
emitido em 13/07/2026 às 20:56:25 BRT registrou:

| Controle | Resultado |
|---|---|
| Resultado resumido | `Assinatura aprovada.` |
| Status da assinatura | `Aprovado` |
| Caminho de certificação | `Valid` |
| Estrutura | `Em conformidade com o padrão` |
| Cifra assimétrica | `Aprovada` |
| Resumo criptográfico | `true` |
| Política | `PA_PAdES_AD_RB_v1_3.der` |
| Atributos obrigatórios | `Aprovados` |
| Atributo opcional `IdAaEtsSignerAttr` | `Valid` |
| Mensagem de erro ou alerta | `Nenhuma mensagem de alerta` |

O relatório também classificou `IdMessageDigest`, `IdContentType`,
`IdAaEtsSigPolicyId`, `IdAaSigningCertificateV2` e `SignatureDictionary` como
`Valid`. Foram identificadas uma assinatura e uma assinatura ancorada, com
fonte de verificação `Offline`, Verificador de Conformidade `2.21.1.2` e
Validador de Documentos `6aec769-dirty`.

## Artefatos rastreáveis

| Artefato | Identificador ou SHA-256 |
|---|---|
| Documento público | `MAI-2026-YKX8-Q37B-9NM3-SJSM` |
| Número do documento | `20260713234841254290660636834` |
| PDF recebido, 12 páginas | `0b5fd83d7eaeb0b983bb4a32b0e16a4dd4c139a0053036643283c0cb19e01282` |
| PDF PAdES final, 13 páginas | `9d856181c2ebd7993de1bcc2aa1c96e6af455bbc599bc66ee807a624418296c4` |
| Relatório interno do provider | `658502f8b48b05ebf5193211b1ead8040202a34cecccd4a9bdaf78210d2671a7` |
| Atestado final ML-DSA-65 | `4a1e40e39ede06f601546878457e1df482311af09e4e0e88348decb26570b0f4` |
| Relatório PDF do VALIDAR ITI | `c7f6a1a06df78d799f1dc8965cc99b4227a7aed5f98830398c754baa9f043752` |
| CMS PAdES extraído | `2a8c390616a693e9e70408bab0d415dcad7da5e428e82126e97ae5e64c4810e7` |
| Registro público capturado | `490ea4cd58d3ac47e5f0dffa6920e240b85ff6dc00446d586199fcc9af34ecab` |
| Render da primeira página | `50e34f4e541a866077343e7d8f0ca0de3b5bf7dfbffafd11fab84f2e037322c9` |
| Render da folha de evidências | `1ffe843fe35cf4655982999bcfb152de38f49e9cbdc9c7c2bdda0da6ba1897be` |

As evidências privadas ficam em
`~/.claude/audit/runs/2026-07-13-pades-layout-v6-iti-approved/` e não integram o
repositório. O verificador público retornou `active`, `proofVerified: true`,
13 páginas, o mesmo hash final, `docMdp: valid`, perfil `AD-RB` e OID
`2.16.76.1.7.1.11.1.3`.

O `ByteRange` cobre todo o arquivo de 2.689.190 bytes, exceto o espaço reservado
ao CMS. O `pdfsig` retornou `Signature is Valid` e `Total document signed`; a
verificação destacada pelo OpenSSL retornou `CMS Verification successful`.

## Contrato visual por modalidade

| Estado validado | Cabeçalho direito | Marca do selo | Link externo ITI |
|---|---|---|---|
| ICP-Brasil | `MODALIDADE · ICP-BRASIL` | ICP-Brasil | presente |
| Simples ou avançada | `MODALIDADE · ASSINATURA ELETRÔNICA` | PAdES | ausente |

Nos dois estados, `EVIDÊNCIAS DA ASSINATURA DIGITAL` permanece à esquerda na
mesma linha. A decisão é derivada de `signature.infrastructure` normalizada e
somente o valor exato `ICP-Brasil` libera os sinais qualificados. Os testes
automatizados cobrem separadamente assinatura simples e avançada e rejeitam
marca ou link ICP nesses estados.

O agente local `1.2.1` também aceita um ticket ainda válido no estado
`prepared`, sem criar outro preparo. No ensaio rastreável
`MAI-2026-6A52-65W8-17NX-BMGA`, a interface reconheceu o estado, exibiu a
mensagem de retomada, recebeu novamente do servidor o mesmo hash de
apresentação e chegou ao desafio da chave externa. A autorização física foi
cancelada pelo dispositivo; o agente devolveu erro e o ticket permaneceu
`prepared`, comprovando o comportamento fail-closed sem promover esse ensaio a
novo artefato assinado. A aprovação ITI desta baseline continua vinculada ao
PDF e aos hashes da seção anterior.

A folha final não exibe registro lateral; as páginas de conteúdo exibem micro
marca `m.`, código, hash e atestado pós-quântico na margem direita. Todas as
páginas têm linha dourada superior. O bloco jurídico não possui o título
“Fundamento jurídico”: a base legal fica à esquerda e, somente no estado
qualificado, `Validação externa: validar.iti.gov.br` fica à direita.

## Imagens imutáveis implantadas

| Serviço | ID da imagem validada |
|---|---|
| Portal | `sha256:76eba1ad6be5ce4b5aa1efc95b23ec3cd3662881593c1e6ed0d12cd52fd2e94e` |
| Bridge | `sha256:a5b3f9c6c0ef08212e0b0007f8f75c6ffaf78d0578e7af257d3ac2c27efd2c44` |
| Provider | `sha256:8bd9918d0442de1e510a3c179a34816d1059d28094f31c6a096cb3f47d50ca51` |

Os três containers estavam saudáveis no fechamento. A página inicial respondeu
`200` com TLS verificado; a rota protegida do bridge respondeu o `401`
estruturado esperado sem ticket; o QR e `/v/MAI-2026-YKX8-Q37B-9NM3-SJSM`
redirecionaram para o verificador do próprio portal.

## Critério de regressão

Qualquer alteração em texto, posição, marca, fundo, QR, código de barras,
carimbo, metadado ou aparência do campo criptográfico muda o PDF preparado. A
revisão só substitui esta baseline depois de nova assinatura A3, cobertura
integral do `ByteRange`, verificação CMS, `proofVerified: true`, inspeção visual
das duas modalidades e novo resultado `Assinatura aprovada.` no VALIDAR ITI.

Esta baseline substitui a
[baseline canônica anterior](2026-07-13-pades-canonical-layout-iti-approved.md)
quanto à composição e às versões implantadas. As baselines anteriores
permanecem como histórico criptográfico e visual.

## Fontes

- [VALIDAR ITI](https://validar.iti.gov.br/)
- [DOC-ICP-15.03 v9.1](https://repositorio.iti.gov.br/instrucoes-normativas/IN2021_03_DOC-ICP-15.03.htm)
- [Lei 14.063/2020](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm)
- [MP 2.200-2/2001](https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm)
