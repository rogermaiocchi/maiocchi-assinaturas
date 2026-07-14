# Redesenho institucional do portal de assinatura

Data: 2026-07-14
Escopo: home, assinatura PAdES e formulário público DocuSeal

## Evidência de origem

- [V] O portal institucional interno foi inspecionado na VPS em `/opt/portal-maiocchi`.
- [V] A referência usa fotografia editorial em tela inteira, fade inferior para `#F5F5F7`, cabeçalho translúcido, tipografia de alta hierarquia e acento `#FFB800`.
- [V] O fluxo PAdES conserva os endpoints e o ticket em fragmento já existentes.
- [V] O fork DocuSeal de produção corresponde aos arquivos do pacote-fonte publicado em `public/codigo-fonte/docuseal-maiocchi-3.0.1.tar.gz` nas superfícies alteradas.
- [V] O Sites reutiliza o projeto existente `maiocchi-assinaturas`; nenhum novo projeto foi criado.
- [V] A invocação `claude --model claude-fable-5` foi tentada com o briefing auditável, mas a CLI respondeu `Not logged in`. O erro e o briefing estão na trilha privada de auditoria do MacBook.
- [V] O estado anterior da VPS foi preservado no backup `20260714T041637Z`, com seis artefatos validados por SHA-256.

## Direção consolidada

1. Preservar como sinais do visual anterior somente a marca compacta `m.` e a barra superior.
2. Usar a fotografia institucional real como primeiro sinal do portal, sem blur e com shade localizado apenas para legibilidade.
3. Manter o primeiro viewport operacional: título, acesso por link/código e atalhos para validação e advogados.
4. Organizar o restante em bandas contínuas, evitando seções apresentadas como cartões flutuantes.
5. Tratar login, validação e assinatura como ferramentas enquadradas, com raio máximo de 8 px e estados explícitos.
6. Aplicar a mesma paleta, densidade, foco e comportamento responsivo no Next e no DocuSeal.

## Arquitetura aplicada

### Home

- Hero editorial com acesso por link/código integrado.
- Barra operacional de três destinos: assinar, validar e gerenciar.
- Área dos advogados incorporada, sem página intermediária.
- Validador Maiocchi seguido do VALIDAR ITI sob divulgação progressiva e fallback externo.
- Fluxo único, modalidades jurídicas e central de ajuda em bandas distintas.

### PAdES

- Masthead institucional reduzido.
- Cabeçalho de estado, progresso em três etapas e duas áreas funcionais: identidade do documento e ação de assinatura.
- Estados contemplados: carregamento, ticket inválido, pendente, remoto, token local, ambos, falha e concluído.
- Endpoints, formato do ticket, coleta opcional de localização e download final permanecem inalterados.

### DocuSeal

- Cabeçalho sticky de largura total com `m.`, título truncável, menu por ícones e ações do documento.
- Documento em superfície neutra, painel inferior com borda dourada e controles com raio de 8 px.
- IDs, hooks, teleports, eventos Vue e ações Rails permanecem inalterados.
- Alteração reproduzível em `patches/docuseal/0002-institutional-signing-window.patch` e no pacote-fonte publicado.

## Critérios de aceite

- [x] Build Next e suíte completa sem falhas.
- [x] HTML estático contém hero, login, validador, iframe/fallback ITI e footer legal.
- [ ] DocuSeal compila a partir do pacote-fonte e inicializa saudável.
- [x] Nenhum endpoint, ticket, CSRF, CSP ou rota Traefik foi alterado pelo redesenho.
- [x] Desktop 1440 x 900, iPad 1024 x 1366 e iPhone 390 x 844 sem overflow ou sobreposição.
- [x] Menu móvel, foco visível, alvos principais de toque e reduced motion verificados.
- [ ] Sites recebe versão privada do mesmo commit publicado.
- [ ] VPS recebe imagens versionadas e mantém backup anterior para rollback.

## Validação local

- `npm run lint`: aprovado.
- `npm test`: 63 testes, 60 aprovados e 3 skips condicionais esperados.
- Imagem `maiocchi/assinatura-portal:1.12.0`: build aprovado.
- Patch DocuSeal: aplicação seca aprovada sobre a fonte original.
- Navegador isolado: seis cenários aprovados para home e PAdES nos três viewports; nenhum overflow, erro de página ou estado permissivo sem ticket.
- Capturas integrais de home e PAdES foram preservadas na trilha privada de auditoria.

## Rollback

- Portal: restaurar a imagem anterior declarada no compose da VPS.
- DocuSeal: restaurar `maiocchi/docuseal:3.0.1-maiocchi.2`.
- Dados: não há migração de banco neste redesenho; volumes e schema permanecem intocados.
