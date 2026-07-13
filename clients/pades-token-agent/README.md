# Maiocchi PAdES Token Agent

Agente local macOS para o provider PAdES privado. Ele expõe somente em `127.0.0.1:35100`, aceita origens explicitamente autorizadas e usa `Security.framework` para assinar os bytes preparados pelo motor DSS com uma chave RSA em store externo.

A classificação é fail-closed: o agente só lista chaves com `kSecAttrTokenID`
presente, classe privada, algoritmo RSA, capacidade de assinatura e tamanho de
pelo menos 2048 bits. Chaves comuns do Keychain, Secure Enclave, chaves públicas
e chaves sem esses atributos não ingressam no fluxo. Essa classificação local
prova a origem externa da chave, não a sua conformidade ICP-Brasil; a cadeia e a
política são validadas pelo provider privado antes de liberar a assinatura.

O portal abre a rota local `/v1/authorize` como navegação de primeiro nível. O ticket fica no fragmento da URL, nunca chega ao servidor durante o `GET`, e a cerimônia usa chamadas de mesma origem ao agente. Esse desenho funciona em Safari e Chrome sem depender de mixed content ou Private Network Access; o preflight permanece disponível para clientes autorizados.

O agente nunca recebe nem armazena PIN. A confirmação visual do documento ocorre antes de o CryptoTokenKit solicitar a autorização do token. O preflight também vincula o PID do `launchd`, o listener de `127.0.0.1:35100` e o binário instalado com assinatura de código verificada.

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

O instalador executa o preflight do M5 Max, resolve as dependências fixadas,
compila o release `arm64`, aplica assinatura local ao binário e registra
`br.adv.maiocchi.pades-agent` como `LaunchAgent` com `umask 077`.

Validação explícita do ambiente instalado:

```bash
./scripts/preflight-macos.sh --require-m5-max --require-agent --require-token
```

Para distribuição a terceiros, substitua a assinatura local por Developer ID,
hardened runtime e notarização Apple.
