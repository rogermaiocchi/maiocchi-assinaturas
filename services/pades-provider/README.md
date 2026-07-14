# pades-provider

Motor privado Java 21 baseado no DSS 6.4 para preparar e concluir PAdES AD-RB com assinatura externa A3.

## API interna

- `GET /healthz`
- `POST /v1/signatures/prepare`
- `POST /v1/signatures/{sessionId}/complete`

As rotas de assinatura exigem `X-Provider-Key`; o container deve existir somente em `pki-internal`. Sessões vivem em memória por três minutos e são removidas antes da conclusão para impedir replay.

## Configuração obrigatória

- `PADES_PROVIDER_API_KEY`
- `ICP_TRUST_DIR`
- `ICP_TRUST_ROOTS` (nomes explícitos, separados por vírgula)
- `PADES_POLICY_FILE`
- `PADES_POLICY_OID`
- `PADES_POLICY_URI`
- `PADES_POLICY_FILE_SHA256` (checksum SHA-256 do artefato DER completo)
- `PADES_POLICY_DIGEST_SHA256` (`SignPolicyHash` interno incorporado ao atributo assinado)

## Atributos opcionais do ITI

O provider `1.2.5` inclui `id-aa-ets-signerAttr`, `/Name`, `/M`, `/Location`, `/Reason`,
`/ContactInfo` e `/Prop_Build`, e audita a ausência das entradas proibidas antes de
liberar o PDF. A finalidade do documento é incorporada em `/Reason`; o papel declarado
integra o CMS assinado.

Os atributos `id-aa-ets-contentTimeStamp` e `id-aa-signatureTimeStampToken` usam o modo
opcional `PADES_TSP_MODE=act-mtls`. Quando ativado, são exigidos URL HTTPS, nonce RFC 3161,
keystore cliente PKCS#12 e senha por variável de ambiente. Qualquer falha da ACT encerra a
operação sem PDF. O modo padrão é `disabled`; relógio local nunca substitui carimbo de ACT.

Consulte [a matriz de atributos AD-RB](../../docs/architecture/iti-pades-ad-rb-attributes.md).

O startup falha com trust store vazia, raiz configurada ausente ou incompatível, política ausente ou referência divergente. Para AD-RB v1.3, o provider valida separadamente o checksum do arquivo oficial e o `SignPolicyHash` interno, recalcula esse hash sobre os dois primeiros componentes DER da `SignaturePolicy` e usa somente o valor interno no CMS. OID e URI canônica `http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3.der` também são verificados. O CMS final é relido antes da resposta para impedir que uma política mal serializada seja liberada. A AC-Raiz v7 permanece no repositório oficial local, mas não integra `ICP_TRUST_ROOTS` enquanto seu algoritmo OID `1.3.6.1.4.1.44588.2.1` não for suportado e homologado no runtime. O PDF final só é retornado quando assinatura RSA, cadeia, política e validação DSS passam.

## Build

```bash
docker build -f services/pades-provider/Dockerfile -t maiocchi/pades-provider:test .
```

Fontes: [DSS](https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/doc/dss-documentation.html), [política AD-RB do ITI](https://www.gov.br/iti/pt-br/assuntos/repositorio/assinatura-digital-com-referencia-basica-ad-rb) e [AC-Raiz](https://www.gov.br/iti/pt-br/assuntos/repositorio/repositorio-ac-raiz).
