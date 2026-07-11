# Padrão operacional do MacBook

Este documento registra o procedimento canônico para desenvolver e operar o portal de assinaturas a partir do MacBook primário.

## Identidade e comunicação

- Nome oficial: **Maiocchi Advogado**.
- E-mail único do portal: `roger@maiocchi.adv.br`.
- Responsável profissional: Roger Maiocchi, OAB/DF 31.249.
- Textos não devem atribuir ao DocuSeal assinatura qualificada nem apresentar integração Lacuna como ativa sem licença e validação reais.

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

## Separação de responsabilidades

- O portal Next.js publica identidade, conteúdo, ajuda e referências oficiais.
- O DocuSeal administra modelos, participantes, evidências de fluxo e arquivos nas rotas operacionais do mesmo domínio `assinatura.maiocchi.adv.br`.
- O subdomínio `documentos.assinatura.maiocchi.adv.br` é somente compatibilidade e redireciona de forma permanente, preservando caminho e consulta.
- O futuro `pki-bridge` deve ser um serviço separado e fail-closed para PAdES/ICP-Brasil.
- O GOV.BR permanece um percurso externo para este escritório privado; o arquivo assinado deve ser preservado e validado no canal oficial.

## Padrão visual e de interação

- A marca canônica do portal é o ativo `public/icon-512.png`, identificado visualmente por `m.`; “Maiocchi Assinaturas” é a assinatura verbal secundária.
- O primeiro viewport prioriza uma única tarefa: abrir o documento pelo link ou código recebido.
- O cabeçalho principal expõe apenas Assinar, Modalidades, Validar e Ajuda; ICP-Brasil, GOV.BR, Segurança e páginas institucionais permanecem na navegação contextual e no rodapé.
- Ícones Lucide acompanham rótulos textuais em ações e navegação. Ícones decorativos permanecem ocultos da árvore de acessibilidade.
- Controles têm alvo mínimo de 44 por 44 pixels, foco visível e ordem de teclado verificável.
- A largura móvel usa a viewport disponível com margem lateral de 16 pixels; não se fixa conteúdo em uma coluna artificialmente estreita.
- O aceite visual exige screenshots em 1440 por 1000 e 390 por 844, sem sobreposição, corte, overflow horizontal ou texto fora do contêiner.
- Nenhuma afirmação de acessibilidade ou conformidade é publicada sem auditoria da implementação real.
- O Web PKI não é carregado no domínio de produção sem licença; o acesso por certificado começa na tela DocuSeal, que gera o token CSRF e o desafio mTLS.

## Critério de conclusão

Uma função só pode ser anunciada como disponível depois de teste real no ambiente correspondente. Ausência de licença Lacuna, credencial SMTP ou certificado de homologação é gate externo documentado, nunca substituído por chave de exemplo ou simulação.
