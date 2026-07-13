# Auditoria da reprovação PAdES AD-RB

Data: 2026-07-13

## Resultado

A reprovação foi causada exclusivamente pelo qualificador `spuri` do atributo assinado
`id-aa-ets-sigPolicyId`.

O PDF assinado apresentou:

- integridade criptográfica válida;
- cobertura integral do documento pelo `ByteRange`;
- assinatura RSA/SHA-256 válida;
- cadeia ICP-Brasil construída pelo Validador ITI;
- OID correto: `2.16.76.1.7.1.11.1.3`;
- checksum correto do artefato DER: `23da544aef71f7a75dc85fa6e17a83875741e4baef41ec178258a5c86ace54dd`;
- `SignPolicyHash` interno correto para o atributo assinado: `23e4be4b9b362172e4ebb0e72b86a133ece5aad843d8651c6e38a0ba3f08fc60`;
- URI emitida incorretamente: `https://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3.der`.

O repositório oficial do ITI publica como referência canônica da política PAdES AD-RB
v1.3 a URI `http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3.der`. Embora os
dois esquemas entreguem atualmente os mesmos 4.716 bytes, o qualificador faz parte dos
atributos assinados e o Validador ITI exige a referência publicada.

## Evidências

- relatório do Validador ITI: `IdAaEtsSigPolicyId` inválido por URI do artefato;
- `pdfsig`: assinatura válida, `ETSI.CAdES.detached`, documento inteiro assinado;
- OpenSSL CMS: OID e digest corretos, com `IA5STRING` iniciado por `https://`;
- artefato oficial: SHA-256 confirmado pelo arquivo de resumo do ITI;
- página oficial: <https://www.gov.br/iti/pt-br/assuntos/repositorio/assinatura-digital-com-referencia-basica-ad-rb>;
- requisitos oficiais: <https://www.gov.br/iti/pt-br/central-de-conteudo/doc-icp-15-03-versao-7-4-req-das-pol-de-assin-dig-na-icp-brasil-pdf>.

## Correção

1. A configuração de produção passou a usar a URI canônica `http://`.
2. O provider passou a aceitar somente o conjunto exato OID, SHA-256 e URI da política
   PAdES AD-RB v1.3.
3. Após produzir o PDF, o provider relê o CMS e verifica OID, algoritmo SHA-256, digest,
   quantidade e tipo de qualificadores e URI antes de liberar o arquivo.
4. A regressão automatizada comprova que a variante `https://` impede a inicialização.

## Consequência para o arquivo reprovado

O PDF existente não pode ser corrigido in-place: a URI está dentro dos atributos assinados.
Qualquer alteração invalidaria a assinatura. É necessária uma nova assinatura após a
implantação do provider corrigido.
