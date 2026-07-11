# Plano de fusão DocuSeal + Lacuna PKI Suite

## 1. Direção e critério de encerramento

Construir o portal de assinaturas do **Maiocchi Advogado** como uma solução única de fluxo documental, assinatura eletrônica e assinatura digital, mantendo o DocuSeal como motor de documentos e acrescentando uma camada PKI própria, baseada nas APIs e nos componentes licenciados da Lacuna Software.

O plano somente termina quando todos os critérios da seção 15 estiverem comprovados por testes, inspeção da implantação e validação criptográfica. Relato de agente, build verde isolado ou aparência visual não bastam.

## 2. Estado atual validado em 11 de julho de 2026

### 2.1 Portal e infraestrutura

- O portal público está em `https://assinatura.maiocchi.adv.br`.
- O DocuSeal está em `https://documentos.assinatura.maiocchi.adv.br`.
- Os containers `assinatura-portal`, `docuseal` e `docuseal-db` estão saudáveis.
- A versão implantada é `maiocchi/docuseal:3.0.1-maiocchi.1`.
- O portal local compila, passa em 5 testes de renderização e passa no lint.
- O banco está limpo: 0 modelos, 0 submissões, 0 signatários e 1 usuário administrativo.
- A cópia local não possui repositório Git. O estado atual depende de sincronização manual com `/opt/assinatura-portal`.
- O SMTP ainda não está comprovadamente configurado.

### 2.2 ICP-Brasil atual

- Existe um módulo próprio `certificate_auth` no fork do DocuSeal.
- Esse módulo faz autenticação por certificado cliente e não assina documentos em PAdES ou CAdES.
- A funcionalidade está desligada em produção: `CERTIFICATE_AUTH_ENABLED=false`.
- O Traefik está preparado para mTLS no subdomínio `certificado.assinatura.maiocchi.adv.br`.
- O bundle `deploy/icp-trust/icp-client-roots.crt` contém apenas as raízes gerais ICP-Brasil v5 e v12.
- Não há validação de revogação comprovada nem teste real de propósito `clientAuth`. O login mTLS não deve ser ativado como parte da assinatura digital.

### 2.3 Conteúdo e identidade

- A interface ainda usa `Roger Maiocchi, advogado` e `admin@maiocchi.adv.br` em diversos pontos.
- O padrão exigido passa a ser **Maiocchi Advogado** e `roger@maiocchi.adv.br`.
- Os termos e a política de privacidade atuais são resumos. Eles não descrevem integralmente agentes de tratamento, bases legais, direitos, retenção, incidentes, transferências, operadores e governança.
- Falta a identificação obrigatória: **Roger Maiocchi, OAB/DF 31.249**.
- A área de segurança menciona ICP-Brasil, mas a função de assinatura qualificada ainda não existe.

### 2.4 Lacuna e DocuSeal

- `LacunaSoftware/PkiSuiteSamples` é uma coleção de demonstrações em várias linguagens. Não é uma biblioteca para incorporação direta.
- O exemplo Node.js usa Express e dependências antigas, inclui arquivos de demonstração e contém configurações de teste que não podem chegar à produção.
- O repositório de amostras não apresenta uma licença de código no nível raiz. Nenhum trecho será copiado sem autorização ou licença inequívoca.
- A integração será implementada a partir da documentação oficial e dos clientes oficialmente licenciados, com código próprio e testes próprios.
- O DocuSeal oferece webhooks de `submission.completed` e API para obter o PDF concluído. Esses pontos são adequados para iniciar a fase PKI.
- O DocuSeal é AGPLv3. Toda modificação implantada continuará com código correspondente, avisos e licenças acessíveis aos usuários.
- A página atual de código-fonte menciona “termos adicionais”, mas o pacote publicado contém apenas `LICENSE`. O texto será corrigido ou o documento adicional efetivamente aplicável será incluído e identificado.

## 3. Decisões arquiteturais

### 3.1 Separar fluxo documental e operação criptográfica

O DocuSeal continuará responsável por:

1. modelos e documentos;
2. participantes e ordem de preenchimento;
3. campos, aceite eletrônico e trilha de eventos;
4. geração do PDF final da fase documental.

Um novo serviço `pki-bridge` será responsável por:

1. congelar e identificar o PDF recebido do DocuSeal;
2. criar sessões de assinatura digital;
3. conversar com REST PKI Core e Web PKI;
4. encadear assinaturas PAdES;
5. validar certificados, cadeia, revogação, carimbo de tempo e integridade;
6. guardar metadados, relatórios e hashes;
7. devolver ao DocuSeal a versão final assinada, sem apagar o original.

O `pki-bridge` será um serviço separado, com API interna, banco próprio e fronteira HTTP autenticada. Essa separação reduz o acoplamento ao fork AGPL, permite atualização independente e impede que o código de demonstração da Lacuna seja misturado ao núcleo do DocuSeal.

### 3.2 Fluxo em duas fases

Uma assinatura PAdES protege a revisão do PDF que foi assinada. Se o DocuSeal regenerar ou alterar o arquivo depois da primeira assinatura digital, essa assinatura pode ser invalidada. O fluxo obrigatório será:

1. todos os dados e aceites do DocuSeal são concluídos;
2. o DocuSeal gera o PDF canônico;
3. o `pki-bridge` calcula SHA-256 e congela essa revisão;
4. cada signatário digital acrescenta sua assinatura PAdES à revisão anterior;
5. depois da última assinatura, o arquivo recebe validação final e, quando contratado, LTV e carimbo de tempo;
6. o PDF final e o relatório voltam ao registro da submissão.

Não será permitido alterar campos, páginas, marcas ou conteúdo depois de iniciada a fase PKI. Qualquer correção cancela o ciclo, gera nova revisão documental e exige novas assinaturas.

### 3.3 Modalidades separadas na interface

- **Eletrônica simples:** aceite e evidências do DocuSeal, conforme o caso concreto.
- **Eletrônica avançada:** somente o perfil que comprove vinculação unívoca, controle do signatário e detecção de alteração, sem ser apresentado como ICP-Brasil.
- **Eletrônica qualificada:** PAdES com certificado ICP-Brasil válido e operação criptográfica do titular.
- **GOV.BR avançada:** fluxo externo assistido, seguido de reimportação e validação no portal.

O acesso por link e a imagem de assinatura do DocuSeal serão classificados como simples por padrão. A classificação avançada dependerá de um perfil de evidências testado e documentado. Essas modalidades nunca serão apresentadas como equivalentes. A Lei nº 14.063/2020 será explicada sem transformar uma classificação jurídica em promessa genérica de adequação para todo documento.

O primeiro release não habilitará um perfil avançado próprio. Ele entregará assinatura simples, qualificada ICP-Brasil e assistência para assinatura avançada externa GOV.BR. O perfil `advanced_profile` somente será liberado depois de ADR jurídico-técnica, autenticação compatível, matriz de evidências e testes de controle exclusivo e integridade.

## 4. Limite real da integração GOV.BR

A API de Assinatura Eletrônica GOV.BR é destinada a órgãos e entes públicos, exige solicitação por gestor público e domínio oficial. O Maiocchi Advogado não pode receber credenciais de produção como iniciativa privada.

O portal implementará um percurso completo e honesto:

1. baixar a revisão congelada do PDF;
2. abrir o Portal de Assinaturas GOV.BR por link oficial;
3. assinar externamente;
4. reenviar o PDF assinado ao portal;
5. validar a cadeia GOV.BR, a integridade e a cobertura da assinatura;
6. vincular o arquivo validado à submissão correta;
7. oferecer link para o Validador do ITI e instruções do Adobe Reader.

A cadeia oficial `Cadeia_GovBr-der.p7b` será importada somente no contexto de validação de documentos. Ela não será adicionada ao bundle mTLS, pois confiança para validar assinatura de PDF não equivale a autorização para autenticação TLS de cliente.

O processo de atualização da cadeia terá URL de origem, SHA-256, sujeitos, emissores, datas de validade e revisão humana registrados. Mudança de certificado exigirá teste de regressão antes da promoção.

## 5. Topologia de produção

```text
Internet
  -> Traefik
      -> assinatura.maiocchi.adv.br       portal e conteúdo
      -> documentos.assinatura...         DocuSeal
      -> pki.assinatura...                UI pública mínima do pki-bridge
      -> pki-internal                     API interna, não publicada

DocuSeal
  -> webhook HMAC -> pki-bridge
  <- status, PDF final e relatório

pki-bridge
  -> REST PKI Core / Web PKI licenciados
  -> PostgreSQL dedicado
  -> armazenamento de artefatos imutáveis
```

A preferência é REST PKI Core on-premises na VPS, após confirmação comercial e técnica da Lacuna. A alternativa SaaS somente será adotada depois de contrato, avaliação de transferência e tratamento de dados, localização do processamento e acordo de proteção de dados. G02 bloqueia qualquer código produtivo de assinatura; antes dele, somente pesquisa e spike descartável sem documento real.

## 6. Modelo de estado e persistência

Estados mínimos do processo:

```text
docuseal_draft
  -> docuseal_completed
  -> pdf_frozen
  -> pki_pending
  -> pki_in_progress
  -> pki_completed
  -> validated
  -> delivered
```

Estados laterais: `cancelled`, `expired`, `rejected`, `validation_failed` e `retryable_error`.

Tabelas mínimas do `pki-bridge`:

- `pki_workflows`: relação com a submissão DocuSeal, modalidade, estado e revisão.
- `pki_signers`: ordem, modalidade, estado e referência ao signatário.
- `pki_sessions`: identificador opaco, expiração, idempotência e resultado.
- `pki_artifacts`: original congelado, revisões PAdES, arquivo final, hash e armazenamento.
- `pki_validations`: política, cadeia, revogação, carimbos, resultado e relatório.
- `pki_events`: trilha append-only de mudanças de estado.

Chave privada, arquivo A1, PIN, senha de token e credencial GOV.BR nunca serão recebidos ou armazenados pelo portal.

Cada signatário terá `signature_requirement` explícito: `docuseal_simple`, `advanced_profile`, `govbr_advanced` ou `icpbr_qualified`. Um signatário qualificado não receberá campo de assinatura desenhada no DocuSeal como substituto do PAdES. A fase DocuSeal coletará apenas dados e confirmações necessários para preparar o PDF; a assinatura será aposta na fase PKI.

## 7. Contratos de integração

### 7.1 DocuSeal para `pki-bridge`

- Receber `submission.completed` com HMAC validado.
- Aplicar idempotência pelo UUID do evento e pelo par submissão-revisão.
- Consultar a API do DocuSeal e obter o documento concluído.
- Confirmar que todos os signatários necessários concluíram a fase documental.
- Congelar o PDF e registrar o hash.
- Criar a fila de assinaturas digitais.

### 7.2 Sessão de assinatura qualificada

- `POST /v1/workflows/:id/signatures/start`
- leitura dos certificados locais pelo Web PKI;
- seleção explícita do certificado pelo titular;
- preparação da assinatura no REST PKI Core;
- assinatura do hash no dispositivo do titular;
- `POST /v1/workflows/:id/signatures/complete`;
- validação imediata e avanço atômico para o próximo signatário.

Tokens serão de uso único, expirarão rapidamente, não serão gravados em logs e não poderão ser reutilizados em outro fluxo.

### 7.3 Retorno ao DocuSeal

O fork receberá uma extensão mínima para anexar:

- PDF original da fase documental;
- PDF final PAdES;
- relatório de validação;
- modalidade e estado PKI;
- hashes e horários relevantes.

O PDF original nunca será sobrescrito. O arquivo entregue como “final” somente será promovido quando o estado for `validated`.

“PDF canônico” significará o mesmo conjunto de bytes apresentado ao primeiro signatário e enviado à preparação PKI. SHA-256, tamanho, identificador do blob e revisão serão conferidos antes e depois de cada transição. Compressão, linearização, marca d'água ou regeneração posterior cancelarão a promoção.

## 8. Conteúdo e navegação do portal

Todas as páginas usarão **Maiocchi Advogado**, `roger@maiocchi.adv.br` e a identificação **Roger Maiocchi, OAB/DF 31.249**.

Rotas previstas:

- `/`: acesso ao documento, modalidades, funcionamento e estado do serviço.
- `/assinaturas-eletronicas/`: simples, avançada e qualificada.
- `/certificacao-digital/`: certificado ICP-Brasil, A1, A3, chave privada, validade e revogação.
- `/assinatura-gov-br/`: percurso externo, reenvio, validação e cadeia de confiança.
- `/validar/`: consulta de autenticidade, hash e relatório.
- `/seguranca/`: controles reais, limites e resposta a incidentes.
- `/ajuda/`: erros, compatibilidade, certificados, GOV.BR e atendimento.
- `/privacidade/`: política completa e versionada.
- `/termos/`: termos completos e versionados.
- `/codigo-fonte/`: DocuSeal, alterações, licenças e código correspondente.

Cada explicação jurídica terá link próximo para a fonte oficial. Links externos abrirão com indicação clara de destino. O verificador automático reprovará link interno quebrado, redirecionamento inesperado e fonte oficial indisponível sem alternativa registrada.

## 9. Padrão de redação

O conteúdo seguirá o cânone do vault `texto`:

1. clareza acima de impessoalidade, concisão, formalidade e beleza;
2. ordem direta e períodos curtos;
3. um parágrafo como unidade completa;
4. cadeia lexical estável para termos técnicos;
5. coerência antes de conectivos;
6. revisão estrutural, argumentativa e estilística;
7. autoridade legal aplicada à informação, sem acumulação ornamental.

O texto público será uma obra acabada. Marcadores internos, nomes de modelos, descrição do pipeline e pendências não aparecerão nas páginas.

## 10. Termos de uso

Os termos finais incluirão, no mínimo:

- identificação do Maiocchi Advogado e do responsável inscrito na OAB;
- escopo do serviço e modalidades disponíveis;
- caráter pessoal de links e códigos;
- dever de leitura e conferência antes da assinatura;
- manifestação de vontade e interrupção do fluxo em caso de erro;
- diferença entre assinatura eletrônica, avançada, GOV.BR e qualificada;
- regras de revisão, cancelamento e nova coleta de assinaturas;
- evidências, trilha de eventos, hashes e relatórios;
- usos proibidos e proteção de credenciais;
- disponibilidade, manutenção e canais de suporte;
- propriedade intelectual, DocuSeal AGPLv3 e componentes Lacuna licenciados;
- referência à política de privacidade;
- versão, vigência, contato e legislação aplicável.

Não haverá cláusula que prometa validade automática para qualquer negócio jurídico. A adequação da modalidade depende da lei, da vontade das partes e do caso concreto.

## 11. Política de privacidade e programa LGPD

A página será a expressão pública de controles reais, não um substituto deles. Antes da publicação final, serão concluídos:

1. inventário de dados e fluxo por sistema;
2. definição documentada de controlador, operadores e suboperadores;
3. registro das operações de tratamento;
4. matriz de finalidade, necessidade e base legal;
5. tabela de retenção e descarte;
6. procedimento de direitos dos titulares;
7. procedimento de incidente e comunicação;
8. contratos e acordos de proteção de dados com fornecedores;
9. avaliação de transferência internacional, se houver SaaS estrangeiro;
10. relatório de impacto quando o risco justificar;
11. teste de restauração, exclusão e restrição de acesso.

O inventário tratará o conteúdo documental como potencialmente sensível conforme o caso concreto. Também identificará o encarregado ou canal equivalente, suboperadores, descarte criptográfico, exclusão em backups e retenções distintas para original, PDF final, logs, hashes, relatórios e uploads GOV.BR.

A política informará:

- identidade e contato do controlador;
- categorias de dados, inclusive conteúdo documental, dados técnicos, trilha, assinatura e dados públicos do certificado;
- finalidades e bases legais efetivamente usadas;
- operadores e categorias de compartilhamento;
- retenção por categoria;
- segurança e seus limites;
- direitos do titular e forma de exercício;
- decisões automatizadas, se existirem;
- transferências internacionais, se existirem;
- incidentes, atualizações e versão da política;
- canal único `roger@maiocchi.adv.br`.

Consentimento não será usado como base genérica. Execução de contrato, obrigação legal, exercício regular de direitos e legítimo interesse somente serão declarados quando o mapeamento real os sustentar.

## 12. Segurança e operação

- Segredos somente em cofre ou variáveis protegidas da VPS.
- Nenhum segredo em Git, imagem, log, HTML ou pacote de código-fonte.
- HMAC em webhooks, TLS interno, CSRF, CORS restrito, CSP e `Cache-Control: no-store` nas sessões PKI.
- Upload com limite, tipo validado, antivírus e processamento isolado.
- Logs com minimização de dados e correlação por identificador opaco.
- Rate limiting por rota, usuário e fluxo.
- Backups cifrados, retenção definida e restauração testada.
- Monitoramento de saúde, fila, expiração de sessões, falhas de validação e certificados de infraestrutura.
- Imagens pinadas por digest e SBOM por release.
- Ambientes de desenvolvimento, homologação e produção separados.
- Raízes e certificados de teste proibidos em produção por teste automatizado.
- Feature flags bloquearão mTLS, assinatura qualificada, perfil avançado e publicação de alegações até os respectivos gates.

## 13. E-mail e comunicação

- Remetente, resposta, suporte, rodapés e links usarão `roger@maiocchi.adv.br`.
- SPF, DKIM e DMARC serão validados antes do primeiro convite real.
- O e-mail não conterá o documento nem dados além do necessário.
- Convite, lembrete, conclusão, falha e revogação terão modelos consistentes.
- Cada link será absoluto, expirável quando aplicável e testado no ambiente correspondente.

## 14. Ordem executável do trabalho

### 14.1 Gates externos obrigatórios

- Licença comercial, produto, política de assinatura, API, suporte e ambiente Lacuna definidos.
- Autorização inequívoca antes de reutilizar qualquer trecho de `PkiSuiteSamples`; na ausência, implementação limpa a partir da documentação.
- Acordos de tratamento e suboperação concluídos.
- Certificados ICP-Brasil A1/A3 disponíveis para homologação real, sem exposição de senha ou PIN.
- SMTP de `roger@maiocchi.adv.br` e registros DNS disponíveis.
- Identificação completa do controlador e do canal de titulares confirmada para a política final.

O loop pode adiantar tarefas independentes, mas não marca um gate externo como concluído sem documento, credencial instalada por canal seguro ou teste real.

| ID | Entrega | Dependências | Evidência de conclusão |
|---|---|---|---|
| G01 | Criar repositórios e baseline reproduzível | nenhuma | importação fiel, Git limpo, tag implantada, inventário de imagens/env/volumes, backup e rollback testados |
| G02 | ADR de produto Lacuna e contrato comercial | G01 | licença, API e uso on-prem/SaaS documentados |
| G03 | Arquitetura de dados, ameaça e LGPD preliminar | G01 | ADRs, diagrama, estados, threat model, inventário e bases de tratamento validados |
| G04 | Homologação REST PKI Core/Web PKI | G02, G03 | assinatura PAdES de teste válida, sem raiz de teste em produção |
| G05 | Implementar `pki-bridge` | G03, G04 | testes unitários e contrato de API verdes |
| G06 | Integrar webhook e PDF congelado | G05 | evento idempotente, hash e artefato imutável |
| G07 | Implementar PAdES sequencial | G06 | 1 e múltiplas assinaturas válidas |
| G08 | Implementar validação e perfil PAdES contratado | G07 | política, LTV/tempo quando aplicáveis, relatório e validação independente |
| G09 | Integrar retorno ao DocuSeal | G06, G08 | original e final acessíveis sem sobrescrita |
| G10 | Implementar percurso GOV.BR | G05 | cadeia importada, upload e validação aprovados |
| G11 | Atualizar identidade e design system | G01 | varredura sem nomes/e-mails antigos |
| G12 | Escrever e conectar conteúdo oficial | G11 | páginas, fontes e links verificados |
| G13 | Implementar termos e programa LGPD | G02, G03, G12 | controles reais, documentos versionados e revisão jurídica |
| G14 | Configurar SMTP e mensagens | G11 | SPF/DKIM/DMARC e entregas de teste aprovados |
| G15 | Testes E2E e de segurança | G07, G08, G09, G10, G11, G12, G13, G14 | matriz completa verde |
| G16 | Homologação com certificados reais | G15 | A1/A3, expirado, revogado, replay e adulteração testados |
| G17 | Publicar com rollback | G16 | produção saudável, backup e rollback ensaiados |
| G18 | Auditoria final de 0 pendência | G17 | seção 15 integralmente comprovada |

## 15. Definition of Done

### Funcional

- DocuSeal cria e conclui o documento.
- O PDF é congelado e identificado por hash.
- A assinatura qualificada funciona com certificado ICP-Brasil compatível.
- Múltiplas assinaturas PAdES permanecem válidas em série.
- Certificado expirado, revogado ou fora da política falha de forma fechada.
- Assinatura parcial, `ByteRange` inconsistente ou alteração posterior falha de forma fechada.
- O fluxo GOV.BR externo retorna ao portal e é validado.
- O PDF final, o original e o relatório permanecem vinculados à submissão.
- Convites, lembretes e conclusões chegam pelo e-mail padronizado.

### Jurídico e privacidade

- Termos e política correspondem ao tratamento real.
- Todas as modalidades são nomeadas corretamente.
- `Maiocchi Advogado`, `roger@maiocchi.adv.br` e `Roger Maiocchi, OAB/DF 31.249` aparecem onde necessário.
- Registro de tratamento, retenção, titulares, incidentes e fornecedores estão operacionais.
- Conteúdo documental potencialmente sensível, descarte e exclusão em backups estão contemplados.
- Contratos e licenças Lacuna estão válidos.
- Código e avisos AGPL do DocuSeal estão disponíveis.

### Conteúdo e experiência

- Todas as rotas previstas existem e estão ligadas à navegação.
- Nenhum link interno retorna 404.
- Links oficiais são verificados e têm origem identificada.
- Não existe texto de função ainda indisponível apresentado como função ativa.
- Desktop e mobile passam em acessibilidade e não apresentam sobreposição.
- O portal inteiro usa a mesma identidade, linguagem e estrutura.

### Engenharia e operação

- Build, lint, testes unitários, integração e E2E estão verdes.
- Concorrência, idempotência, replay de webhook, replay de sessão e troca de workflow falham com segurança.
- PDFs grandes, protegidos, malformados, com formulário e uploads inválidos são tratados de forma fechada.
- Certificados válidos, expirados, revogados, com cadeia incompleta, política errada e propósito inadequado estão cobertos.
- O PDF final passa no validador Lacuna, no Adobe Reader e, quando aplicável, no Validador oficial do ITI; a cobertura `ByteRange` é verificada por ferramenta independente.
- Não há TODO, credencial de teste, chave, senha ou token no código e nas imagens.
- Backups e restauração foram testados.
- Observabilidade e alertas estão ativos.
- Deploy e rollback foram ensaiados.
- Imagens, dependências, hashes e fontes correspondem ao release publicado.
- O pacote AGPL corresponde ao commit e ao digest da imagem implantada e contém instruções reproduzíveis de build.

## 16. Protocolo do loop governado

Após aprovação deste plano e satisfação do gate comercial da Lacuna:

1. iniciar `/goal` com este arquivo como walkthrough canônico;
2. executar no máximo duas tarefas independentes em paralelo;
3. reler o objetivo e o estado a cada iteração;
4. validar cada entrega diretamente no código, nos testes, na VPS e nos PDFs;
5. reabrir qualquer tarefa cuja evidência seja parcial;
6. não criar trabalho artificial quando o critério já estiver satisfeito;
7. não declarar conclusão enquanto houver dependência externa, teste real ou controle LGPD sem prova;
8. encerrar somente quando G01 a G18 e toda a seção 15 estiverem verdes.

O loop não transforma dependência externa em fato. Sem licença e credenciais de produção da Lacuna, contrato de tratamento e certificado real para homologação, a solução pode chegar à homologação técnica, mas não pode ser honestamente declarada 100% concluída em produção.

## 17. Fontes primárias

- `https://github.com/docusealco/docuseal`
- `https://github.com/LacunaSoftware/PkiSuiteSamples`
- `https://docs.lacunasoftware.com/pt-br/articles/rest-pki/index.html`
- `https://docs.lacunasoftware.com/pt-br/articles/web-pki/index.html`
- `https://www.gov.br/iti/pt-br/acesso-a-informacao/perguntas-frequentes/certificacao-digital`
- `https://www.gov.br/iti/pt-br/assuntos/assinatura-eletronica-avancada/assinatura-eletronica-avancada`
- `https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica/assinatura-eletronica-para-orgaos`
- `https://www.gov.br/conecta/catalogo/apis/assinatura-digital-avancada`
- `https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica/saiba-como-importar-os-certificados-do-gov-br-no-adobe-acrobat-reader`
- `https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm`
- `https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm`
