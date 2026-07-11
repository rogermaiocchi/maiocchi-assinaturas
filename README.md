# Maiocchi Assinaturas

Porta de entrada institucional para o ambiente de documentos e assinaturas do Maiocchi Advogado.

## Arquitetura

- `assinatura.maiocchi.adv.br`: portal estático deste projeto.
- `documentos.assinatura.maiocchi.adv.br`: painel interno e motor de assinatura DocuSeal.
- Os links de signatários (`/s`, `/d`, `/e` e `/p`) usam o subdomínio de documentos, com a mesma identidade visual do portal.

O ativo `public/icon-512.png` é a marca `m.` canônica do portal e também origina os ícones de navegador.

## Desenvolvimento

```bash
npm ci
npm run dev
npm run test
npm run lint
```

## Implantação

O projeto gera uma exportação estática do Next.js e a serve com Nginx sem privilégios. O `compose.yml` conecta o container somente à rede externa do Traefik. As rotas TLS ficam em `deploy/traefik-assinatura.yml`.

Variáveis públicas de build:

- `NEXT_PUBLIC_DOCUMENTS_URL`: origem do DocuSeal para links de documentos.
- `NEXT_PUBLIC_LAWYERS_URL`: entrada da área de gestão.
- `NEXT_PUBLIC_ICP_URL`: endpoint de autenticação por certificado cliente.
- `NEXT_PUBLIC_WEB_PKI_LICENSE`: licença pública Lacuna Web PKI para o domínio; sem ela, o componente só deve ser usado em `localhost`.
- `NEXT_PUBLIC_PKI_BRIDGE_URL`: endpoint público do `pki-bridge`, quando a assinatura PAdES estiver habilitada.

Segredos não pertencem a este repositório. O painel DocuSeal, o PostgreSQL e as credenciais administrativas são geridos separadamente no VPS e no Keychain do operador.

O procedimento canônico do MacBook está em [`docs/operations/macbook-standard.md`](docs/operations/macbook-standard.md).
