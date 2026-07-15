# Baseline de e-mail transacional iCloud

Data: 14/07/2026

## Escopo

Esta baseline fixa o transporte de códigos e alertas do portal
`assinatura.maiocchi.adv.br` pelo iCloud Mail do domínio customizado
`maiocchi.adv.br`.

## Estado rastreado

- Servidor SMTP: `smtp.mail.me.com`.
- Porta: `587`.
- Segurança: STARTTLS obrigatório e verificação da cadeia TLS ativa.
- Autenticação: SMTP `plain` dentro do canal TLS.
- Identidade SMTP: endereço primário da caixa iCloud; o alias do domínio
  personalizado não é usado para autenticação.
- Remetente: `Maiocchi. Assinatura <roger@maiocchi.adv.br>`.
- Segredo: senha específica de app Apple, somente em `/opt/docuseal/.env`.
- DNS: MX Apple, SPF iCloud, DKIM Apple e DMARC `p=quarantine` confirmados antes da implantação.

## Gates

1. O código e os arquivos versionados não contêm a senha SMTP.
2. A VPS consegue validar o certificado de `smtp.mail.me.com` por STARTTLS.
3. O DocuSeal inicia somente com `SMTP_USERNAME` e `SMTP_PASSWORD` presentes.
4. Uma mensagem real recebe aceite SMTP e chega ao destino.
5. Falha de autenticação ou TLS interrompe o envio; não há fallback para transporte sem criptografia.

## Validação em produção

- Backup anterior à mudança: `20260714T162747Z`.
- Handshake da VPS com o iCloud: TLS 1.3, `TLS_AES_256_GCM_SHA384` e cadeia `OK`.
- Container `docuseal`: saudável após recriação isolada.
- Configuração carregada pelo Rails: SMTP, porta `587`, autenticação `plain`, STARTTLS ativo, SSL/TLS implícitos desativados e verificação de certificado ativa.
- Mensagem de transporte e alerta nativo `SettingsMailer`: aceitos pelo SMTP e recebidos na Caixa de Entrada.
- OTP nativo `TemplateMailer`: aceito e recebido; o ensaio usou objeto transitório não persistido porque o banco ainda não contém modelos.
- Cabeçalhos da mensagem OTP recebida: `SPF=pass`, `DKIM=pass` e `DMARC=pass`.
- Nenhuma credencial foi impressa, versionada ou gravada em log; o `.env` remoto permanece `0600`, `root:root`.

## Correção operacional de 15/07/2026

- [V] Uma prova com `raise_delivery_errors` revelou `535 5.7.8` que a
  configuração comum ocultava. A senha específica de app permanecia válida.
- [V] O iCloud rejeitou o alias `@maiocchi.adv.br` como identidade SMTP e
  aceitou a caixa iCloud primária com código `235`.
- [V] Somente `SMTP_USERNAME` foi corrigido. `From`, `Reply-To`, destinatário e
  identidade pública permaneceram em `roger@maiocchi.adv.br`.
- [V] O DocuSeal foi recriado saudável. O SMTP aceitou a mensagem multipart
  real `Configuração de e-mail concluída`, e a caixa iCloud confirmou seu
  recebimento em 15/07/2026 às 03:14 BRT.
- [V] O estado anterior foi preservado em backup com identificador
  `20260715T061346Z`; nenhum segredo foi impresso ou versionado.

## Referência oficial

A configuração segue os [ajustes oficiais de servidor do iCloud Mail publicados
pela Apple](https://support.apple.com/pt-br/102525): `smtp.mail.me.com`, porta
`587`, SSL/TLS, autenticação obrigatória, endereço iCloud primário completo
como usuário e senha específica de app.
