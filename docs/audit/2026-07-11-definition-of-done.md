# Auditoria do Definition of Done - 11 de julho de 2026

## Resultado

O portal institucional está publicado e validado. A solução DocuSeal + Lacuna não está concluída de ponta a ponta. O encerramento correto é **bloqueado por insumos externos**, sem emissão de `GOAL-REACHED`.

## Comprovado

- Baseline Git, commits e tag assinados.
- Backup de portal, DocuSeal, PostgreSQL e Traefik com quatro hashes aprovados.
- Rollback validado em modo de conferência.
- Portal `maiocchi/assinatura-portal:1.2.1` saudável em produção.
- DocuSeal 3.0.1 e PostgreSQL 16 saudáveis.
- Identidade Maiocchi Advogado, e-mail e OAB padronizados.
- Doze páginas estáticas, navegação, termos, política, ajuda e fontes oficiais.
- Cadeia GOV.BR publicada sem alteração, com três certificados válidos até 2033 e hash fixado.
- Vinte e um testes, lint, build, integridade de links e inspeção desktop/móvel aprovados.
- CSP, HSTS, headers de segurança e container sem privilégios confirmados.
- `npm audit` sem vulnerabilidades no portal; busca de segredos versionados sem ocorrência.
- Adapter REST PKI Core em `fetch` nativo, HMAC DocuSeal, máquina de estados e schema PostgreSQL validados.
- Cliente Node Lacuna vulnerável rejeitado e não incorporado.

## Não comprovado

| Item | Evidência atual | Gate |
|---|---|---|
| Contrato e licença Lacuna | ausentes no MacBook e na VPS | contratação e instalação segura |
| REST PKI Core/Web PKI real | provider não ativado | endpoint, API key, security context e licença de domínio |
| Documento DocuSeal E2E | 0 modelos, 0 submissões e 0 signatários | criar caso de homologação real |
| PAdES sequencial | nenhum PDF assinado | certificados A1 e A3 de homologação |
| Expirado, revogado, replay e adulteração | sem certificado e provider | matriz criptográfica real |
| Retorno de original, final e relatório | extensão DocuSeal não implantada | G06-G09 ativos |
| Upload GOV.BR e validação interna | orientação e cadeia publicadas; backend ausente | provider de validação ativo e submissão real |
| SMTP | DNS existe; credencial não encontrada | credencial de envio e teste de entrega |
| Programa LGPD operacional | política e mapa preliminar existem | identificação cadastral, retenção, contratos, direitos, incidente e testes |
| Auditoria final de 0 pendência | itens acima abertos | todos os gates comprovados |

## Observações operacionais

- O certificado TLS público vence em 23 de agosto de 2026 e depende da renovação automática do Traefik/Let's Encrypt.
- Os dois links do Planalto usados como fontes tiveram timeout na rodada final a partir do MacBook; as páginas do ITI e o Validador responderam HTTP 200.
- O wrapper local `obsidian` aponta para um `obsidian-cli` inexistente. O vault `texto` foi consultado em modo somente leitura pelo filesystem, aplicando o cânone clareza, ordem direta e cadeia lexical estável.
