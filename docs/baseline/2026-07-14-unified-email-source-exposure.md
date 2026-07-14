# Baseline de contato unico e exposicao restrita da fonte - 2026-07-14

- Status: implantado e validado em producao
- Ambiente oficial: `https://assinatura.maiocchi.adv.br`
- Portal: `maiocchi/assinatura-portal:1.13.1`
- DocuSeal: `maiocchi/docuseal:3.0.1-maiocchi.4`
- Commit: `ef339826da2aff082120aab8918761bdce11bf27`
- Tag assinada: `portal-v1.13.1`
- Backup anterior ao release: `20260714T170542Z`

Esta baseline fixa a identidade de contato do portal e elimina a divulgacao
editorial do repositorio ou de pacotes de codigo-fonte. A unica excecao e a
oferta minima da fonte correspondente exigida pela licenca AGPL na interface
do DocuSeal modificado.

## Regra una de e-mail

- `[V]` O unico endereco institucional, de suporte e transacional e
  `roger@maiocchi.adv.br`.
- `[V]` O remetente canonico e
  `Maiocchi. Assinatura <roger@maiocchi.adv.br>`.
- `[V]` Constantes de marca, traducoes, paginas de erro, ajuda e mensagens
  transacionais do DocuSeal usam o endereco canonico.
- `[V]` As superficies renderizadas nao contem os enderecos legados nem o
  contato do fornecedor.
- `[V]` Uma mensagem real do `SettingsMailer` foi entregue pelo iCloud e
  recebida no Apple Mail com remetente e corpo canonicos, sem link de fonte e
  sem contato legado.
- `[V]` Os cabecalhos da mensagem recebida registraram `SPF=pass`,
  `DKIM=pass` e `DMARC=pass`.

Nenhuma senha especifica de app, token, cookie ou outra credencial integra o
repositorio, a imagem, esta baseline ou os logs de validacao.

## Exposicao de codigo-fonte

- `[V]` A pagina publica `/codigo-fonte/` foi removida e responde `404`.
- `[V]` O arquivo publico legado
  `/codigo-fonte/docuseal-maiocchi-3.0.1.tar.gz` foi removido e responde
  `404`.
- `[V]` Menu, rodape, paginas institucionais, paginas de erro e e-mails nao
  oferecem download, repositorio ou link de codigo-fonte.
- `[V]` O e-mail transacional ensaiado nao continha link de fonte.
- `[V]` A fonte correspondente exata da imagem DocuSeal implantada permanece
  preservada em
  `compliance/docuseal-maiocchi-3.0.1-maiocchi.4.tar.gz`.
- `[V]` O pacote local e o obtido pelo endereco imutavel da tag possuem o
  mesmo SHA-256:
  `c5432a8625215a9433f9622bad1bb9b825e7c3d2390238cd70b129f394634039`.

A AGPLv3, secao 13, exige que uma versao modificada acessada por rede ofereca
proeminentemente sua fonte correspondente aos usuarios remotos. Por isso,
somente tres templates funcionais do DocuSeal mantem a indicacao discreta
`Fonte correspondente (AGPL)`:

1. `app/views/layouts/application.html.erb`;
2. `app/views/shared/_powered_by.html.erb`;
3. `app/views/templates_share_link_qr/_branding.html.erb`.

Essa oferta nao aparece no portal editorial, no menu, no rodape institucional
ou em e-mails. Sua remocao integral exige licenca comercial ou proprietaria
separada. Referencia: [GNU Affero General Public License, secao
13](https://www.gnu.org/licenses/agpl-3.0.html#section13).

## Evidencias da implantacao

| Controle | Resultado validado |
|---|---|
| Portal | `healthy`, imagem `sha256:542d8f67b9bd98966705f4d583bae1dc0a1c7664d1e18a6a98da956994685043` |
| DocuSeal | `healthy`, imagem `sha256:968915dca627b37fe62b38d1f7fc4d757a089f8d04ffb900ae8e92e475589579` |
| PostgreSQL | `healthy`; container nao recriado no release |
| Home | HTTP `200`, sem e-mail legado, fonte ou GitHub |
| Ajuda | HTTP `200`, somente `roger@maiocchi.adv.br` |
| Pagina de fonte removida | HTTP `404` |
| Arquivo publico legado | HTTP `404` |
| Fonte correspondente imutavel | HTTP `200` e SHA-256 identico |
| Testes | 64 totais, 61 aprovados, 3 skips condicionais, 0 falha |
| Lint e integridade do diff | aprovados |
| Assinatura Git | commit e tag com assinatura ED25519 valida |

O backup anterior ao release contem portal, configuracao e banco do DocuSeal,
configuracao e banco da PKI bridge e configuracao do proxy. A verificacao de
rollback em modo seco aprovou leitura e restaurabilidade de todos os seis
artefatos. Um cache de compilacao sem efeito no runtime foi movido para
quarentena reversivel na VPS, sem exclusao destrutiva.

## Qualidade visual

`[V]` A home em desktop e mobile e a ajuda em mobile foram renderizadas por
Playwright apos a publicacao. Nao houve sobreposicao, lacuna de layout ou
regressao responsiva; o rodape nao exibe fonte e a ajuda apresenta o contato
canonico.

Viewports inspecionados:

- desktop: pagina inicial;
- mobile: pagina inicial;
- mobile: central de ajuda.

## Invariantes de regressao

1. Toda nova superficie de contato ou envio deve usar exclusivamente
   `roger@maiocchi.adv.br`.
2. Nao criar pagina, menu, botao, rodape, anexo ou mensagem de e-mail para
   divulgar repositorio ou pacote de fonte.
3. Preservar somente a oferta AGPL minima enquanto o DocuSeal modificado for
   disponibilizado sem licenca separada.
4. Cada nova imagem DocuSeal exige pacote de fonte correspondente exato, URL
   imutavel, hash registrado e teste de recuperacao.
5. Toda publicacao deve repetir lint, testes, probes HTTP, busca por contatos
   legados, entrega real de e-mail e validacao visual responsiva.
