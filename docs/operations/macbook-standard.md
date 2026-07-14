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

## E-mail transacional pelo iCloud

- O remetente canônico de códigos e alertas é `Maiocchi. Assinatura <roger@maiocchi.adv.br>`.
- O transporte usa `smtp.mail.me.com:587`, autenticação SMTP e STARTTLS com verificação do certificado ativa. SMTPS implícito e TLS sem STARTTLS permanecem desativados.
- O domínio mantém os registros Apple validados: MX `mx01.mail.icloud.com` e `mx02.mail.icloud.com`, SPF com `include:icloud.com`, DKIM `sig1._domainkey` delegado ao iCloud e DMARC em `p=quarantine`. Não alterar DNS durante rotação de credencial SMTP.
- `SMTP_USERNAME` e `SMTP_PASSWORD` vivem exclusivamente em `/opt/docuseal/.env`, com proprietário `root`, grupo operacional do deploy e modo `0640` ou mais restritivo. A senha é específica de app, gerada no Apple Account; nunca é a senha principal da conta.
- O compose versiona apenas referências às variáveis. Toda implantação falha antes de iniciar se uma delas estiver ausente.
- O endereço `roger@maiocchi.adv.br` é a única identidade institucional de suporte e envio no portal, no DocuSeal, nas traduções, páginas de erro e mensagens transacionais. Endereços legados ou do fornecedor não podem aparecer em superfícies renderizadas.
- Na rotação, gerar uma nova senha específica de app, atualizar o `.env` sem eco, recriar somente o container `docuseal`, confirmar saúde e envio real, e só então revogar a credencial anterior.
- O aceite exige: handshake STARTTLS verificado a partir da VPS, autenticação aceita, resposta SMTP `250`, evento de entrega no DocuSeal e recebimento de uma mensagem de teste no endereço de destino. SPF, DKIM e DMARC devem ser conferidos no cabeçalho de uma mensagem recebida fora do domínio quando houver caixa de auditoria externa disponível.

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
- O portal e os e-mails não publicam página, menu, chamada editorial nem arquivo estático para download do código. Enquanto o fork DocuSeal permanecer sob AGPLv3, somente a oferta de fonte correspondente exigida pela seção 13 permanece nas atribuições das interfaces interativas do próprio motor, apontando para o artefato imutável da versão; sua remoção integral exige licença comercial compatível ou substituição do componente.
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

- O portal publico `1.14.1` adota uma unica camada visual translucida: midia
  institucional full-bleed, superficies com transparencia controlada, bordas
  discretas, acento dourado e continuidade entre hero, operacoes, acesso,
  validacao e fluxo. As imagens otimizadas permanecem em WebP e devem manter
  dimensoes naturais suficientes para desktop de alta densidade.
- A area profissional usa controle segmentado `Certificado`/`Senha` na propria
  home. A senha e entregue ao DocuSeal pela mesma origem e por CSRF efemero. O
  certificado usa relay POST com allowlist exata para
  `certificado.assinatura.maiocchi.adv.br`; somente `state` pode atravessar o
  handoff.
- O host mTLS `certificado.assinatura.maiocchi.adv.br` fica isolado em TLS 1.2,
  ECDHE e AES-GCM para compatibilidade com tokens A3 RSA que expõem assinatura
  PKCS#1 v1.5, mas não RSA-PSS. A exceção nunca se aplica ao host principal,
  que permanece habilitado para TLS 1.3. Qualquer retirada dessa restrição
  exige prova física de `CertificateVerify` RSA-PSS no token homologado.
- Certificado de primeiro uso e vinculado depois da autenticacao por senha. Um
  bootstrap administrativo excepcional so e admitido quando um PAdES aprovado
  e o relatorio oficial coincidem por SHA-256, a cadeia identifica o
  certificado, ha uma unica conta-alvo e o login posterior ainda exige prova
  de posse da chave privada por mTLS. Nunca vincular por texto de nome, CPF ou
  e-mail.
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
- A folha final apresenta “Evidências da assinatura digital” sem ícone. Todas as páginas recebem linha dourada superior de `3 pt`; somente páginas de conteúdo recebem uma faixa lateral direita sem divisor, com a marca `m.` centralizada e uma única inscrição vertical contínua, sem quebra: `ASSINATURA.MAIOCCHI.ADV.BR - DOCUMENTO <número> - HASH <SHA-256 da entrada> - CÓDIGO <PQC-MLDSA65> - VERIFICAÇÃO <ID público> - PÁG <atual> DE <total>`. A última página não recebe essa faixa; não há paginação isolada no rodapé.
- A folha final usa fundo integral A4 `2480x3508` (`300 dpi`) derivado de SVG determinístico: guilloché, rosetas, microtexto e os contornos `m.` e `MAIOCCHI.` cobrem o plano sem integrar a prova criptográfica. Não há moldura perimetral, quadro no QR, contorno de validação ou moldura da credencial. Véus brancos translúcidos, acentos cromáticos estreitos e espaçamento fazem os dados parecerem impressos no mesmo desenho. A área silenciosa do QR permanece clara. Os dados continuam selecionáveis e são distribuídos em cinco zonas numeradas de credencial: documento; contexto e eventos; atributos; ML-DSA-65; signatário.
- Na folha de evidências, `EVIDÊNCIAS DA ASSINATURA DIGITAL` fica à esquerda e `MODALIDADE · ...` à direita na mesma linha.
- O quadro `VALIDAR O ORIGINAL` exibe `assinatura.maiocchi.adv.br/validar` sem repetir o ID já apresentado acima. Cada endereço usa a mesma tipografia simples e recebe antes da linha o ícone Lucide `Globe`; quando a assinatura for elegível no ITI, `validar.iti.gov.br` aparece na segunda linha com o mesmo padrão. O rodapé jurídico não repete esse destino.
- Quando a assinatura validada é ICP-Brasil, a marca oficial ocupa a área direita do selo e a base legal física é exatamente `MP 2.200-2/2001, art. 10, § 1º · L 14.063/2020, art. 4º, III.`, sem prefixo autodeclaratório. Em outras modalidades, a marca ICP-Brasil e a alegação qualificada são omitidas, e a marca PAdES ocupa a área direita do selo.
- O QR não recebe rótulo isolado. O Code 128 continua codificando `MAI|<publicId>|R1`, mas o payload não é impresso acima das barras. Nenhuma página exibe `Página X de Y`; a quantidade total permanece somente nos metadados documentais.
- Todos os blocos da folha final ficam dentro da área útil A4: 3 cm no topo e à esquerda, 2 cm à direita e na base. A composição ocupa horizontal e verticalmente essa área sem invadir margens, sobrepor blocos ou deformar o selo.
- O provider `1.2.5` gera os dados do signatário como PNG ARGB dinâmico em 288 dpi, sem preenchimento opaco: nome, CPF mascarado, instante, A3, `signerAttr`, `/Location`, `/Reason`, estado de ACT e fingerprint SHA-256 ficam na área esquerda reservada da quinta zona; a marca ICP-Brasil permanece fora do campo criptográfico, à direita.
- O campo gráfico da assinatura não exibe os rótulos redundantes “Resumo visual da assinatura” ou “Resumo visual da assinatura · confira pelo QR ou código”. A identificação operacional desse bloco é somente “Assinatura”, sem alteração de geometria, conteúdo criptográfico ou estado de confiança.
- Controles têm alvo mínimo de 44 por 44 pixels, foco visível e ordem de teclado verificável.
- A largura móvel usa a viewport disponível com margem lateral de 16 pixels; não se fixa conteúdo em uma coluna artificialmente estreita.
- O aceite visual exige screenshots em 1440 por 900, 820 por 1180 e 390 por 844, sem sobreposição, corte, overflow horizontal ou texto fora do contêiner; o hero deve deixar visível o início da próxima seção.
- Nenhuma afirmação de acessibilidade ou conformidade é publicada sem auditoria da implementação real.
- O agente PAdES privado escuta apenas em `127.0.0.1:35100`, aceita origens explícitas e acessa uma chave externa pelo CryptoTokenKit. O Mac prova origem externa, RSA, capacidade de assinatura e tamanho mínimo; somente o provider confirma cadeia ICP-Brasil e política antes da operação. O link documental contém ticket de uso único; PIN e chave nunca transitam pelo portal. A compatibilidade depende da combinação de mídia, driver, gerenciador e macOS registrada na matriz Certisign.
- Metadados do ambiente são coletados no clique: IP observado pelo servidor, plataforma, navegador, fuso e data/hora. Geolocalização é opcional e só ingressa no manifesto quando o usuário autoriza o navegador; recusa não impede a assinatura.

## Perfil A3 homologado

O padrão de sucesso atual do MacBook primário é portal `1.11.2`, bridge `1.3.8`,
provider `1.2.3`, código `9249e777fad8f0ff55d20b7095c4350ecdd7e105`,
agente local `1.2.1` em `127.0.0.1:35100`, token ICP-Brasil A3 via
CryptoTokenKit e política PAdES AD-RB v1.3. O ensaio final de 13/07/2026 às
22:53:54 BRT foi aprovado novamente pelo VALIDAR ITI, com cadeia `Valid`, estrutura conforme,
resumo criptográfico `true`, atributos obrigatórios aprovados e
`IdAaEtsSignerAttr` opcional `Valid`, sem mensagem de alerta.

O endereço canônico de qualquer registro é
`https://assinatura.maiocchi.adv.br/validar?codigo={id}`. O endereço
`https://validar.iti.gov.br/` acompanha somente assinaturas ICP-Brasil, GOV.BR
ou Assinatura GOV.BR reconhecidas; assinatura simples e classificação avançada
genérica permanecem sem link ITI.

O agente `1.2.1` mantém o perfil
`external-store-rsa-2048-fail-closed` e permite retomar o mesmo ticket em
estado `prepared`. O ensaio de retomada chegou novamente ao desafio da chave
externa e, diante de cancelamento físico, não concluiu nem publicou documento;
o ticket permaneceu preparado. Esse comportamento é a referência operacional
para repetição segura após cancelamento do PIN/token.

Os valores canônicos, a composição visual v7 e os hashes da evidência estão na
[baseline da folha de evidências v7 aprovada pelo ITI](../baseline/2026-07-13-pades-evidence-layout-v7-iti-approved.md).
A [baseline dos endereços aprovada pelo ITI](../baseline/2026-07-13-validator-address-iti-approved.md)
permanece como histórico da revisão substituída.
A [baseline PAdES por modalidade](../baseline/2026-07-13-pades-dual-modality-iti-approved.md)
permanece como histórico da revisão substituída.
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
