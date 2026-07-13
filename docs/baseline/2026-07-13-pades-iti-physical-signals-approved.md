# Baseline homologado dos sinais físicos ITI - 2026-07-13

- Status: canônico
- Ambiente: produção, `assinatura.maiocchi.adv.br`
- Portal: `maiocchi/assinatura-portal:1.11.1`
- Bridge: `maiocchi/pki-bridge:1.3.3`
- Provider: `maiocchi/pades-provider:1.2.1`
- Código homologado: `197487f98791e582ffa39c35b8710e6b3985921d`
- Validador externo: VALIDAR ITI

Este documento promove a revisão visual dos atributos opcionais à baseline de
produção. O ensaio usou um PDF novo, preparado pela versão implantada, assinado
novamente com token ICP-Brasil A3 e submetido novamente ao VALIDAR ITI.

## Resultado oficial final

O relatório emitido pelo VALIDAR ITI em 13/07/2026 às 13:06:43 BRT registrou:

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

O ITI classificou individualmente `IdMessageDigest`, `IdContentType`,
`IdAaEtsSigPolicyId`, `IdAaSigningCertificateV2`, `SignatureDictionary` e
`IdAaEtsSignerAttr` como `Valid`. O hash exibido pelo serviço oficial coincide
com o SHA-256 calculado localmente sobre o PDF final.

## Sinais físicos homologados

A última página do próprio PDF contém uma matriz legível, vinculada ao conteúdo
antes da assinatura, com três estados visualmente distintos:

| Estado físico | Conteúdo |
|---|---|
| Incorporados | `signerAttr`, `/Name`, `/M`, `/Location`, `/Reason`, `/ContactInfo`, `/Prop_Build` |
| ACT / condicional | `contentTimeStamp`, `signatureTimeStampToken`, `Document Time-stamp` |
| Contexto / padrão | `/Reference`, `/Changes`, `/V=0`, `/Prop_AuthTime`, `DSS`, `VRI` |

O campo visível da assinatura identifica signatário, CPF mascarado, instante,
ICP-Brasil A3, perfil AD-RB, papel declarado e os campos incorporados. Todas as
páginas exibem no rodapé o identificador, o perfil, a referência ITI e o domínio
de verificação.

As marcações físicas são referências de conferência. A prova jurídica continua
no CMS/PAdES e no `ByteRange`. Os itens dependentes de Autoridade de Carimbo do
Tempo aparecem como condicionais e permanecem ausentes enquanto não houver ACT
ICP-Brasil credenciada configurada; o portal não fabrica carimbos ou fatos.

## Artefatos rastreáveis

| Artefato | Identificador ou SHA-256 |
|---|---|
| Documento público | `MAI-2026-ESY0-6MPD-QQBP-RMG4` |
| Número do documento | `20260713155250664425469195217` |
| PDF original, 12 páginas | `0b5fd83d7eaeb0b983bb4a32b0e16a4dd4c139a0053036643283c0cb19e01282` |
| PDF preparado, 13 páginas | `f1e26fff8482b91e51157654eb21619d3f9e6585d604d5c233807c06099ae9b0` |
| PDF PAdES final, 13 páginas | `020996e7aa6cf44f59aefd21df96ca3981f2075c6d33097c9ecb1c192e5630de` |
| Representação probatória registrada | `d7160d26197a2c7abcc2d701320b38004369f5578d1c16add3119580c9de4e8c` |
| Relatório interno registrado | `a12116f2908a29714733df4875cb09c824a16b53e960e22417a9dc781f4b195c` |
| XML diagnóstico decodificado | `5e334f05950ae0ac4b170668e58574fc1d8d413b6b5c6ed572edd3b9689473fd` |
| Relatório PDF do VALIDAR ITI | `55e5b6e2ae4e143641d0ce7cbdf00269c44250b7b16716e89352d599625e4f35` |

As evidências privadas permanecem em
`~/.claude/audit/runs/2026-07-13-pades-iti-physical-signals-a3/`. Elas não
integram o repositório público porque contêm dados pessoais e do certificado.

## Imagens imutáveis implantadas

| Serviço | Imagem | ID da imagem validada |
|---|---|---|
| Portal | `maiocchi/assinatura-portal:1.11.1` | `sha256:76eba1ad6be5ce4b5aa1efc95b23ec3cd3662881593c1e6ed0d12cd52fd2e94e` |
| Bridge | `maiocchi/pki-bridge:1.3.3` | `sha256:25caf3bcf00b5064178ba5f6e7bb7d6e23092ad30f698bc6564d20687825595e` |
| Provider | `maiocchi/pades-provider:1.2.1` | `sha256:f0245bde4083a944076bdcb91eb761c6e3fce00539aa2720434d660cd14c3170` |

Os três containers estavam saudáveis durante o ensaio. O verificador público
retornou `proofVerified: true`, documento `active`, o mesmo hash final e a matriz
sanitizada dos atributos efetivos.

## Invariantes preservados

- perfil PAdES AD-RB v1.3;
- OID `2.16.76.1.7.1.11.1.3`;
- RSA com SHA-256 e certificado ICP-Brasil A3;
- tipo CMS `ETSI.CAdES.detached`;
- cobertura integral do documento pelo `ByteRange`;
- nenhuma alteração depois da conclusão PAdES;
- atestado ML-DSA-65 separado da assinatura ICP-Brasil.

## Regra de regressão

Qualquer mudança posterior em texto, logo, posição, matriz, QR, código de barras,
carimbo, metadado ou aparência da assinatura muda o binário preparado. A revisão
só pode substituir esta baseline depois de nova assinatura A3 e novo relatório
do VALIDAR ITI com status `Aprovado`.

## Fontes

- [VALIDAR ITI](https://validar.iti.gov.br/)
- [DOC-ICP-15.03 v9.1](https://repositorio.iti.gov.br/instrucoes-normativas/IN2021_03_DOC-ICP-15.03.htm)
- [Autoridades de Carimbo do Tempo ICP-Brasil](https://www.gov.br/iti/pt-br/assuntos/icp-brasil/autoridades-de-carimbo-do-tempo)

