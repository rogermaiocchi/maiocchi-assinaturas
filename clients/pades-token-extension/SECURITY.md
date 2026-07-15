# Segurança

Relate vulnerabilidades de forma privada para `roger@maiocchi.adv.br`. Não abra
issue pública contendo ticket, certificado, CPF, PIN, chave, log de assinatura
ou documento.

## Garantias do projeto

- chave privada e PIN nunca entram na extensão ou no portal;
- nenhum endpoint de assinatura é acessível sem origem autorizada;
- toda assinatura exige consentimento nativo explícito;
- a extensão não baixa nem executa código remoto;
- a chave privada usada para empacotar a extensão não pertence ao repositório.

## Escopo suportado

São suportados o release mais recente da extensão, o portal oficial e os agentes
nativos assinados indicados pelo portal. Builds alterados, extensões com outro ID
e agentes executados fora de `127.0.0.1:35100` estão fora do escopo.
