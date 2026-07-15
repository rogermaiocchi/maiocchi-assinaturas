# Auditoria de login com certificado digital em produção

Data: 14/07/2026
Release pública: `portal-v1.14.2`

## Implantação

- [V] Portal: `maiocchi/assinatura-portal:1.14.2`.
- [V] Imagem x86_64:
  `sha256:1efe1229b328930c1f1b1b5ae79d156ae37a74b520bcccc53597873b3dcc4c2b`.
- [V] Revisão OCI:
  `475d92b9278ccc5e96f5fc5db3e29f7c512cb188`.
- [V] Runtime: saudável, usuário `101`, filesystem somente leitura,
  `cap_drop=ALL` e `no-new-privileges`.
- [V] DocuSeal `3.0.1-maiocchi.6`, PKI bridge `1.3.17` e PAdES provider
  `1.2.5` permaneceram saudáveis durante a troca do portal.

## Ensaio 1: sessão já existente

1. O Chrome habitual possuía uma sessão DocuSeal válida.
2. O operador acionou "Entrar com certificado digital" na home.
3. O frontend reconheceu o redirecionamento autenticado na mesma origem.
4. A interface exibiu "Acesso confirmado" e habilitou o ambiente de gestão.

Resultado: [V] aprovado. A falha de extração de CSRF observada na `1.14.1` não
se repetiu.

## Ensaio 2: mTLS sem cookies

O ensaio foi repetido em janela anônima do Chrome para impedir a reutilização
de sessão:

| Etapa observada no Traefik | Status |
|---|---:|
| `GET /portal-auth/session` | `200` |
| `POST /portal-auth/certificate` | `200` |
| `POST /certificate_auth/login/present` | `200` |
| `POST /certificate_auth/login/complete` | `302` |

O seletor nativo do Chrome apresentou o certificado A3 conectado. Depois da
confirmação, o navegador retornou à origem principal, a sessão foi reconhecida
e `/dashboard` abriu com o aviso "Acesso realizado com certificado digital".

Resultado: [V] aprovado de ponta a ponta.

## Controles negativos

- [V] Nenhum `OpenSSL::X509::CertificateError` foi emitido.
- [V] Nenhum erro `nested asn1` foi emitido.
- [V] O certificado somente foi apresentado no host mTLS dedicado.
- [V] A transição do relay permaneceu restrita à origem e ao caminho fixados no
  frontend.
- [V] Nenhum PIN ou segredo foi capturado ou registrado na auditoria.

## Conclusão

As duas causas eram independentes e estão encerradas: o parser DocuSeal aceita
com segurança o Base64 bruto do Traefik, e o portal reconhece tanto a sessão
preexistente quanto a sessão criada pelo certificado. O login A3 e o acesso ao
dashboard estão operacionais na release publicada.
