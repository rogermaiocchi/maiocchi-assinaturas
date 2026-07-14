# Baseline de sessão profissional existente

Data: 14/07/2026

## Escopo

Esta baseline registra a correção incremental do portal público `1.14.2`.
DocuSeal `3.0.1-maiocchi.6`, PKI bridge `1.3.17` e PAdES provider `1.2.5`
permanecem sem alteração.

## Defeito observado em produção

- [V] O Chrome utilizado no ensaio já possuía uma sessão DocuSeal válida.
- [V] A consulta `GET /portal-auth/session` recebeu `302` do DocuSeal e foi
  corretamente reconduzida à raiz do portal.
- [V] O frontend tratava a resposta final como se ainda fosse a tela de login,
  tentava extrair um token CSRF da home e exibia a mensagem de falha.
- [V] Uma requisição sem cookie retornou `200`, formulário de login, formulário
  de certificado e tokens CSRF válidos. O backend não estava indisponível.

## Correção

O componente `app/lawyer-access.tsx` agora centraliza a verificação da resposta
autenticada. O sucesso exige simultaneamente:

1. redirecionamento HTTP efetivo;
2. status final bem-sucedido;
3. destino na mesma origem do portal; e
4. caminho final `/` ou `/dashboard`.

Essa condição é aplicada tanto ao bootstrap da sessão quanto às respostas de
login. Uma sessão já válida abre imediatamente o estado "Acesso confirmado",
sem procurar CSRF ou repetir a autenticação.

## Evidência local

- [V] Next.js/TypeScript: build estático de 13 rotas aprovado.
- [V] Workspace: 64 testes, zero falhas; três integrações PKI foram ignoradas no
  runtime local sem PostgreSQL/ML-DSA e já possuem validação isolada anterior.
- [V] ESLint: zero erros.
- [V] Imagem `maiocchi/assinatura-portal:1.14.2`:
  `sha256:c9e85f5911106ebca3f78f4dfaee423e7d9dae3c94099d46bdfe791c095864af`.
- [V] Runtime da imagem: saudável, usuário `101`, filesystem somente leitura,
  `cap_drop=ALL` e `no-new-privileges`.
- [V] Revisão OCI:
  `475d92b9278ccc5e96f5fc5db3e29f7c512cb188`.

## Cadeia de suprimentos

- [V] SBOM CycloneDX gerado com Syft `1.46.0`.
- [V] Grype `0.115.0`: zero Critical, zero High, três Medium e nenhuma correção
  disponível.
- [V] Os hashes do SBOM e do relatório Grype integram
  `compliance/SHA256SUMS`.

## Critério de promoção

A correção só será declarada operacional após tag assinada, build x86_64 na
VPS, implantação, reprodução visual do estado de sessão existente e novo
ensaio mTLS em janela sem cookies. O último ensaio é indispensável para separar
o comportamento da sessão do uso real do token A3.
