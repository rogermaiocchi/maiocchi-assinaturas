# Retomada fail-closed de ticket PAdES A3

Data: 2026-07-13

## Incidente reproduzido

O ticket privado era marcado como `prepared` antes da confirmação nativa do macOS e da autorização no token A3. Quando a confirmação era cancelada ou expirava, a página mantinha o botão de nova tentativa, mas o endpoint `prepare` aceitava apenas `pending`. A tentativa seguinte terminava em HTTP 409 com `ticket is not pending`.

Não houve assinatura parcial nem liberação de documento: o PDF final continuou indisponível, conforme o comportamento fail-closed esperado.

## Correção

- O provider passou a expor uma operação interna autenticada de retomada da sessão ainda válida.
- O bridge aceita `prepare` para ticket `prepared` somente quando o certificado apresentado possui o mesmo SHA-256 já vinculado.
- A tarefa retomada deve coincidir com o ticket em sessão, hash do PDF de apresentação, fingerprint do certificado e hash dos bytes a assinar.
- Se a sessão do provider expirou ou desapareceu, o bridge prepara uma substituta sobre o mesmo PDF de apresentação e atualiza o ticket por compare-and-swap do identificador anterior.
- A página de evidências, os metadados e o atestado ML-DSA-65 não são regenerados durante a retomada.
- Estados concluídos, expirados ou destinados a outro certificado continuam bloqueados.

## Evidências de validação

- `pki-bridge`: 50 testes, 47 aprovados e 3 skips condicionais no runtime local; zero falhas. Os dois testes PostgreSQL foram executados separadamente no runtime de produção.
- PostgreSQL 16 + Node 24.18: 2 testes de integração aprovados, incluindo compare-and-swap e rejeição de replay.
- Provider Java 21 / DSS 6.4: 6 testes aprovados; zero falhas.
- Imagens locais construídas: `maiocchi/pki-bridge:1.3.1` e `maiocchi/pades-provider:1.1.2`.

## Critério de homologação restante

Repetir a assinatura A3 do PDF de homologação, conferir cobertura integral e integridade com `pdfsig`, extrair o CMS e confirmar a URI canônica da política AD-RB v1.3. A validação oficial no ITI permanece uma transmissão externa separada e deve produzir relatório aprovado.
