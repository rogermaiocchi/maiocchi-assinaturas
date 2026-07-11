# Auditoria do portal em produção - 11 de julho de 2026

## Artefato

- Commits assinados: `f6e05bb` e `a6fab52`.
- Imagem: `maiocchi/assinatura-portal:1.2.1`.
- Backup anterior: `20260711T184109Z`, com hashes verificados.
- Rollback: validação seca aprovada antes da publicação.

## Verificações aprovadas

- Build Next.js com 12 páginas estáticas.
- Sete testes automatizados aprovados, incluindo integridade de links internos.
- ESLint e `git diff --check` aprovados.
- Revisão visual desktop e móvel em Chrome; build de produção sem erro próprio no console.
- Rotas públicas, páginas legais e `/healthz` retornando HTTP 200.
- Redirecionamento de `/s/...` para o mesmo caminho no domínio DocuSeal.
- Área de gestão DocuSeal respondendo em `/sign_in`.
- Arquivo-fonte correspondente AGPL disponível publicamente.
- CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy` presentes.
- Container saudável, raiz somente leitura, todas as capabilities removidas e `no-new-privileges` ativo.
- Cadeia GOV.BR indicada pela fonte oficial publicada com SHA-256 `dbf22f7c15ace9c37e6b4141271695a17dc445b5a04c003ced94322ad905879f` e validação de três níveis aprovada.

## Escopo não concluído

Esta publicação conclui o portal institucional e jurídico. Não conclui a assinatura PAdES ICP-Brasil, o retorno criptográfico ao DocuSeal ou o envio SMTP. Esses itens exigem, respectivamente, licença e credenciais Lacuna, certificados reais de homologação e credencial SMTP. Nenhuma chave de demonstração foi utilizada.
