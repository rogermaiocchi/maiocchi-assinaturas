# Baseline dos enderecos de validacao aprovada pelo ITI - 2026-07-13

- Status: canonico
- Ambiente: producao, `assinatura.maiocchi.adv.br`
- Portal: `maiocchi/assinatura-portal:1.11.2`
- Bridge: `maiocchi/pki-bridge:1.3.7`
- Provider: `maiocchi/pades-provider:1.2.3`
- Codigo implantado: `47392a1885a6ed116249b730a18e76d90827027d`
- Validador externo: VALIDAR ITI

Esta baseline fixa dois enderecos com responsabilidades distintas. O registro
Maiocchi sempre usa
`https://assinatura.maiocchi.adv.br/validar?codigo={id}`. O endereco
`https://validar.iti.gov.br/` e acrescentado somente quando a infraestrutura
da assinatura estiver entre as modalidades reconhecidas pelo servico oficial.

## Regra de elegibilidade

| Infraestrutura comprovada | Verificador Maiocchi | VALIDAR ITI |
|---|---|---|
| `ICP-Brasil` | presente | presente |
| `GOV.BR` ou `Assinatura GOV.BR` | presente | presente |
| assinatura eletronica simples | presente | ausente |
| classificacao avancada sem infraestrutura reconhecida | presente | ausente |

A decisao e fail-closed e usa o valor normalizado da infraestrutura, nao texto
de apresentacao. A classificacao generica `avancada` nao basta para publicar o
link do ITI.

## Ensaio real A3

O PDF de 12 paginas foi preparado em producao, recebeu a folha final de
evidencias, foi assinado novamente com o token ICP-Brasil A3 conectado ao
MacBook e submetido ao VALIDAR ITI. O relatorio oficial emitido em 13/07/2026
as 22:08:16 BRT registrou:

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

O relatorio tambem registrou LPA `PAdES v2` valida, uma assinatura, uma
assinatura ancorada e cadeia completa ate a Autoridade Certificadora Raiz
Brasileira v5.

## Artefatos rastreaveis

| Artefato | Identificador ou SHA-256 |
|---|---|
| Documento publico | `MAI-2026-MY4D-BRZ4-CYP2-8QK9` |
| Numero do documento | `20260714005351894212889304150` |
| PDF recebido, 12 paginas | `0b5fd83d7eaeb0b983bb4a32b0e16a4dd4c139a0053036643283c0cb19e01282` |
| PDF PAdES final, 13 paginas | `75c88882b6efe5123009b2bdd35ca425cfb86f770e8e3f4a28d6b94d1a3373a5` |
| Relatorio PDF do VALIDAR ITI | `118518b4a025d1d51a831c1cbb5f047ecd9e06e1a6fa46ef1f2ed11445c4bd10` |
| Captura do resultado resumido | `870b4152c803e0f2a3b8ad6982741d3855190f0214cc6fe95787c69452a34fcc` |
| Captura do relatorio completo | `ea374d9b7b14e627d14277e55c895476e3ad8032adcbd9023abbd711e86fd0a8` |
| Registro publico capturado | `e59c4d944ef5d6f389402e0eb6b806ba98b057b129cec34ba215a6279f8dbd2b` |
| Render da primeira pagina | `d23da0812faef8128f84eb6bba700481b16602da32367bd67c87f917e04bca4f` |
| Render da folha de evidencias | `499657d2e1ac27b34e6ec7a90be979f9125a3bfd4f8b64ff1450c5e4d88eed23` |

As evidencias privadas ficam em
`~/.claude/audit/runs/2026-07-13-validator-address-standard/` e nao integram o
repositorio. O registro publico retornou `active`, `proofVerified: true`, o
mesmo hash final, perfil `AD-RB`, `docMdp: valid`, OID
`2.16.76.1.7.1.11.1.3`, o endereco Maiocchi canonico e o endereco oficial do
ITI.

## Rotas e documento

- `/validar?codigo={id}` e `/validar/?codigo={id}` respondem `200` sem trocar a
  URL solicitada;
- `/v/{id}` permanece somente como compatibilidade e responde `302` para
  `/validar?codigo={id}`;
- QR, links PDF e envelope apontam ao endereco canonico do portal;
- o PDF qualificado contem links clicaveis tanto para o registro Maiocchi
  quanto para `https://validar.iti.gov.br/`;
- assinaturas nao elegiveis preservam o verificador Maiocchi e omitem o link,
  a marca e a alegacao de validacao pelo ITI.

## Imagens imutaveis implantadas

| Servico | ID da imagem validada |
|---|---|
| Portal | `sha256:b1687aa406c6081a511050666b5c440df483d53f95bd7b30cb692bd5cfe9d72d` |
| Bridge | `sha256:6622037b2f07ddc9fe8e08f482a78d84322298fbb296a27e5a26e0cdfcbb76be` |
| Provider | `sha256:8bd9918d0442de1e510a3c179a34816d1059d28094f31c6a096cb3f47d50ca51` |

Os tres containers estavam saudaveis no fechamento. A pagina inicial e as duas
formas de `/validar` responderam `200`; o endereco oficial do ITI respondeu
`200`.

## Verificacao de regressao

A suite terminou com 63 testes: 60 aprovados, nenhum reprovado e tres skips
esperados. `lint`, build Next.js e build do laboratorio visual passaram. A
inspecao responsiva em 1440 e 390 pixels nao encontrou overflow. Os tres modos
visuais foram verificados separadamente: ICP-Brasil e GOV.BR exibem o link do
ITI; assinatura simples nao exibe; somente ICP-Brasil usa a marca oficial
ICP-Brasil.

Esta baseline substitui a
[baseline por modalidade](2026-07-13-pades-dual-modality-iti-approved.md)
quanto aos enderecos, versoes implantadas e ensaio externo. A composicao visual
anterior permanece historica.

## Fontes

- [VALIDAR ITI](https://validar.iti.gov.br/)
- [Servico oficial VALIDAR](https://www.gov.br/pt-br/servicos/validar-servico-de-validacao-de-assinaturas-eletronicas)
- [Duvidas do VALIDAR ITI](https://validar.iti.gov.br/duvidas.html)
- [DOC-ICP-15.03 v9.1](https://repositorio.iti.gov.br/instrucoes-normativas/IN2021_03_DOC-ICP-15.03.htm)
