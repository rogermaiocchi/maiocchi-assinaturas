# Proveniência técnica

Esta implementação foi revisada contra projetos maduros e preserva apenas os
padrões compatíveis com sua superfície mínima. Não incorpora binários ou
dependências criptográficas desses projetos.

| Projeto | Revisão consultada | Licença | Padrão adotado |
| --- | --- | --- | --- |
| `web-eid/web-eid-webextension` | `8f9260bce52cb177730e468cb8642e8d0db9e02b` | MIT | validação da proveniência da mensagem, separação página/content/background e timeout do bridge |
| `GoogleChrome/chrome-extensions-samples` | `c4393862e164d74d1b6112ced19f2a2bbe26506c` | Apache-2.0/BSD-style nos exemplos | Manifest V3, identidade estável e ciclo do service worker |
| `browserpass/browserpass-extension` | `abf70278ada7e770f0091a0296f4dd94650b4dbd` | ISC | chave pública estável no manifest e CSP explícita |

`open-eid/chrome-token-signing` foi estudado somente como referência histórica
de fail-closed por origem. O projeto está deprecated e nenhum trecho LGPL foi
copiado para esta extensão.
