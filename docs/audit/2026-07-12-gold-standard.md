# Auditoria do padrão ouro - 12 de julho de 2026

## Escopo

Implementação do registro externo de autenticidade para PDF PAdES-ICP-Brasil, folha impressa separada e verificador público.

## Evidência aprovada no repositório

- SHA-256 calculado depois da assinatura, sem mutação posterior do original.
- JSON Schema público, envelope canônico e JWS Ed25519.
- Atestado Ed25519 do adapter vincula workflow, revisão, PDF, relatório e resumo da validação.
- Armazenamento por conteúdo com verificação na leitura e modo `0440`.
- Folha A4 de uma página com ID, hash completo, URL e QR.
- Tabelas separadas para documento, registro, assinatura, hash e evento.
- Identidade, estados e evidências append-only; auditoria encadeada separada das observações públicas não confiáveis.
- Replay idêntico retorna o mesmo ID sob lock de workflow; divergência é conflito.
- Keyring do validador distingue chave ativa, retirada e revogada por janela temporal.
- Original restrito por padrão.
- CORS allowlist, rate limit e rota interna não publicada.
- Comparação local no navegador, sem upload do arquivo.
- Observações anônimas deduplicadas atomicamente por documento, resultado e janela de dez minutos.
- Build Next/VPS e build Worker/Sites aprovados em todas as onze rotas.
- Suíte final: 37 testes aprovados e 1 teste de PostgreSQL ignorado na execução sem banco; o mesmo teste de integração foi executado separadamente e aprovado em PostgreSQL 16.
- Lint aprovado; auditorias `npm` do portal e do `pki-bridge` sem vulnerabilidades conhecidas.

## Revisão adversarial

- A auditoria Mistral declarou ausência de P0, mas seus P1 de traversal e corrida foram rejeitados contra o código e os testes; o CAS foi adicionalmente endurecido com publicação atômica sem substituição.
- A revisão Codex independente não encontrou P0/P1 e reproduziu um P2 de crescimento por observações anônimas.
- O P2 foi fechado por `UNIQUE (document_id, event_type, observation_window)` e `ON CONFLICT DO NOTHING`, além do rate limit já aplicado no Traefik.

## Claims proibidos

- O envelope Ed25519 não é assinatura ICP-Brasil do documento.
- A folha não é o documento eletrônico original.
- O teste unitário não prova conformidade PAdES.
- A detecção do token USB e uma assinatura PKCS#11 não provam PAdES.
- Não há API genérica do VALIDAR ITI implementada ou presumida.

## Gates externos

| Gate | Critério de fechamento |
|---|---|
| Provider PAdES | endpoint, licença, security context e configuração real |
| Documento de homologação | PDF assinado com certificado controlado e preservado por hash |
| Validação independente | provider, Adobe e VALIDAR ITI convergem sobre o mesmo arquivo |
| Política real | OID, AD-RB/AD-RT, DocMDP, cadeia, revogação e tempo registrados |
| Automação DocuSeal | webhook cria workflow e só promove resultado validado |
| LGPD operacional | retenção, contratos, direitos, incidente e restore testados |

Enquanto qualquer gate estiver aberto, o portal pode oferecer a consulta de registros existentes, mas não deve anunciar geração PAdES ICP-Brasil operacional.
