# Baseline canônico do layout PAdES aprovado pelo ITI - 2026-07-13

- Status: canônico
- Ambiente: produção, `assinatura.maiocchi.adv.br`
- Portal: `maiocchi/assinatura-portal:1.11.1`
- Bridge: `maiocchi/pki-bridge:1.3.4`
- Provider: `maiocchi/pades-provider:1.2.2`
- Código homologado: `85fcdb841c8952f5dee04a14e5fdbfb1240ef5bc`
- Validador externo: VALIDAR ITI

Este documento promove a composição visual unificada da folha de evidências e
do campo visível de assinatura à baseline de produção. O ensaio foi feito com
um PDF real de 12 páginas, preparado pelo bridge, assinado com certificado
ICP-Brasil A3 no token conectado e validado novamente no serviço oficial.

## Resultado oficial

O relatório emitido pelo VALIDAR ITI em 13/07/2026 às 17:07:29 BRT registrou:

| Controle | Resultado |
|---|---|
| Status da assinatura | Aprovado |
| Caminho de certificação | Valid |
| Estrutura | Em conformidade com o padrão |
| Cifra assimétrica | Aprovada |
| Resumo criptográfico | `true` |
| Política | `PA_PAdES_AD_RB_v1_3.der` |
| Atributos obrigatórios | Aprovados |
| Mensagem de alerta | Nenhuma |
| Atributo opcional `IdAaEtsSignerAttr` | Valid |

O serviço classificou `IdMessageDigest`, `IdContentType`,
`IdAaEtsSigPolicyId`, `IdAaSigningCertificateV2`, `SignatureDictionary` e
`IdAaEtsSignerAttr` como `Valid`. O relatório identifica uma assinatura e uma
assinatura ancorada, fonte de verificação `Offline`, Verificador de
Conformidade `2.21.1.2` e Validador de Documentos `6aec769-dirty`.

## Artefatos rastreáveis

| Artefato | Identificador ou SHA-256 |
|---|---|
| Documento público | `MAI-2026-3AVP-ND5Y-1A6H-1VNV` |
| Número do documento | `20260713195802375123730205700` |
| PDF recebido, 12 páginas | `0b5fd83d7eaeb0b983bb4a32b0e16a4dd4c139a0053036643283c0cb19e01282` |
| PDF PAdES final, 13 páginas | `a11328a53acceabd1ed23d3f5ffbe58caf82a59a10b1083dbd2d2ccdb624939e` |
| Relatório interno do provider | `c0590ce32e0e845db781d7047c28f2762ac3671b04e4ac4ca613ca601cce0dc2` |
| Relatório PDF do VALIDAR ITI | `2b9a663401b1bc2d4bced07aa1ce3f04d839e1ae90bdd9f5e8a051769e496d92` |
| CMS PAdES extraído | `310df1e199e70456b1e7d3d59ab55b6cacdaf635b990cdbdd22006bc27a7c52a` |
| Registro público capturado | `931664eb534a0e0b9e43734f0458cda6c453051eec2e667cf2ac0460f0a84568` |
| Render da primeira página | `0950b54a105973903ef8d93c99eebe5a4b172a78272378e55b9137ba6bf5259b` |
| Render da folha de evidências | `072c91a27044884405d1b017d257555b8c315442939aaf2221ccc67c87533780` |
| Prova neutra não ICP-Brasil | `2a6dcd1edfa3d9927401e4a9240c6761e64826fe0a67a447ebd038845df94c0c` |
| Render da folha neutra | `bb687ab8ec6b11e1f7bc9a44174ff03f0e4e1039d4c4e19c7a44d426bb88512a` |

O verificador público retornou documento `active`, `proofVerified: true`, 13
páginas, o mesmo hash final, uma assinatura, `docMdp: valid`, perfil AD-RB e OID
`2.16.76.1.7.1.11.1.3`. As evidências privadas permanecem na trilha governada
`~/.claude/audit/runs/2026-07-13-pades-canonical-layout-iti-approved/` e não
integram o repositório público.

O `ByteRange` cobre integralmente os 2.161.623 bytes do arquivo, excetuado apenas
o espaço reservado ao CMS. O `pdfsig` retornou `Signature is Valid` e `Total
document signed`; a verificação destacada do CMS pelo OpenSSL retornou `CMS
Verification successful`.

## Regra condicional ICP-Brasil

A infraestrutura é normalizada e precisa ser exatamente `ICP-Brasil`. Somente
nesse estado o renderer pode carregar ou apresentar:

- marca oficial ICP-Brasil;
- fundo de segurança e medalhão PAdES AD-RB;
- OID, matriz de atributos ITI e identificação de assinatura qualificada;
- fundamento da MP 2.200-2/2001, art. 10, parágrafo 1º, e da Lei 14.063/2020,
  art. 4º, III.

Modalidades diferentes recebem quadro neutro de registro eletrônico, sem marca
oficial, fundo PAdES, OID ou alegação ICP-Brasil. O teste estrutural exige cinco
ou mais imagens na folha ICP e exatamente três na folha neutra, correspondentes
à marca Maiocchi, ao QR e ao Code 128. A mesma condição governa o laboratório
visual. Texto fornecido pelo usuário ou seleção estética não pode elevar a
modalidade de confiança.

## Composição homologada

- A4 com margens de 3 cm no topo e à esquerda e 2 cm à direita e embaixo;
- micro marca `m.` e código de verificação na margem direita de todas as páginas;
- paginação final em negrito, alinhada à direita, no formato `Página X de Y`;
- folha final com identificação, número, arquivo, páginas, hash do arquivo
  recebido, QR, eventos, signatário, ambiente, atributos, atestado ML-DSA-65,
  URL, Code 128, campo visível da assinatura e fundamento jurídico;
- hash do PDF final publicado no verificador, pois o arquivo não pode conter o
  próprio hash sem modificar o valor calculado;
- dados da assinatura alinhados à esquerda sobre fundo de segurança secundário,
  com `PAdES` legível e sem marca Maiocchi dentro do selo;
- rodapé sem linha, logo ou código adicional; contém somente a paginação.

## Uso da referência D4Sign

A referência foi útil para validar quatro decisões funcionais: QR próximo ao
identificador, eventos em ordem cronológica, explicação inequívoca do escopo do
hash e encerramento com a credencial aplicável. Não foram copiados identidade,
ornamentos, marca d'água ou densidade da página. A solução Maiocchi preserva
mais espaço, hierarquia tipográfica própria e separação explícita entre sinais
visuais e prova criptográfica.

## Imagens imutáveis implantadas

| Serviço | ID da imagem validada |
|---|---|
| Portal | `sha256:76eba1ad6be5ce4b5aa1efc95b23ec3cd3662881593c1e6ed0d12cd52fd2e94e` |
| Bridge | `sha256:d67f5fc58ce415f1d53677898bb4533b854298719e21be6102dba880c6099759` |
| Provider | `sha256:ecb7562801ec309b261579a7840c72c4145b30ef122ed9ec7626581b7dfdf85f` |

Os três containers estavam saudáveis no fechamento do ensaio. A rota pública
de validação respondeu e reconduziu à área de conferência do portal.

## Critério de regressão

Qualquer alteração em texto, posição, marca, fundo, QR, código de barras,
carimbo, metadado ou campo visível muda o PDF preparado. A revisão só substitui
esta baseline depois de nova assinatura A3, cobertura integral do `ByteRange`,
validação local, `proofVerified: true`, inspeção visual e novo resultado
`Assinatura aprovada.` no VALIDAR ITI.

Esta baseline substitui a
[baseline dos sinais físicos](2026-07-13-pades-iti-physical-signals-approved.md)
somente quanto à composição visual. A
[baseline criptográfica](2026-07-13-pades-iti-approved.md) permanece histórica
e normativa para OID, política, CMS e `ByteRange`.

## Fontes

- [VALIDAR ITI](https://validar.iti.gov.br/)
- [DOC-ICP-15.03 v9.1](https://repositorio.iti.gov.br/instrucoes-normativas/IN2021_03_DOC-ICP-15.03.htm)
- [Lei 14.063/2020](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm)
- [MP 2.200-2/2001](https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm)
