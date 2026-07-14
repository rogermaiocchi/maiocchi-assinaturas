# Plano de unificacao do portal de assinatura

Data: 11 de julho de 2026.

## Direcao

Unificar as superficies hoje publicadas em `assinatura.maiocchi.adv.br` e `documentos.assinatura.maiocchi.adv.br` em um unico portal no dominio `assinatura.maiocchi.adv.br`, sem duplicacao de conteudo, pagina, fluxo, acesso ou funcao. O resultado deve manter o DocuSeal como motor documental, preservar links ja enviados, manter o codigo correspondente AGPL acessivel e apresentar uma experiencia minimalista, una, funcional e intuitiva.

O nome publico do escritorio permanece **Maiocchi Advogado**. O único canal institucional e transacional é `roger@maiocchi.adv.br`.

## Estado validado

- `assinatura.maiocchi.adv.br` e `documentos.assinatura.maiocchi.adv.br` resolvem para `147.93.68.202`.
- `https://assinatura.maiocchi.adv.br/` retorna HTTP 200 pelo container `assinatura-portal`, imagem `maiocchi/assinatura-portal:1.3.0`.
- `https://documentos.assinatura.maiocchi.adv.br/` retorna HTTP 200 pelo container `docuseal`, imagem `maiocchi/docuseal:3.0.1-maiocchi.1`.
- O Traefik publica `Host(assinatura.maiocchi.adv.br)` para `assinatura-portal` e `Host(documentos.assinatura.maiocchi.adv.br)` para `docuseal`.
- No dominio principal, `/sign_in`, `/up` e `/packs/...` retornam 404.
- No subdominio `documentos`, `/sign_in`, `/up` e `/packs/...` retornam 200.
- No dominio principal, `/s/...`, `/d/...`, `/e/...` e `/p/...` ainda retornam 308 para o subdominio `documentos`.
- O DocuSeal esta configurado com origem publica no subdominio `documentos`; mesmo recebendo `Host: assinatura.maiocchi.adv.br`, ainda gera `canonical` e `og:url` com `https://documentos.assinatura.maiocchi.adv.br`.
- A tela de login do DocuSeal ainda exibe `Roger Maiocchi, advogado` e placeholder de e-mail `admin@maiocchi.adv.br`.
- O portal publico usa `Maiocchi Advogado`, `roger@maiocchi.adv.br`, fluxos visuais e paginas legais; não publica página, menu ou pacote de código-fonte.
- O `pki-bridge` existe como camada fail-closed e nao precisa ser ativado para a unificacao de dominio.

## Decisao arquitetural

Adotar roteamento path-based no Traefik, mantendo o DocuSeal em seus paths nativos no mesmo host principal. Nao montar inicialmente o DocuSeal sob `/documentos`, porque isso exigiria alterar a base path Rails e aumentaria o risco de quebra de assets, CSRF, cookies e links ja gerados.

Arquitetura alvo:

```text
assinatura.maiocchi.adv.br
  /, /assinaturas-eletronicas, /assinatura-gov-br, /certificacao-digital,
  /validar, /seguranca, /ajuda, /privacidade, /termos
    -> assinatura-portal

  /sign_in, /sign_out, /password, /invitation, /dashboard, /setup,
  /users, /user_signature, /user_initials, /submissions, /submitters,
  /templates, /folders, /settings, /account_configs, /api, /packs,
  /file, /blobs, /representations, /disk, /direct_uploads, /preview,
  /s, /d, /e, /p, /certificate_auth, /verify_pdf_signature, /mfa_setup,
  /webhook_secret, /webhook_hmac, /webhook_preferences, /timestamp_server,
  /mcp, /js, /up, /manifest
    -> docuseal

documentos.assinatura.maiocchi.adv.br/*
    -> 301 https://assinatura.maiocchi.adv.br/$1
```

O router do DocuSeal deve ter prioridade maior que o router catch-all do portal. O portal deve remover redirecionamentos Nginx para o subdominio antigo.

## Plano de execucao

### Fase 0 - baseline e backup

1. Criar tag Git `pre-unificacao-portal-YYYYMMDD`.
2. Executar backup privado na VPS: portal, DocuSeal config, dump PostgreSQL, Traefik dynamic config e hashes SHA-256.
3. Exportar configuracao efetiva:
   - `docker compose config` do portal;
   - `docker compose config` do DocuSeal;
   - arquivo dinamico Traefik;
   - `docker exec -w /app docuseal bin/rails routes`.
4. Registrar snapshot HTTP dos dois hosts antes da mudanca.

### Fase 1 - rotas e proxy

1. Atualizar `deploy/traefik-assinatura.yml`:
   - adicionar router `docuseal-main-paths` para `Host(assinatura.maiocchi.adv.br)` com `PathPrefix` das rotas reais do DocuSeal;
   - configurar prioridade maior que `assinatura-portal`;
   - manter security headers;
   - converter o router `maiocchi-documents` em redirect permanente 301 para o mesmo path no dominio principal.
2. Atualizar `nginx.conf` do portal:
   - remover o redirect 308 de `/s`, `/d`, `/e`, `/p` para `documentos`;
   - manter 404 padronizado para rotas que nao pertencam ao portal nem ao DocuSeal.
3. Manter `/legal/LICENSE.txt` acessivel no domínio principal. A oferta de fonte correspondente fica restrita às interfaces interativas do motor AGPL.

### Fase 2 - origem e identidade DocuSeal

1. Atualizar ambiente do DocuSeal:
   - `HOST=assinatura.maiocchi.adv.br`;
   - `APP_URL=https://assinatura.maiocchi.adv.br`;
   - `EMAIL_HOST=assinatura.maiocchi.adv.br`;
   - `CERTIFICATE_AUTH_APP_HOST=assinatura.maiocchi.adv.br`;
   - `MAIOCCHI_HOME_URL=https://assinatura.maiocchi.adv.br`;
   - `MAIOCCHI_SOURCE_URL` aponta para o pacote imutável correspondente à imagem DocuSeal implantada;
   - `MAIOCCHI_LICENSE_URL=https://assinatura.maiocchi.adv.br/legal/LICENSE.txt` ou rota equivalente validada.
2. Atualizar identidade renderizada pelo DocuSeal para `Maiocchi Advogado`.
3. Trocar placeholder, textos de suporte e comunicacoes para `roger@maiocchi.adv.br`.
4. Executar alteracoes de banco por script idempotente e auditavel quando a identidade estiver armazenada em tabelas como usuarios, conta, configuracoes ou personalizacao.
5. Reiniciar Puma/worker e limpar cache se canonical ou OG permanecerem no subdominio antigo.

### Fase 3 - portal publico

1. Alterar `NEXT_PUBLIC_DOCUMENTS_URL` para origem relativa no dominio principal.
2. Alterar `NEXT_PUBLIC_LAWYERS_URL` para `/sign_in`.
3. Ajustar `accessDocument()` para enviar `/s`, `/d`, `/e`, `/p` diretamente no mesmo host.
4. Atualizar README, testes e documentacao que ainda tratam `documentos.assinatura...` como superficie funcional.
5. Manter o conteudo juridico e educativo somente nas paginas publicas do portal; o DocuSeal deve concentrar apenas operacao documental.

### Fase 4 - homologacao local e staging na VPS

1. Subir stack com Traefik local ou usar a VPS em janela controlada com backup pronto.
2. Validar com `curl`, navegador e inspeção de HTML:
   - raiz do portal;
   - login DocuSeal;
   - assets Rails em `/packs`;
   - assets Next em `/_next`;
   - rotas de assinatura `/s`, `/d`, `/e`, `/p`;
   - rotas administrativas `/dashboard`, `/templates`, `/submissions`, `/settings`;
   - rotas de arquivos `/file`, `/blobs`, `/representations`, `/disk`;
   - `canonical`, `og:url`, marca e e-mail.
3. Criar submissao de teste no DocuSeal, abrir link de signatario em janela anonima, concluir fluxo simples e baixar documento final.
4. Validar que emails gerados usam links no dominio principal e contato `roger@maiocchi.adv.br`.

### Fase 5 - deploy e monitoramento

1. Aplicar Traefik, DocuSeal env e portal em deploy atomico.
2. Validar healthchecks imediatamente.
3. Monitorar por 48 horas:
   - 404/5xx no Traefik;
   - erros Rails;
   - asset 404;
   - falhas de login;
   - links antigos redirecionados;
   - mensagens de e-mail enviadas com URL antiga.
4. Manter o subdominio `documentos` como redirect permanente por pelo menos 24 meses, porque links de assinatura podem sobreviver em e-mails antigos.

## Predicados de aceite

- `GET https://assinatura.maiocchi.adv.br/` retorna HTTP 200 com o portal publico.
- `GET https://assinatura.maiocchi.adv.br/sign_in` retorna HTTP 200 com a tela DocuSeal.
- `GET https://assinatura.maiocchi.adv.br/up` retorna HTTP 200 do DocuSeal.
- `GET https://assinatura.maiocchi.adv.br/packs/css/application-*.css` retorna HTTP 200.
- `GET https://assinatura.maiocchi.adv.br/_next/static/...` retorna HTTP 200.
- `GET https://documentos.assinatura.maiocchi.adv.br/sign_in` retorna 301 para `https://assinatura.maiocchi.adv.br/sign_in`.
- `GET https://documentos.assinatura.maiocchi.adv.br/s/<token>` retorna 301 para `https://assinatura.maiocchi.adv.br/s/<token>`.
- `GET https://assinatura.maiocchi.adv.br/s/<token-valido>` abre o fluxo de assinatura sem redirecionar para `documentos`.
- O HTML do DocuSeal nao contem `documentos.assinatura.maiocchi.adv.br`.
- O HTML do DocuSeal contem `Maiocchi Advogado`.
- O HTML do DocuSeal nao contem `Roger Maiocchi, advogado`.
- O HTML do DocuSeal nao contem `admin@maiocchi.adv.br`.
- O portal estatico compilado nao contem `documentos.assinatura.maiocchi.adv.br`.
- `/codigo-fonte/` e qualquer pacote sob esse caminho não são publicados pelo portal.
- Cada interface interativa do DocuSeal oferece uma única atribuição com a fonte correspondente, no limite exigido pela AGPL; e-mails e menus editoriais não repetem o vínculo.
- Nenhum segredo aparece em arquivos versionados, labels Traefik, logs de deploy ou HTML publico.

## Riscos e controles

| Risco | Impacto | Controle |
|---|---|---|
| Router do portal capturar rota DocuSeal | Alto | Prioridade Traefik maior para DocuSeal e smoke tests por path |
| Colisao de paths entre Next e Rails | Alto | Auditoria de rotas antes do deploy; portal cede rotas funcionais ao DocuSeal |
| Canonical/OG continuar em `documentos` | Medio | Trocar `APP_URL`, reiniciar app, limpar cache e validar HTML |
| Links antigos quebrados | Alto | Redirect 301 permanente preservando path e query |
| Assets Rails 404 | Alto | Incluir `/packs`, `/manifest`, favicons e rotas ActiveStorage no router DocuSeal quando necessario |
| Sessao/CSRF invalida apos troca de host | Medio | Janela curta de manutencao, reinicio completo e aceite de novo login |
| E-mail com remetente ou URL antiga | Alto | Teste real de envio e varredura de templates/configuracoes |
| AGPL descumprida | Alto | Manter link visivel para codigo correspondente e licenca |
| Rollback exigir banco | Medio | Alteracoes idempotentes e SQL reverso pronto |
| Ativacao acidental de PKI nao homologada | Alto | Manter `pki-bridge` e Lacuna fail-closed ate licenca, credenciais e homologacao |

## Rollback

Gatilho: falha em login, assinatura, assets, canonical, redirect antigo, download final ou codigo-fonte.

1. Reaplicar Traefik anterior: `Host(documentos)` volta a apontar para `docuseal`; `Host(assinatura)` volta a apontar somente para `assinatura-portal`.
2. Restaurar `HOST`, `APP_URL`, `EMAIL_HOST` e `CERTIFICATE_AUTH_APP_HOST` do DocuSeal para o subdominio anterior.
3. Restaurar build do portal com links antigos somente se necessario.
4. Executar SQL reverso de identidade apenas se a troca de e-mail/nome impedir operacao.
5. Validar `https://documentos.assinatura.maiocchi.adv.br/sign_in` HTTP 200, `https://assinatura.maiocchi.adv.br/` HTTP 200 e `/s/...` no dominio principal voltando ao redirect antigo.

## Resultado esperado

Ao final, o usuario percebe apenas `assinatura.maiocchi.adv.br`. O portal publico orienta, explica e recebe links/codigos. O DocuSeal executa os fluxos documentais no mesmo dominio. O subdominio antigo deixa de ser uma segunda superficie e passa a existir apenas como compatibilidade por redirect. A operacao PKI futura permanece separada por fronteira tecnica e somente sera apresentada como ativa quando os gates de licenca, homologacao e validacao estiverem verdes.
