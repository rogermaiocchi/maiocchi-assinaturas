# Pesquisa de provider PAdES no navegador

Data: 2026-07-12

## Direcao

Encontrar uma solucao real para retirar a geracao PAdES pelo navegador do estado `fail-closed`, sem fingir assinatura quando faltarem licenca, security context, homologacao ou provider criptografico.

## Resultado

A solucao recomendada permanece **Lacuna REST PKI Core on-premises + Web PKI**, contratada e licenciada para os dominios do Maiocchi Advogado.

Motivo: o desenho da Lacuna corresponde exatamente ao problema do portal. O backend prepara os bytes assinaveis e monta o PDF/CMS/XML final; o frontend, via Web PKI, acessa o certificado local ou token e assina os bytes com a chave privada que nao sai do dispositivo.

Fontes principais:

- https://docs.lacunasoftware.com/en-us/articles/web-pki/index.html
- https://docs.lacunasoftware.com/en-us/articles/web-pki/get-started.html
- https://docs.lacunasoftware.com/en-us/articles/pki-guide/web-signatures/remote.html
- https://github.com/LacunaSoftware/PkiSuiteSamples
- https://github.com/LacunaSoftware/RestPkiSamples

## Evidencias da pesquisa

### Lacuna

Web PKI lista certificados de software ou hardware, le o certificado, assina dados ou hashes e executa assinaturas remotas com apoio de SDK/backend. Fora de `localhost`, exige licenca valida associada ao dominio. A propria documentacao recomenda REST PKI + Web PKI para assinatura web remota.

`PkiSuiteSamples` e `RestPkiSamples` sao repositorios de exemplo em varias linguagens. Eles demonstram o caminho de integracao, mas exigem API key/licenca e nao devem ser copiados como dependencia de producao sem autorizacao expressa.

### nsoftware PKI Agent

Alternativa tecnica viavel para prova de conceito. O PKI Agent expoe uma API REST em `localhost`, acessa certificados do sistema e tokens PKCS#11 e devolve assinatura ao navegador. Para PDF, a propria documentacao separa preparo remoto, assinatura pelo agente local e completacao do PDF.

Fontes:

- https://www.nsoftware.com/pkiagent
- https://www.nsoftware.com/kb/articles/pkiagent-pdf-signing

Risco: e uma ponte generica. O portal ainda precisa de componente PDF/PAdES robusto e validacao ICP-Brasil. A edicao pessoal e gratuita, mas distribuicao exige licenca.

### SimpleSign

Biblioteca .NET MIT promissora para PAdES/CAdES/XAdES e validacao ICP-Brasil. Serve como alternativa de backend ou validador complementar, nao como solucao completa de token A3 no navegador, porque nao resolve sozinha o acesso browser -> token.

Fontes:

- https://github.com/eupassarin/simplesign
- https://github.com/eupassarin/simplesign/blob/main/docs/articles/icp-brasil.md

### OpenICP-BR

`libICP` e `wxApp` ajudam em CAdES e referencia de fluxo ICP-Brasil, mas nao entregam PAdES web com A3/token no navegador. Tambem ha impacto de licenca AGPL nos projetos analisados.

Fontes:

- https://github.com/OpenICP-BR/libICP
- https://github.com/OpenICP-BR/wxApp

### Gov.br e ITI

A API de assinatura avancada/qualificada gov.br documenta fluxo por OAuth/PSC e pode produzir assinatura PKCS#7/.p7s. Nao substitui o provider PAdES privado do escritorio, e seu uso e voltado a integracoes habilitadas com o Poder Publico.

O Plugin PAdES ICP-Brasil oficial do gov.br e para Adobe Acrobat Reader. Ele valida a existencia do padrao, mas nao e uma API de navegador para o portal.

Fontes:

- https://manual-integracao-assinatura-eletronica.servicos.gov.br/pt_BR/latest/iniciarintegracao.html
- https://github.com/servicosgovbr/manual-integracao-assinatura-eletronica
- https://www.gov.br/pt-br/servicos/download-do-plugin-pades-icp-brasil

### Hugging Face

Busca por `PAdES`, `ICP-Brasil`, `PKCS11 PDF signature` e `Lacuna Web PKI` nao encontrou modelo ou dataset operacional para resolver a camada criptografica. HF nao e rota tecnica relevante para esta dependencia.

## Contrato tecnico minimo

O portal deve manter a interface de provider com tres familias:

1. `lacuna-restpki-core`: provider recomendado para producao apos licenca, security context e teste validado.
2. `pki-agent-poc`: provider opcional para prova local controlada com nsoftware PKI Agent, sem promocao automatica para producao.
3. `disabled`: provider padrao fail-closed, sem emissao de PDF assinado.

Nenhum provider pode promover documento para `pki_completed` sem:

- certificado ICP-Brasil lido e vinculado ao signatario;
- PDF final PAdES gerado;
- hash SHA-256 do PDF final registrado;
- validacao criptografica e politica PAdES registrada;
- relatorio arquivado;
- teste real com token A3 ou certificado A1 equivalente em homologacao;
- origem HTTPS e dominio licenciados.

## Plano de destravamento

1. Solicitar proposta Lacuna para REST PKI Core on-premises + Web PKI, incluindo dominio `assinatura.maiocchi.adv.br`, homologacao, security context ICP-Brasil, timestamp e suporte.
2. Pedir ao fornecedor um exemplo minimo autorizado para Node/Next ou REST puro: start signature, Web PKI sign, complete signature, validate signature.
3. Em paralelo, executar POC local com nsoftware PKI Agent para provar o caminho browser -> agente local -> token A3 -> assinatura remota, sem declarar conformidade final.
4. Reaproveitar o `pki-bridge` atual: adicionar provider selecionavel por variavel de ambiente, manter `disabled` como default.
5. Criar teste de aceitacao com PDF pequeno: assinar, baixar PDF final, calcular hash, validar no portal e no Validar ITI quando aplicavel.

## Decisao operacional

Enquanto nao houver licenca e security context reais da Lacuna ou provider equivalente homologado, o estado correto continua sendo `fail-closed`.

A solucao tecnica existe. O bloqueio remanescente nao e de codigo puro: e contratual, de distribuicao do agente/browser bridge, politica de assinatura e homologacao criptografica.
