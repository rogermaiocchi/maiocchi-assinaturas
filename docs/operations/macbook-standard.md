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
- O PDF PAdES final é imutável. Antes da assinatura, o bridge carimba todas as páginas e acrescenta uma página A4 final com ID, hash da entrada, QR, Code 128, metadados e área do signatário. O hash binário final permanece externo porque um arquivo não pode conter o próprio hash sem alterá-lo.
- A página final apresenta os atributos opcionais ITI como sinais físicos separados em incorporados, condicionais de ACT e contextuais/default. A aparência deve refletir o estado criptográfico efetivo e nunca apresentar um atributo ausente como incorporado.
- A página final recebe atestado ML-DSA-65 do manifesto pré-assinatura. Esse atestado é uma prova adicional do portal e não substitui nem renomeia a assinatura PAdES ICP-Brasil, que segue os algoritmos e políticas homologados.
- A marca oficial ICP-Brasil no selo, o OID e a qualificação jurídica só podem ser renderizados quando `signature.infrastructure` normalizada for exatamente `ICP-Brasil`. Assinaturas simples e avançadas preservam o fundo de segurança, exibem a marca tipográfica PAdES na mesma área e não recebem marca, link ou alegação ICP-Brasil.
- O verificador público mostra apenas metadados mínimos; o original permanece restrito por padrão e a comparação de arquivo ocorre localmente no navegador.
- O GOV.BR permanece um percurso externo para este escritório privado; o arquivo assinado deve ser preservado e validado no canal oficial.

## Padrão visual e de interação

- A arquitetura nominal segue `Maiocchi. + atividade`: o produto chama-se **Maiocchi. Assinatura** e a marca compacta é `m.` em CSS, com fundo transparente e ponto em `#FFB800`; `public/icon-512.png` e os favicons reproduzem a mesma marca nas superfícies do navegador.
- O hero inicial segue a hierarquia editorial `serviço + atividade`: **Serviço de apoio ao cliente** e **Assinatura digital**; a marca compacta `m.` permanece em evidência na barra superior, sem duplicação no hero ou no rodapé.
- O menu superior usa controles iconográficos circulares, com Lucide, tooltip, foco visível e efeito de profundidade. Caixas quadradas não são usadas para envolver ícones; comandos textuais continuam rotulados quando a ação não for universalmente reconhecível.
- O primeiro viewport prioriza uma única tarefa: abrir o documento pelo link ou código recebido.
- O cabeçalho principal exibe apenas a marca `m.` e as âncoras Assinar, Validar e Advogados. Não se repete “Maiocchi” ao lado do símbolo.
- Login, certificado digital, chave de autenticidade e VALIDAR ITI são iniciados na página inicial. `/sign_in`, `/dashboard` não autenticado e `/validar/` são compatibilidades de rota, não páginas públicas de navegação.
- O dashboard operacional somente aparece depois da autenticação; credenciais são entregues ao DocuSeal na mesma origem, com CSRF efêmero, e não são processadas pelo portal estático.
- O e-mail público aparece somente na Central de ajuda. Demais páginas apontam para essa central, sem repetição do endereço.
- “Informações, modalidades e políticas” usa três grupos identificados, com descrição curta e links institucionais; não é uma lista plana.
- O padrão do portal principal preservado na VPS é a referência visual: hero editorial full-bleed, imagem de alta resolução, header transparente que se materializa no scroll, carvão, branco e dourado `#FFB800`.
- A fotografia institucional no hero usa sombra direcional e degradê inferior para fusão com o fundo da página; a imagem tecnológica de assinatura é reaproveitada em bloco funcional contextual, nunca como decoração desconectada.
- Profundidade e movimento usam apenas transformações CSS leves, com desativação integral em `prefers-reduced-motion`.
- Ícones Lucide acompanham rótulos textuais em ações e navegação. Ícones decorativos permanecem ocultos da árvore de acessibilidade.
- A folha final apresenta “Evidências da assinatura digital” sem ícone. Todas as páginas recebem linha dourada superior; somente páginas de conteúdo recebem o registro lateral centralizado com micro marca `m.`, ID, SHA-256 da entrada e atestado ML-DSA-65. A última página não repete esse registro.
- Na folha de evidências, `EVIDÊNCIAS DA ASSINATURA DIGITAL` fica à esquerda e `MODALIDADE · ...` à direita na mesma linha.
- Quando a assinatura validada é ICP-Brasil, a marca oficial ocupa a área direita do selo e o bloco inferior exibe a base legal à esquerda e `Validação externa: validar.iti.gov.br` à direita, com link clicável para `https://validar.iti.gov.br/`. Em outras modalidades, a marca ICP-Brasil e o link ITI são omitidos e a marca PAdES ocupa a área direita do selo.
- O provider `1.2.3` gera os dados do signatário como PNG ARGB dinâmico em 288 dpi, sem preenchimento opaco: nome, CPF mascarado, instante, A3, `signerAttr`, `/Location`, `/Reason`, estado de ACT e fingerprint SHA-256 ficam à esquerda sobre o fundo de segurança; a marca ICP-Brasil permanece fora do campo criptográfico, à direita.
- O campo gráfico da assinatura não exibe os rótulos redundantes “Resumo visual da assinatura” ou “Resumo visual da assinatura · confira pelo QR ou código”. A identificação operacional desse bloco é somente “Assinatura”, sem alteração de geometria, conteúdo criptográfico ou estado de confiança.
- Controles têm alvo mínimo de 44 por 44 pixels, foco visível e ordem de teclado verificável.
- A largura móvel usa a viewport disponível com margem lateral de 16 pixels; não se fixa conteúdo em uma coluna artificialmente estreita.
- O aceite visual exige screenshots em 1440 por 900, 820 por 1180 e 390 por 844, sem sobreposição, corte, overflow horizontal ou texto fora do contêiner; o hero deve deixar visível o início da próxima seção.
- Nenhuma afirmação de acessibilidade ou conformidade é publicada sem auditoria da implementação real.
- O agente PAdES privado escuta apenas em `127.0.0.1:35100`, aceita origens explícitas e acessa uma chave externa pelo CryptoTokenKit. O Mac prova origem externa, RSA, capacidade de assinatura e tamanho mínimo; somente o provider confirma cadeia ICP-Brasil e política antes da operação. O link documental contém ticket de uso único; PIN e chave nunca transitam pelo portal. A compatibilidade depende da combinação de mídia, driver, gerenciador e macOS registrada na matriz Certisign.
- Metadados do ambiente são coletados no clique: IP observado pelo servidor, plataforma, navegador, fuso e data/hora. Geolocalização é opcional e só ingressa no manifesto quando o usuário autoriza o navegador; recusa não impede a assinatura.

## Perfil A3 homologado

O padrão de sucesso atual do MacBook primário é portal `1.11.1`, bridge `1.3.6`,
provider `1.2.3`, código `b42bf163d5fe6a830970c64597fd7e2d0da7e8fd`,
agente local `1.2.1` em `127.0.0.1:35100`, token ICP-Brasil A3 via
CryptoTokenKit e política PAdES AD-RB v1.3. O ensaio final de 13/07/2026 às
20:56:25 BRT foi
aprovado novamente pelo VALIDAR ITI, com cadeia `Valid`, estrutura conforme,
resumo criptográfico `true`, atributos obrigatórios aprovados e
`IdAaEtsSignerAttr` opcional `Valid`, sem mensagem de alerta.

O agente `1.2.1` mantém o perfil
`external-store-rsa-2048-fail-closed` e permite retomar o mesmo ticket em
estado `prepared`. O ensaio de retomada chegou novamente ao desafio da chave
externa e, diante de cancelamento físico, não concluiu nem publicou documento;
o ticket permaneceu preparado. Esse comportamento é a referência operacional
para repetição segura após cancelamento do PIN/token.

Os valores canônicos, a composição final e os hashes da evidência estão na
[baseline PAdES por modalidade aprovada pelo ITI](../baseline/2026-07-13-pades-dual-modality-iti-approved.md).
A [baseline do layout anterior](../baseline/2026-07-13-pades-canonical-layout-iti-approved.md)
permanece como histórico da revisão substituída.
A [baseline dos sinais físicos ITI](../baseline/2026-07-13-pades-iti-physical-signals-approved.md)
permanece como histórico da revisão anterior.
A [baseline criptográfica original](../baseline/2026-07-13-pades-iti-approved.md)
permanece como histórico. Para ajustes visuais, editar somente a composição
pré-assinatura. Nunca abrir e salvar o PDF PAdES final em editor, compressor ou
biblioteca de pós-processamento.

## Critério de conclusão

Uma função só pode ser anunciada como disponível depois de teste real no ambiente correspondente. Distribuição a terceiros exige Developer ID, hardened runtime e notarização Apple; PAdES-T/LT/LTA exige TSA e política configuradas; validação independente pelo VALIDAR ITI permanece etapa de conferência externa. Nenhum desses gates pode ser substituído por chave de exemplo ou simulação.

O contrato detalhado do padrão ouro está em `docs/architecture/padrao-ouro-autenticidade.md`; os papéis governados estão em `docs/agents/padrao-ouro-prompts.md`.
