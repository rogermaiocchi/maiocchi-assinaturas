# Mapa preliminar de dados e LGPD

## Papéis

- Controlador: atividade profissional exercida sob o nome Maiocchi Advogado, com identificação final condicionada à confirmação dos dados cadastrais completos.
- Responsável indicado no portal: Roger Maiocchi, OAB/DF 31.249.
- Canal de titulares e suporte: `roger@maiocchi.adv.br`.
- Operadores confirmados: Hostinger para infraestrutura e o provedor de e-mail configurado.
- Operador condicionado: Lacuna Software, somente se houver processamento SaaS ou suporte com acesso a dados.

## Operações

| Operação | Dados | Finalidade | Base a confirmar | Retenção a definir |
|---|---|---|---|---|
| Preparar documento | identificação, contato e conteúdo | elaborar e enviar documento | contrato, procedimento preliminar, exercício de direitos | por classe documental |
| Convidar signatário | nome, e-mail/telefone e link opaco | entregar acesso | execução do fluxo e legítimo interesse avaliado | até conclusão e prova |
| Coletar aceite simples | campos, assinatura desenhada e eventos técnicos | manifestação de vontade e prova | contrato/exercício de direitos | prazo probatório |
| Assinar com ICP-Brasil | certificado público, resultado e PDF | assinatura qualificada | contrato/exercício de direitos | prazo documental e probatório |
| Validar GOV.BR | PDF reenviado, cadeia e relatório | verificar assinatura externa | contrato/exercício de direitos | prazo documental e probatório |
| Operar segurança | IP, user agent, horário e eventos mínimos | prevenir abuso e incidentes | legítimo interesse e obrigação de segurança | janela de segurança definida |
| Atender titular | identidade, pedido e resposta | cumprir direitos LGPD | obrigação legal | prazo de prestação de contas |

“Base a confirmar” não autoriza produção. A matriz final será aprovada depois do contrato de fornecedores e da definição de cada fluxo documental.

## Categorias especiais de risco

O conteúdo do documento pode conter dados sensíveis, segredo profissional, dados de crianças, dados financeiros ou informações de processo. O sistema não tenta inferir essas categorias para publicidade. Aplica controles de acesso e retenção pelo maior risco razoável do tipo documental.

## Minimização

- convite contém apenas o necessário;
- e-mail nunca leva documento em anexo;
- provider recebe somente o necessário para a operação contratada;
- relatório público não expõe certificado completo nem identificador nacional;
- logs usam correlação opaca;
- analytics e publicidade comportamental permanecem ausentes.

## Direitos dos titulares

O procedimento deve autenticar o requerente, registrar o pedido, localizar dados em DocuSeal, `pki-bridge`, storage, e-mail e backups, avaliar retenção obrigatória/legal hold, executar a decisão e responder pelo canal informado.

## Retenção e descarte

A tabela final separará:

- documento original;
- PDF final assinado;
- anexos e versões intermediárias;
- trilha e relatório;
- logs de segurança;
- convites e mensagens;
- sessões expiradas;
- backups.

Exclusão lógica sem descarte de storage e backups não encerra o tratamento. Backups terão expiração, restauração controlada e reaplicação das exclusões pendentes.

## Incidentes

O playbook deve identificar natureza e volume dos dados, titulares afetados, risco/dano relevante, contenção, preservação de evidência, comunicação à ANPD e aos titulares quando cabível e medidas de mitigação.

## Gates pendentes

- identificação cadastral e endereço do controlador;
- responsável formal pelo canal de titulares;
- contratos e suboperadores;
- política de retenção por classe documental;
- localização e tratamento Lacuna;
- procedimento de incidente aprovado;
- teste de acesso, correção, restrição, eliminação e restauração.
