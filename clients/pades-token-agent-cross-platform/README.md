# Maiocchi PAdES Token Agent (Windows e Linux)

Host nativo para assinatura externa A3 do portal `assinatura.maiocchi.adv.br`.
Ele mantém a chave privada no dispositivo, recebe somente os bytes preparados
pelo provider PAdES e devolve uma assinatura RSA-SHA256 vinculada ao ticket.

O macOS usa o agente Swift/CryptoTokenKit no diretório irmão
`clients/pades-token-agent`. Este binário Rust atende Windows e Linux com o
mesmo contrato HTTP local:

- `GET /v1/authorize`
- `GET /v1/status`
- `GET /v1/certificates`
- `POST /v1/sign`

## Matriz de provider

| Sistema | Provider | Evidência local exigida |
| --- | --- | --- |
| Windows 10/11 | Certificate Store `CurrentUser/MY` + CNG | hardware CNG com propriedade de smart card (`SmartCardReader` ou `SmartCardGuid`), RSA >= 2048 bits |
| Linux | p11-kit proxy ou módulo PKCS#11 registrado | slot de hardware removível, login e caminho protegido, objeto privado no token, RSA >= 2048 bits e `CKM_SHA256_RSA_PKCS` |

No Windows, o middleware da autoridade certificadora registra o certificado e
o KSP; o CNG apresenta a interface de PIN. No Linux, o middleware deve estar
registrado no p11-kit e oferecer `CKF_PROTECTED_AUTHENTICATION_PATH`. Se o
driver exigir que a aplicação receba o PIN em texto, o agente encerra a
operação: PIN não entra em HTTP, JavaScript, log ou memória gerenciada pelo
portal.

## Limites de segurança

- listener fixo em `127.0.0.1:35100`;
- validação exata de `Host`, `Origin` e Fetch Metadata;
- ticket no fragmento da URL, removido do histórico antes das chamadas;
- validade criptográfica máxima de 190 segundos;
- proteção persistente contra replay por `sessionId`, preservada após reinício;
- confirmação nativa explícita antes de cada assinatura;
- descoberta automática, mas nunca assinatura automática;
- nenhuma chave, PIN ou certificado privado é enviado à VPS;
- cadeia e conformidade ICP-Brasil são validadas novamente pelo provider DSS.

Não há LLM ou agente de IA no caminho criptográfico. A seleção é uma política
binária e auditável; IA introduziria comportamento não determinístico sem
resolver acesso ao hardware.

## Desenvolvimento

```bash
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
cargo build --release
```

Instalação Linux por usuário:

```bash
./scripts/install-linux.sh
```

Instalação Windows em PowerShell, usando um binário assinado:

```powershell
.\scripts\install-windows.ps1 -BinaryPath .\target\release\maiocchi-pades-token-agent.exe
```

`-AllowUnsigned` existe somente para laboratório. Pacotes distribuídos devem
usar Authenticode no Windows e assinatura do repositório/pacote da distribuição
no Linux.

## Dependências externas reais

O agente não substitui o middleware do fabricante do token. O usuário ainda
precisa do driver/KSP/PKCS#11 da autoridade certificadora, como ocorre com
PJeOffice. Para certificado remoto, o fluxo é diferente: redirecionamento ao
PSC/autoridade emissora, sem este agente local.

Referências técnicas primárias:

- [Microsoft: CryptAcquireCertificatePrivateKey](https://learn.microsoft.com/windows/win32/api/wincrypt/nf-wincrypt-cryptacquirecertificateprivatekey)
- [Microsoft: NCryptSignHash](https://learn.microsoft.com/windows/win32/api/ncrypt/nf-ncrypt-ncryptsignhash)
- [p11-kit: módulos configurados](https://p11-glue.github.io/p11-glue/p11-kit/manual/p11-kit-Modules.html)
- [p11-kit: formato de configuração](https://p11-glue.github.io/p11-glue/p11-kit/manual/pkcs11-conf.html)
- [ITI: certificação digital](https://www.gov.br/iti/pt-br/acesso-a-informacao/perguntas-frequentes/certificacao-digital)
