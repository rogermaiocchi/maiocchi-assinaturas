# Política PAdES ICP-Brasil

O arquivo `PA_PAdES_AD_RB_v1_3.der` é a política oficial PAdES AD-RB v1.3 vigente, publicada pelo ITI.

- página oficial: `https://www.gov.br/iti/pt-br/assuntos/repositorio/assinatura-digital-com-referencia-basica-ad-rb`
- URI canônica no atributo assinado: `http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3.der`
- resumo oficial: `http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3der-sha256.txt`
- OID confirmado no ASN.1: `2.16.76.1.7.1.11.1.3`
- SHA-256 do arquivo DER completo: `23da544aef71f7a75dc85fa6e17a83875741e4baef41ec178258a5c86ace54dd`
- `SignPolicyHash` SHA-256 interno, usado no CMS: `23e4be4b9b362172e4ebb0e72b86a133ece5aad843d8651c6e38a0ba3f08fc60`
- ciclo publicado: 23/07/2025 a 22/10/2037

O provider falha no startup se o checksum do arquivo, o `SignPolicyHash` interno, o OID ou a URI não coincidirem com a referência canônica publicada pelo ITI. O checksum do arquivo não é o digest que integra `id-aa-ets-sigPolicyId`: o provider decodifica o ASN.1 e valida essa distinção. Após assinar, ele também relê o CMS e bloqueia a saída se esse conjunto não estiver exatamente nos atributos assinados. Uma nova versão da política exige atualização explícita, auditoria do ASN.1 e regressão com o VALIDAR ITI.
