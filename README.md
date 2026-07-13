# Maiocchi Assinaturas

Porta de entrada institucional para o ambiente de documentos e assinaturas do Maiocchi Advogado.

## Arquitetura

- `assinatura.maiocchi.adv.br`: entrada única para o portal estático e para as rotas operacionais do DocuSeal.
- As rotas de signatários (`/s`, `/d`, `/e` e `/p`) são encaminhadas ao DocuSeal no mesmo domínio.
- A autenticação de advogados é iniciada na página inicial por endpoints internos de sessão; `/sign_in` e o `/dashboard` não autenticado reconduzem ao bloco `#advogados`. O dashboard operacional só é apresentado depois do login.
- A validação Maiocchi e o VALIDAR ITI ficam incorporados no bloco `#validar`; a rota legada `/validar/` preserva consultas e reconduz à página inicial.
- `documentos.assinatura.maiocchi.adv.br` existe somente para redirecionar links antigos ao domínio principal, preservando caminho e consulta.

A marca `m.` é renderizada em CSS no portal para manter fundo transparente e baixo custo de transferência. Os ativos `public/icon-512.png` e favicons reproduzem a mesma marca para navegador e instalação.

## Desenvolvimento

```bash
npm ci
npm run dev
npm run test
npm run lint
```

## Implantação

O projeto gera uma exportação estática do Next.js e a serve com Nginx sem privilégios. O `compose.yml` conecta o container somente à rede externa do Traefik. As rotas TLS ficam em `deploy/traefik-assinatura.yml`.

O compose reproduzível do motor documental fica em `deploy/docuseal.yml`; valores sensíveis permanecem exclusivamente no `.env` da VPS.

Variáveis públicas de build:

- `NEXT_PUBLIC_DOCUMENTS_URL`: origem do DocuSeal para links de documentos.
- `NEXT_PUBLIC_ICP_URL`: entrada da área dos advogados que oferece autenticação por certificado cliente.
- `NEXT_PUBLIC_PKI_BRIDGE_URL`: origem pública do `pki-bridge`; vazio usa o mesmo domínio do portal.

O agente macOS privado fica em `clients/pades-token-agent`. O motor DSS fica em `services/pades-provider` e não possui rota pública.

Segredos não pertencem a este repositório. O painel DocuSeal, o PostgreSQL e as credenciais administrativas são geridos separadamente no VPS e no Keychain do operador.

O procedimento canônico do MacBook está em [`docs/operations/macbook-standard.md`](docs/operations/macbook-standard.md).
