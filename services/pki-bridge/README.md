# pki-bridge

Camada de integração entre o workflow DocuSeal e o REST PKI Core. O código não incorpora o projeto de demonstração da Lacuna; ele implementa somente os contratos documentados no OpenAPI oficial.

## Estado operacional

O provider é fail-closed. Sem endpoint HTTPS, API key, security context e licença Web PKI contratados, a integração deve permanecer desabilitada. Credenciais de exemplo são proibidas.

## Contratos implementados

- Preparação de assinatura PDF em `POST /api/signature`.
- Conclusão em `POST /api/signature/completion`.
- Inspeção e validação em `PUT /api/signature-inspection`.
- Webhook `submission.completed` normalizado e identificado por hash idempotente.
- Máquina de estados que impede conclusão fora de ordem.

O download temporário retornado pelo REST PKI Core só é aceito no mesmo host HTTPS do endpoint configurado. A URL nunca é persistida como evidência; o arquivo deve ser baixado imediatamente, ter seu hash calculado e ser armazenado pelo serviço.

## Teste

```bash
npm run test:pki
```

Fontes técnicas: OpenAPI do REST PKI Core 4.3.1 e commit `c7acac06` do `LacunaSoftware/PkiSuiteSamples`, consultados em 11 de julho de 2026.
