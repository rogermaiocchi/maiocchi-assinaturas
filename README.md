# Maiocchi Assinaturas

Porta de entrada institucional para o ambiente de documentos e assinaturas do Maiocchi Advogado.

## Arquitetura

- `assinatura.maiocchi.adv.br`: portal estático deste projeto.
- `documentos.assinatura.maiocchi.adv.br`: painel interno e motor de assinatura DocuSeal.
- Os links de signatários (`/s`, `/d`, `/e` e `/p`) usam o subdomínio de documentos, com a mesma identidade visual do portal.

O logotipo é reproduzido por tipografia e CSS; o JPEG de referência não é publicado.

## Desenvolvimento

```bash
npm ci
npm run dev
npm run test
npm run lint
```

## Implantação

O projeto gera uma exportação estática do Next.js e a serve com Nginx sem privilégios. O `compose.yml` conecta o container somente à rede externa do Traefik. As rotas TLS ficam em `deploy/traefik-assinatura.yml`.

Segredos não pertencem a este repositório. O painel DocuSeal, o PostgreSQL e as credenciais administrativas são geridos separadamente no VPS e no Keychain do operador.

O procedimento canônico do MacBook está em [`docs/operations/macbook-standard.md`](docs/operations/macbook-standard.md).
