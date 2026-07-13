# Auditoria - evidências incorporadas ao PAdES

Data: 13 de julho de 2026.

## Contrato

- Todas as páginas recebem carimbo discreto com `m.`, código público, domínio e paginação.
- Uma página A4 final é acrescentada antes da assinatura PAdES.
- A página contém número do documento, nome do arquivo, total de páginas, hash SHA-256 da entrada, QR, Code 128, logo oficial ICP-Brasil, metadados do ambiente e área reservada à identificação do certificado.
- O provider local e o REST PKI Core posicionam a representação visual na mesma área da última página.
- O CPF é mascarado no provider local. Nome, CPF e horário derivam do certificado, não de texto informado pelo usuário.
- O manifesto pré-assinatura recebe assinatura ML-DSA-65. O código curto incorporado é referência da assinatura completa arquivada e verificável pela chave pública.
- Após o PAdES, um segundo atestado ML-DSA-65 externo cobre hash e tamanho do PDF final, hash do relatório de validação e vínculo ao manifesto incorporado. O verificador separa os dois escopos.
- O SHA-256 do PDF final é calculado após o PAdES e publicado no verificador. Não existe auto-hash embutido.

## Evidências executadas

- Node 24.18/OpenSSL 3.5: 45 testes aprovados, incluindo ML-DSA-65 real; uma integração PostgreSQL executada separadamente.
- PostgreSQL 16: migrações `001` a `005` idempotentes e teste de persistência aprovado.
- Java 21/DSS 6.4: cinco testes Maven aprovados, incluindo identidade ICP-Brasil e geometria do widget.
- PDF real `Relatorio-Inteligencia-Juridica.pdf`: 12 páginas de entrada, 13 páginas após composição; primeira e última páginas renderizadas e inspecionadas.

Execução reproduzível: a suíte Node 24 foi rodada em `node:24.18-alpine`; a integração de banco em `postgres:16`; o Maven em `maven:3.9.11-eclipse-temurin-21-alpine`. O Node 22 do MacBook pula apenas os casos que exigem ML-DSA-65 e PostgreSQL externo; ambos foram executados sem skip nos containers indicados.

## Limite jurídico-técnico

O atestado ML-DSA-65 não é apresentado como assinatura ICP-Brasil. A assinatura jurídica continua PAdES AD-RB segundo a política configurada, e a conferência oficial continua disponível no VALIDAR ITI.
