# Padrão operacional do MacBook

Este documento registra o procedimento canônico para desenvolver e operar o portal de assinaturas a partir do MacBook primário.

## Identidade e comunicação

- Nome oficial: **Maiocchi Advogado**.
- E-mail único do portal: `roger@maiocchi.adv.br`.
- Responsável profissional: Roger Maiocchi, OAB/DF 31.249.
- Textos não devem atribuir ao DocuSeal assinatura qualificada nem apresentar homologação por Lacuna, PJeOffice, CNJ ou ITI sem evidência documental específica.

## Acesso e segredos

- A VPS deve ser acessada pelo alias SSH `hostinger-vps`; endereço, usuário e chave permanecem na configuração SSH local.
- Senhas, PINs, chaves privadas, tokens e credenciais SMTP ou Lacuna nunca entram no Git, em logs ou em documentação.
- Segredos operacionais ficam no Keychain ou no mecanismo de secrets da VPS e são injetados somente no processo que os utiliza.

## Ciclo obrigatório

1. Confirmar `git status` e preservar mudanças preexistentes.
2. Executar `scripts/backup-vps.sh` antes de alterar produção.
3. Validar `npm test`, `npm run lint` e `git diff --check`.
4. Revisar desktop e viewport móvel no build de produção.
5. Criar commit assinado com escopo explícito.
6. Publicar uma tag imutável de imagem, sem reutilizar tags anteriores.
7. Verificar container saudável, rotas HTTPS, headers, conteúdo e links críticos.
8. Em falha, executar `scripts/rollback-vps.sh` com o backup selecionado e repetir a verificação.
9. Para o `pki-bridge`, confirmar também migrações, integridade dos artifacts, chave pública, CORS e cadeia dos eventos.

## Separação de responsabilidades

- O portal Next.js publica identidade, conteúdo, ajuda e referências oficiais.
- O DocuSeal administra modelos, participantes, evidências de fluxo e arquivos nas rotas operacionais do mesmo domínio `assinatura.maiocchi.adv.br`.
- O subdomínio `documentos.assinatura.maiocchi.adv.br` é somente compatibilidade e redireciona de forma permanente, preservando caminho e consulta.
- O `pki-bridge` é um serviço separado e fail-closed para PAdES/ICP-Brasil. O provider privado DSS + agente CryptoTokenKit está ativo; o registro de autenticidade só opera depois de receber validação estruturada.
- O PDF PAdES final é imutável. ID, hash e QR ficam no envelope externo e na folha A4 separada.
- O verificador público mostra apenas metadados mínimos; o original permanece restrito por padrão e a comparação de arquivo ocorre localmente no navegador.
- O GOV.BR permanece um percurso externo para este escritório privado; o arquivo assinado deve ser preservado e validado no canal oficial.

## Padrão visual e de interação

- A marca canônica do portal é `m.` em CSS, com fundo transparente e ponto em `#FFB800`; `public/icon-512.png` e os favicons reproduzem a mesma marca nas superfícies do navegador.
- O primeiro viewport prioriza uma única tarefa: abrir o documento pelo link ou código recebido.
- O cabeçalho principal expõe apenas Assinar, Validar e Área dos advogados. Ajuda, modalidades, ICP-Brasil, GOV.BR, Segurança e páginas institucionais permanecem no contexto da página e no rodapé recolhível.
- O padrão do portal principal preservado na VPS é a referência visual: hero editorial full-bleed, imagem de alta resolução, header transparente que se materializa no scroll, carvão, branco e dourado `#FFB800`.
- Profundidade e movimento usam apenas transformações CSS leves, com desativação integral em `prefers-reduced-motion`.
- Ícones Lucide acompanham rótulos textuais em ações e navegação. Ícones decorativos permanecem ocultos da árvore de acessibilidade.
- Controles têm alvo mínimo de 44 por 44 pixels, foco visível e ordem de teclado verificável.
- A largura móvel usa a viewport disponível com margem lateral de 16 pixels; não se fixa conteúdo em uma coluna artificialmente estreita.
- O aceite visual exige screenshots em 1440 por 900 e 390 por 844, sem sobreposição, corte, overflow horizontal ou texto fora do contêiner; o hero deve deixar visível o início da próxima seção.
- Nenhuma afirmação de acessibilidade ou conformidade é publicada sem auditoria da implementação real.
- O agente PAdES privado escuta apenas em `127.0.0.1:35100`, aceita origens explícitas e acessa o A3 pelo CryptoTokenKit. O link documental contém ticket de uso único; PIN e chave nunca transitam pelo portal. A compatibilidade depende da combinação de mídia, driver, gerenciador e macOS registrada na matriz Certisign.

## Critério de conclusão

Uma função só pode ser anunciada como disponível depois de teste real no ambiente correspondente. Distribuição a terceiros exige Developer ID, hardened runtime e notarização Apple; PAdES-T/LT/LTA exige TSA e política configuradas; validação independente pelo VALIDAR ITI permanece etapa de conferência externa. Nenhum desses gates pode ser substituído por chave de exemplo ou simulação.

O contrato detalhado do padrão ouro está em `docs/architecture/padrao-ouro-autenticidade.md`; os papéis governados estão em `docs/agents/padrao-ouro-prompts.md`.
