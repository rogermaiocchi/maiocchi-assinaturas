# Validação 1.0.1

Data: 15 de julho de 2026.

## Resultado automatizado

- 10 testes de protocolo aprovados;
- Manifest V3, CSP, permissões mínimas e identidade fixa auditados;
- bundles sem `eval`, `new Function`, código remoto ou source maps;
- empacotamento determinístico, validado por duas gerações consecutivas;
- ZIP SHA-256:
  `7352cfe3138d9d2c8fd875efff587f12074323df0dd28c2a149b9f655febdaed`.

## Smoke test real

- navegador: Chromium controlado pelo Playwright;
- extensão carregada com ID `cbikodnffamnfjoaobfpacilcfilmjlh`;
- portal oficial reconheceu a presença do content bridge;
- popup confirmou agente disponível;
- agente macOS `1.2.3`, `CryptoTokenKit`, `arm64`, respondeu `status=ok`;
- um certificado externo RSA elegível foi detectado no token físico;
- a autorização foi aberta em `127.0.0.1:35100` com ticket apenas no fragmento;
- o fragmento foi removido do histórico após a ingestão local.

Após o endurecimento da versão `1.0.1`, o comando `npm run smoke:agent`
revalidou a origem fixa da extensão, o agente `1.2.3`, a política
`external-store-rsa-2048-fail-closed` e a presença de um certificado externo
elegível, sem expor dados do titular ou o conteúdo do certificado.

Essa validação comprova o bridge no macOS. Windows/CNG e Linux/PKCS#11 têm
compilação e testes automatizados próprios, mas exigem hardware real em cada
sistema para homologação operacional final.
