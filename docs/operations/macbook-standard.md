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
- O DocuSeal administra modelos, participantes, evidências de fluxo e arquivos.
- O futuro `pki-bridge` deve ser um serviço separado e fail-closed para PAdES/ICP-Brasil.
- O GOV.BR permanece um percurso externo para este escritório privado; o arquivo assinado deve ser preservado e validado no canal oficial.

## Critério de conclusão

Uma função só pode ser anunciada como disponível depois de teste real no ambiente correspondente. Ausência de licença Lacuna, credencial SMTP ou certificado de homologação é gate externo documentado, nunca substituído por chave de exemplo ou simulação.
