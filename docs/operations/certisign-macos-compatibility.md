# Matriz de compatibilidade Certisign A3 no macOS

## Regra de liberação

Uma combinação só recebe status `aprovado` depois de prova reproduzível em ambiente controlado: detecção da identidade pelo agente, confirmação local, assinatura RSA-SHA256 no token, PAdES concluído pelo DSS e validação independente positiva. Ausência de teste significa `não avaliado`, nunca compatível por presunção.

| Mídia e modelo | Firmware | Gerenciador/driver | Módulo criptográfico | macOS | Agente | Resultado A3 | PAdES validado | Evidência | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Preencher após inventário | Preencher | Preencher | Preencher | Preencher | Preencher | Preencher | Preencher | Relatório assinado e hash | Não avaliado |

## Procedimento por combinação

1. Registrar fabricante, modelo, firmware, versão do driver/gerenciador e versão do macOS.
2. Verificar a procedência do instalador conforme página oficial do fabricante/Certisign; registrar URL, data e SHA-256 local do pacote obtido.
3. Confirmar que o agente lista a identidade e que a chave é RSA e não exportável.
4. Executar assinatura de PDF de homologação com ticket descartável e confirmar que o PIN não transita no portal nem em logs.
5. Validar o PDF pelo DSS e pelo VALIDAR ITI; preservar hashes do PDF, relatório e ambiente de teste.
6. Repetir depois de atualização de macOS, driver, firmware ou agente.

## Responsabilidade e cadência

O responsável técnico do portal mantém esta matriz. Revisão trimestral e revisão extraordinária após atualização de segurança, incompatibilidade ou alteração normativa do ITI.

## Fonte

A Certisign informa que a utilização do A3 no macOS depende da mídia, do gerenciador criptográfico e do driver; certas mídias possuem limitações ou requisitos específicos. Consulte sempre a [página oficial de drivers A3](https://suporte.certisign.com.br/duvidas-suporte/certificado-a3-drivers?cod_rev=102497) antes de instalar ou alterar um ambiente.
