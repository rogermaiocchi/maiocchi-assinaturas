# Maiocchi PAdES Token Agent

Agente local macOS para o provider PAdES privado. Ele expõe somente em `127.0.0.1:35100`, aceita origens explicitamente autorizadas e usa `Security.framework` para assinar os bytes preparados pelo motor DSS com uma chave A3 não exportável.

O portal abre a rota local `/v1/authorize` como navegação de primeiro nível. O ticket fica no fragmento da URL, nunca chega ao servidor durante o `GET`, e a cerimônia usa chamadas de mesma origem ao agente. Esse desenho funciona em Safari e Chrome sem depender de mixed content ou Private Network Access; o preflight permanece disponível para clientes autorizados.

O agente nunca recebe nem armazena PIN. A confirmação visual do documento ocorre antes de o CryptoTokenKit solicitar a autorização do token.

```bash
swift build -c release
MAIOCCHI_ALLOWED_ORIGINS=https://assinatura.maiocchi.adv.br swift run maiocchi-pades-agent
```

Rotas locais:

- `GET /v1/status`
- `GET /v1/certificates`
- `POST /v1/sign`

O serviço deve ser empacotado e assinado com Developer ID antes de distribuição. A aplicação não deve ser iniciada por navegador, script remoto ou conteúdo não autenticado.

## Instalação neste MacBook

```bash
./scripts/install-macos.sh
```

O instalador compila em modo release, aplica assinatura local ao binário e registra `br.adv.maiocchi.pades-agent` como `LaunchAgent`. Para distribuição a terceiros, substitua a assinatura local por Developer ID, hardened runtime e notarização Apple.
