# Threat model do portal de assinaturas

## Ativos

- documentos originais e assinados;
- manifestação de vontade e trilha de eventos;
- chaves públicas, certificados e relatórios;
- links de signatários e sessões PKI;
- credenciais administrativas e de integração;
- banco DocuSeal e banco do `pki-bridge`;
- código correspondente e cadeia de suprimentos.

Chave privada, PIN e senha do certificado do signatário não são ativos do portal porque não podem ingressar no sistema.

## Fronteiras de confiança

1. navegador do signatário para Traefik;
2. Traefik para DocuSeal e `pki-bridge`;
3. DocuSeal para `pki-bridge` por webhook/API;
4. Web PKI local para provider Lacuna;
5. aplicações para PostgreSQL e armazenamento;
6. VPS para e-mail e monitoramento;
7. portal para serviços oficiais GOV.BR/ITI.

## Ameaças e controles

| Ameaça | Controle obrigatório | Teste |
|---|---|---|
| Link de signatário roubado | expiração, uso único, step-up conforme modalidade | reutilização e troca de workflow |
| Webhook forjado | HMAC, allowlist de eventos, janela temporal | assinatura ausente/incorreta |
| Replay | UUID e idempotency key persistidos | mesmo evento duas vezes |
| Corrida entre callbacks | versão otimista e transação | duas conclusões simultâneas |
| PDF alterado | hash, storage imutável, `ByteRange` e validação final | byte alterado após assinatura |
| Hash injetado no PDF final | proibição arquitetural; hash fica no envelope e na folha separada | salvar novamente o PDF e demonstrar divergência |
| QR ou ID substituído no papel | exibir ID e hash completos; HTTPS; envelope Ed25519 | QR de outro documento e comparação textual |
| Envelope adulterado | JWS Ed25519, JSON canônico e chave histórica por `keyId` | alteração de qualquer campo |
| Chave pública substituída | arquivo fora da imagem, publicação histórica, rotação documentada e monitoramento | chave divergente do fingerprint de release |
| Enumeração de documentos | IDs com 80 bits úteis, rate limit e resposta uniforme | varredura e throttling |
| Exposição do original pelo QR | `restricted` por padrão e autorização separada | acesso anônimo a `/original/:id.pdf` |
| Upload involuntário na comparação | hash no `crypto.subtle` local; endpoint recebe só match/mismatch | inspeção de rede com PDF selecionado |
| Flood de observações públicas | rate limit, payload de 1 KiB, tabela não probatória e amostra única por documento/resultado a cada dez minutos | carga sustentada e corpo excessivo |
| Quebra da trilha de verificação | hash do evento anterior e lock transacional por documento | alteração, remoção e corrida concorrente |
| Replay de registro | chave determinística do pacote, lock por workflow e conflito em divergência | duas chamadas simultâneas e reenvio após timeout |
| Cadeia não confiável | security context explícito, revogação e política | expirado, revogado, cadeia incompleta |
| Adapter forja resultado | atestado Ed25519 sobre hashes e resumo; chave privada isolada do pki-bridge | resumo alterado, relatório trocado e chave desconhecida |
| Chave antiga assina novo pacote | manifesto temporal com active/retired/revoked e `issuedAt` | atestado fora da janela ou chave retirada |
| Trust store confundido | stores separados para PDF, mTLS e testes | raiz GOV.BR recusada em mTLS |
| Upload hostil | limite, magic bytes, parser isolado e antivírus | PDF malformado/protegido/grande |
| Exposição de segredo | cofre, egress gate e scan de repo/imagem/log | padrões de segredo bloqueados |
| Exposição por e-mail | apenas link, sem anexo/documento | inspeção de mensagens |
| Escalada administrativa | menor privilégio, MFA e auditoria | autorização por papel |
| Dependência comprometida | lockfile, digest, SBOM e scan | CI de supply chain |
| Indisponibilidade Lacuna | timeout, circuit breaker e estado retomável | falha e recuperação do provider |
| Exclusão indevida | retenção, legal hold e confirmação | restore e trilha de descarte |

## Ações irreversíveis protegidas

- migração ou restore de banco;
- troca do download final;
- ativação do provider Lacuna;
- troca ou rotação da chave Ed25519 do envelope;
- mudança de `restricted` para `public` no original;
- ativação de mTLS;
- importação de trust anchors;
- publicação de alegação de assinatura avançada/qualificada;
- descarte de documento e backup.

Todas exigem feature flag, backup validado, evidência de homologação e rollback documentado.

## Logs

Os logs usam identificadores opacos e correlação. Não registram documento, código de acesso, assinatura, certificado completo, CPF extraído, token, HMAC, cookie, chave API, senha ou PIN. A trilha pública de autenticidade também não registra IP ou user agent.
