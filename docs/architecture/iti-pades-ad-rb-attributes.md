# Atributos PAdES AD-RB do ITI

## Escopo

Padrão implementado pelo provider privado `1.2.5`, com base no DOC-ICP-15.03 v9.1,
tabelas A.14 a A.22, e no DOC-ICP-15.02 v4.0. O símbolo `P` significa
**permitido/opcional**, não “preencher sempre”. Uma entrada opcional só é emitida quando
seu fato gerador existe e pode ser provado.

## CMS do assinante

| Atributo | Regra AD-RB | Provider 1.2.5 |
|---|---:|---|
| `id-contentType` | O | presente e verificado |
| `id-messageDigest` | O | presente e verificado |
| `id-aa-signingCertificateV2` | O | presente e verificado |
| `id-aa-ets-sigPolicyId` | O | presente e verificado |
| `id-aa-ets-signerAttr` | P | presente; papel declarado integra os bytes assinados |
| `id-aa-ets-contentTimeStamp` | P | modo `act-mtls`; exige ACT ICP-Brasil |
| `id-aa-signatureTimeStampToken` | P | modo `act-mtls`; exige ACT ICP-Brasil |

O provider relê o CMS final e bloqueia `id-aa-signingCertificate`, `id-signingTime`,
`id-aa-ets-signerLocation`, `adbe-revocationInfoArchival` e os atributos CAdES de
referências/valores que o perfil PAdES proíbe. Tempo e localização ficam nas entradas
PDF `/M` e `/Location`, como determina o DOC-ICP-15.02.

## Dicionário de assinatura PDF

| Entrada opcional | Aplicação |
|---|---|
| `/Name` | nome extraído do certificado do signatário |
| `/M` | instante UTC da preparação criptográfica |
| `/Location` | `Brasil`; geolocalização detalhada permanece na folha de evidências |
| `/Reason` | finalidade normalizada do documento |
| `/ContactInfo` | contato institucional do portal |
| `/Prop_Build` | `Maiocchi. Assinatura PAdES Provider 1.2.5` |
| `/V` | default normativo efetivo `0`; não se duplica o valor padrão |
| `/Reference` | somente assinatura de certificação/DocMDP; não aplicável à assinatura de aprovação atual |
| `/Changes` | somente quando houver transformação referenciada; não aplicável ao fluxo atual |
| `/Prop_AuthTime` | depende de tempo de autenticação mensurável antes da preparação; indisponível no fluxo A3 atual |

As entradas `/Cert`, `/R` e `/Prop_AuthType` são proibidas e auditadas como ausentes.

O relatório DSS pode emitir um aviso genérico do perfil ETSI ao encontrar `/Reason` junto
de uma política explícita. Esse aviso não altera a regra ICP-Brasil: a tabela A.18 do
DOC-ICP-15.03 v9.1 classifica `/Reason` como `P` (pode/opcional) nos quatro perfis PAdES.
O provider preserva a entrada, verifica sua presença e condiciona a entrega à integridade
criptográfica e à política oficial no CMS final.

## Sinais físicos no documento

A última página assinada contém uma matriz visual com todos os opcionais do perfil:

- verde: atributo incorporado e exigido pelo contrato interno do provider;
- amarelo: atributo condicionado a uma ACT ICP-Brasil;
- cinza: atributo contextual, não aplicável ou coberto pelo valor normativo padrão.

A aparência da assinatura identifica `signerAttr`, `/Location`, `/Reason`, as entradas
`/Name`, `/M`, `/ContactInfo`, `/Prop_Build` e o estado real da ACT. Todas as páginas
recebem rodapé com ID, perfil `PAdES AD-RB`, referência ao ITI e endereço de verificação.
Esses sinais são referências legíveis e integram os bytes assinados; a prova de presença
continua sendo o CMS/dicionário PDF conferido pelo provider e pelo VALIDAR ITI.

## Dicionários relacionados

`DSS`, `VRI` e `Document Time-stamp` são opcionais em AD-RB. Não são adicionados apenas
para preencher o PDF: DSS implica VRI e dados de validação coerentes; Document Time-stamp
exige ACT. Uma evolução para preservação de longo prazo deve ser homologada separadamente,
sem alterar a baseline AD-RB aprovada.

## ACT ICP-Brasil

O modo `PADES_TSP_MODE=act-mtls` usa RFC 3161 sobre HTTPS, nonce aleatório e certificado
cliente PKCS#12. O startup falha se URL, arquivo ou senha estiverem incompletos. Durante a
assinatura, uma falha da ACT bloqueia a entrega; não existe fallback para relógio local.

Configuração:

- `PADES_TSP_MODE=disabled|act-mtls`
- `PADES_TSP_URL`
- `PADES_TSP_POLICY_OID` (quando exigido pela ACT)
- `PADES_TSP_KEYSTORE_FILE`
- `PADES_TSP_KEYSTORE_DIR` (diretório montado como somente leitura)
- `PADES_TSP_KEYSTORE_PASSWORD`

Em produção, o modo permanece `disabled` até contratação e instalação de credencial de
ACT credenciada. Nenhum segredo integra o repositório.

## Fontes oficiais

- [DOC-ICP-15.03 v9.1 compilado](https://www.gov.br/iti/pt-br/assuntos/legislacao/documentos-principais/v9.1_IN2021_03_DOCICP15.03_compilada.pdf)
- [DOC-ICP-15.02 v4.0](https://repositorio.iti.gov.br/instrucoes-normativas/IN2021_02_DOC-ICP-15.02.htm)
- [Autoridades de Carimbo do Tempo](https://www.gov.br/iti/pt-br/assuntos/icp-brasil/autoridades-de-carimbo-do-tempo)
- [DSS 6.4](https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/doc/dss-documentation.html)
