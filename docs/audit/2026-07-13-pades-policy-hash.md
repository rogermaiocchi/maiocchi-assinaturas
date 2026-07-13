# Auditoria do SignPolicyHash PAdES AD-RB v1.3

## Sintoma reproduzido no VALIDAR ITI

O relatório oficial reconheceu OID, URI, algoritmo, integridade criptográfica e cadeia do assinante, mas marcou `IdAaEtsSigPolicyId` como inválido com a mensagem: `O valor do resumo criptográfico não é equivalente ao esperado.`

## Causa-raiz

O provider 1.1.2 usava o SHA-256 do arquivo DER completo tanto para verificar o artefato quanto para preencher `SigPolicyHash`. Esses valores têm finalidades distintas:

- checksum SHA-256 do arquivo oficial completo: `23da544aef71f7a75dc85fa6e17a83875741e4baef41ec178258a5c86ace54dd`;
- `SignPolicyHash` interno da `SignaturePolicy`: `23e4be4b9b362172e4ebb0e72b86a133ece5aad843d8651c6e38a0ba3f08fc60`.

No DER oficial, o segundo valor está no terceiro componente da sequência externa. Ele também coincide com o SHA-256 recalculado sobre a concatenação DER dos dois componentes anteriores: `signPolicyHashAlg` e `signPolicyInfo`.

## Correção fail-closed

O provider 1.1.3:

1. valida o checksum do arquivo completo com `PADES_POLICY_FILE_SHA256`;
2. exige DER canônico e algoritmo SHA-256;
3. confirma o OID dentro de `signPolicyInfo`;
4. recalcula o hash dos dois primeiros componentes e compara com o valor interno;
5. compara o valor interno com `PADES_POLICY_DIGEST_SHA256`;
6. usa somente o `SignPolicyHash` interno no CMS;
7. relê o atributo assinado antes de liberar o PDF.

Há regressões automatizadas para impedir o uso do checksum do arquivo como digest do atributo e para rejeitar alteração do hash interno mesmo quando o checksum configurado acompanha o arquivo adulterado.

## Homologação concluída

A correção foi publicada no commit
`ccda3c5d6e929967460d616ce471c13254519303`, implantada como
`maiocchi/pades-provider:1.1.3` e exercitada com certificado ICP-Brasil A3 real.

O novo PDF final tem SHA-256
`d6b848586c6fc7fd5358e920fd4c45eaf22301bc7d72ce47c43c9edeb57633a0`.
O relatório PDF baixado do VALIDAR ITI tem SHA-256
`73bea551f8532980068e66954628c47df8002b27be536e847f22196fa69aedd6`.
Em 13/07/2026 às 10:56:28 BRT, o serviço retornou `Aprovado`, caminho
`Valid`, estrutura em conformidade, resumo criptográfico `true` e os cinco
atributos obrigatórios `Valid`.

A inspeção independente do CMS confirmou o digest interno
`23e4be4b9b362172e4ebb0e72b86a133ece5aad843d8651c6e38a0ba3f08fc60`
e a URI canônica HTTP. A verificação destacada com OpenSSL retornou
`Verification successful`.

O registro canônico completo está na
[baseline PAdES homologada](../baseline/2026-07-13-pades-iti-approved.md).

## Fontes oficiais

- [Repositório ITI da assinatura digital com Referência Básica](https://www.gov.br/iti/pt-br/assuntos/repositorio/assinatura-digital-com-referencia-basica-ad-rb)
- [DOC-ICP-15.03 v9.1 compilado](https://www.gov.br/iti/pt-br/assuntos/legislacao/documentos-principais/v9.1_IN2021_03_DOCICP15.03_compilada.pdf/@@download/file)
- [Política oficial PA_PAdES_AD_RB_v1_3.der](http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3.der)
