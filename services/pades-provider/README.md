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
- `PADES_POLICY_SHA256`

O startup falha com trust store vazia, raiz configurada ausente ou incompatível, política ausente ou digest divergente. A AC-Raiz v7 permanece no repositório oficial local, mas não integra `ICP_TRUST_ROOTS` enquanto seu algoritmo OID `1.3.6.1.4.1.44588.2.1` não for suportado e homologado no runtime. O PDF final só é retornado quando assinatura RSA, cadeia, política e validação DSS passam.

## Build

```bash
docker build -f services/pades-provider/Dockerfile -t maiocchi/pades-provider:test .
```

Fontes: [DSS](https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/doc/dss-documentation.html), [política AD-RB do ITI](https://www.gov.br/iti/pt-br/assuntos/repositorio/assinatura-digital-com-referencia-basica-ad-rb) e [AC-Raiz](https://www.gov.br/iti/pt-br/assuntos/repositorio/repositorio-ac-raiz).
