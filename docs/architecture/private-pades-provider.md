# Provider PAdES privado

```mermaid
sequenceDiagram
    participant D as DocuSeal/operador
    participant B as pki-bridge
    participant W as Navegador
    participant A as Agente Swift
    participant T as Token A3
    participant P as DSS PAdES

    D->>B: PDF congelado (canal interno autenticado)
    B-->>W: link com ticket no fragmento
    W->>A: navegação de primeiro nível (ticket no fragmento)
    A-->>W: cerimônia local com CSP
    W->>A: certificados públicos (mesma origem)
    W->>B: preparar + certificado + cadeia (HTTPS)
    B->>P: PDF + certificado + política AD-RB
    P-->>B: DTBS + sessão curta
    B-->>W: tarefa vinculada a hashes
    W->>A: tarefa de assinatura
    A->>T: RSA-SHA256 após confirmação/PIN
    T-->>A: assinatura
    A-->>W: valor RSA
    W->>B: concluir
    B->>P: sessão + assinatura
    P->>P: montar e validar PAdES
    P-->>B: PDF + relatório confiável
    B-->>W: download do PDF validado
```

## Contratos

O endpoint interno `POST /internal/pades/tickets` recebe PDF e nome sob o mesmo HMAC usado pelas integrações internas. As rotas públicas `/api/pades/ticket`, `/prepare`, `/complete` e `/result` exigem o ticket em `Authorization: Bearer`.

O agente local expõe `/v1/authorize`, `/v1/status`, `/v1/certificates` e `/v1/sign`. O portal navega para `/v1/authorize#ticket=...`; por ser fragmento, o ticket não integra o `GET`, logs ou cabeçalho `Referer`. A página local usa CSP restritiva, acessa o agente em mesma origem e chama o bridge remoto somente por HTTPS. Assim Safari e Chrome não dependem de mixed content ou Private Network Access para a cerimônia.

O corpo assinado contém sessão, DTBS, algoritmo, fingerprint, hash/nome do documento e expiração. A assinatura aceita é RSA PKCS#1 v1.5 com SHA-256, compatível com o certificado A3 validado no MacBook.

## Gates de produção

1. Política AD-RB v1.3 e SHA-256 devem coincidir com o ITI.
2. Apenas raízes ICP-Brasil vigentes podem integrar a trust store.
3. A cadeia do signatário deve terminar em uma dessas raízes e revogação deve ser conclusiva.
4. O PDF final deve conter a política esperada e passar no DSS.
5. O mesmo arquivo deve passar no VALIDAR ITI em ensaio de homologação.
6. O agente distribuído deve possuir assinatura Developer ID e notarização; a instalação local do MacBook pode usar assinatura local controlada.
