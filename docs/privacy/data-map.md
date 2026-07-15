# Registro simplificado das operacoes de tratamento

Este registro operacional atende ao art. 37 da LGPD em formato simplificado,
conforme o art. 9 da Resolucao CD/ANPD 2/2022. Ele descreve o que o portal faz;
nao amplia as finalidades nem autoriza coleta adicional.

## Papeis e canal

- Controlador: Maiocchi Advogado, na atividade profissional exercida por Roger
  Maiocchi, OAB/DF 31.249.
- Responsavel pelo canal de titulares: Roger Maiocchi, OAB/DF 31.249.
- Canal unico: Central de ajuda do portal, que encaminha as solicitacoes para
  `roger@maiocchi.adv.br`.
- Operadores ativos: Hostinger, para a VPS, e Apple iCloud Mail, para o
  transporte de mensagens.
- Software autogerido: o fork do DocuSeal e o `pki-bridge` executam na VPS do
  controlador; seus mantenedores nao recebem dados por esse fato.
- Lacuna Software: nao e operador ativo. O provider remoto permanece
  desabilitado e nenhum documento e enviado enquanto nao houver contratacao,
  credenciais e avaliacao formal.
- VALIDAR ITI: servico oficial externo, acessado voluntariamente pelo usuario.
  O portal nao envia o PDF ao ITI em segundo plano.

Os fornecedores e as fronteiras de dados estao detalhados em
`docs/privacy/subprocessors.md`.

## Operacoes

| Operacao | Dados estritamente necessarios | Finalidade | Base considerada | Retencao padrao |
|---|---|---|---|---|
| Preparar documento | identificacao, contato e conteudo | elaborar e entregar o documento | contrato/procedimento preliminar; exercicio regular de direitos | conforme o expediente; regra documental abaixo |
| Convidar signatario | nome, contato e token opaco | conceder acesso ao fluxo | contrato/procedimento preliminar; exercicio regular de direitos | ate 90 dias apos encerramento, salvo integracao a evidencia |
| Coletar assinatura simples ou avancada | campos, manifestacao, PDF e eventos tecnicos | formalizar vontade e produzir prova | contrato; exercicio regular de direitos | documento concluido: dez anos apos encerramento do expediente, sujeito a revisao e legal hold |
| Assinar com ICP-Brasil | certificado publico, PDF, resultado e atributos PAdES | produzir assinatura qualificada e validar a cadeia | contrato; exercicio regular de direitos; obrigacao legal/regulatoria aplicavel | mesma classe do documento concluido |
| Registrar autenticidade | ID opaco, hashes, politica, horarios e atestacoes | preservar integridade e permitir conferencia | exercicio regular de direitos; legitimo interesse de seguranca avaliado | mesma classe do documento concluido |
| Comparar PDF no navegador | arquivo e SHA-256 calculado localmente | comparar bytes com o registro | operacao solicitada pelo titular | arquivo e hash nao saem do dispositivo; somente `match`/`mismatch` pode virar evento |
| Operar seguranca | IP, user agent, horario e eventos minimos | prevenir abuso, fraude e incidentes | legitimo interesse avaliado; dever de seguranca | 180 dias; incidente confirmado segue registro minimo de cinco anos |
| Autenticar por certificado | certificado publico e desafio efemero | identificar o advogado sem senha | contrato; exercicio regular de direitos; seguranca | desafio: ate 24 horas depois da expiracao |
| Atender titular | identidade, pedido, avaliacao e resposta | cumprir arts. 18 e 19 da LGPD | obrigacao legal | cinco anos para prestacao de contas |

As bases dependem do contexto juridico concreto. Consentimento nao substitui
base mais adequada e so sera usado quando especifico, livre e revogavel.

## Categorias de maior risco

O conteudo documental pode conter dados sensiveis, dados de criancas e
adolescentes, informacoes financeiras, dados processuais ou segredo
profissional. O portal nao infere essas categorias para publicidade e aplica o
controle mais restritivo compativel com o expediente.

## Minimizacao e fronteiras

- Convites nao levam o documento em anexo.
- O banco publico de autenticidade nao registra IP, user agent, conteudo do
  documento nem certificado completo.
- A pagina de verificacao calcula SHA-256 no dispositivo e nao envia o PDF ao
  portal.
- A localizacao so e coletada com permissao expressa do navegador e sua recusa
  nao impede a assinatura.
- PIN, senha, arquivo A1 e chave privada nunca ingressam no portal.
- Analytics, perfil comportamental e publicidade permanecem ausentes.
- O provider remoto recebe zero bytes enquanto estiver desabilitado.

## Retencao, descarte e legal hold

A matriz executavel esta em `docs/privacy/retention-policy.md`. Os prazos sao
padroes internos de governanca, nao afirmacoes de que a LGPD imponha prazo
universal de dez anos. Obrigacao legal, segredo profissional, exercicio de
direitos, instrucao do cliente e legal hold prevalecem.

Documento concluido, assinatura, relatorio e evidencia vinculada nao entram em
limpeza automatica. Dados efemeros e fluxos nao concluidos sao saneados segundo
a classe; backups sao cifrados antes da escrita, replicados fora da VPS,
expiram em 35 dias e carregam tombstones para reaplicar exclusoes apos
restauracao.

## Direitos e incidentes

- Procedimento de titular: `docs/privacy/data-subject-rights-runbook.md`.
- Resposta a incidente: `docs/security/incident-response.md`.
- Fonte normativa para agentes de pequeno porte: Resolucao CD/ANPD 2/2022.
- Fonte normativa para incidentes: Resolucao CD/ANPD 15/2024.

## Controles verificados e limites externos

- canal de titulares definido e testado pelo SMTP do dominio;
- registro simplificado, politica de retencao e runbooks versionados;
- artefatos do `pki-bridge` cifrados com AES-256-GCM e backups consistentes,
  cifrados com `age` antes da persistencia e copiados para o MacBook;
- documento original restrito por padrao e servicos internos isolados;
- Lacuna/PSC remoto desabilitado ate contratacao e credenciais;
- revisao de termos da Hostinger e Apple permanece atividade juridica periodica,
  sem que este documento presuma clausulas contratuais nao auditadas.
