import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Cloud, FileKey, KeyRound, ShieldCheck } from "lucide-react";
import { FlowMap } from "../flow-map";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Certificação digital" };

export default function DigitalCertificatePage() {
  return <LegalPage title="Certificação digital" lead="Certificado ICP-Brasil é identidade digital e instrumento de assinatura qualificada." currentPath="/certificacao-digital/">
    <FlowMap eyebrow="Fluxo criptográfico" title="A chave permanece com o titular." description="O portal recebe o resultado assinado, nunca a chave privada, o arquivo A1, o PIN ou a senha." ariaLabel="Fluxo seguro de uso de certificado digital ICP-Brasil" steps={[
      { title: "Abrir sessão", description: "O gateway prepara o documento e cria uma sessão protegida no PSC.", icon: Cloud },
      { title: "Selecionar certificado", description: "Escolha a identidade digital compatível apresentada pelo prestador.", icon: FileKey },
      { title: "Autorizar no PSC", description: "Confirme a operação somente no ambiente oficial do prestador.", icon: KeyRound, tone: "yellow" },
      { title: "Produzir assinatura", description: "A operação associa autoria e protege a integridade do conteúdo.", icon: ShieldCheck },
      { title: "Validar", description: "Confira cadeia, política, validade e alterações posteriores.", icon: BadgeCheck, href: "/#validar", linkLabel: "Abrir validação" },
    ]} />
    <h2>O que é</h2><p>O certificado digital ICP-Brasil é emitido por autoridade certificadora credenciada e vincula uma pessoa ou entidade a um par de chaves criptográficas depois da verificação de identidade.</p>
    <h2>A1, A3 e nuvem</h2><p>O A1 é normalmente armazenado em software. O A3 pode usar token, cartão ou serviço em nuvem. No fluxo sem instalação deste portal, a assinatura qualificada utiliza certificado A3 em nuvem custodiado por PSC credenciado, sempre sob autorização do titular. Token físico exige ponte local porque a chave permanece no dispositivo conectado ao computador.</p>
    <h2>Certificado OAB</h2><p>O certificado digital OAB é destinado a advogados inscritos e pode ser utilizado em serviços profissionais, observadas a política do certificado e as regras do sistema acessado.</p>
    <h2>O que a assinatura comprova</h2><p>A assinatura digital permite verificar autoria e integridade. Alterações posteriores no conteúdo coberto pela assinatura devem ser detectadas pelo validador. Assinar não cifra o documento nem o torna sigiloso.</p>
    <h2>Validade e revogação</h2><p>O certificado possui prazo de validade. Comprometimento, perda de controle ou informação incorreta exige contato com a autoridade certificadora para avaliar a revogação. Um certificado expirado ou revogado não deve ser aceito como válido fora das regras aplicáveis.</p>
    <h2>Cuidados</h2><p>Nunca envie arquivo A1, senha, PIN ou chave privada ao escritório. Informe a credencial somente no ambiente oficial do PSC para o qual o portal redirecionar. Desconfie de pedido por e-mail, telefone ou mensagem.</p>
    <p><Link className="button button--dark" href="/certificado-icp-brasil/"><FileKey aria-hidden="true" size={17} /><span>Usar certificado ICP-Brasil</span><ArrowRight aria-hidden="true" size={16} /></Link></p>
    <h2>Fonte oficial</h2><p>Consulte as <a href="https://www.gov.br/iti/pt-br/acesso-a-informacao/perguntas-frequentes/certificacao-digital" target="_blank" rel="noreferrer">perguntas frequentes do Instituto Nacional de Tecnologia da Informação</a>.</p>
  </LegalPage>;
}
