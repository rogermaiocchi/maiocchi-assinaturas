import type { Metadata } from "next";
import { BadgeCheck, Cloud, KeyRound, ShieldCheck } from "lucide-react";
import { FlowMap } from "../flow-map";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Certificado ICP-Brasil" };

export default function IcpBrasilCertificatePage() {
  return (
    <LegalPage
      title="Certificado ICP-Brasil"
      lead="Autorize a assinatura qualificada em uma sessão remota protegida. Certificados em nuvem dispensam instalação."
      currentPath="/certificado-icp-brasil/"
    >
      <FlowMap
        eyebrow="Assinatura remota"
        title="A chave permanece no PSC. O portal recebe apenas o resultado."
        description="O gateway prepara o PDF e redireciona o titular ao prestador de serviço de confiança. A autorização ocorre no ambiente protegido do PSC e o portal valida o PAdES antes de liberar o arquivo."
        ariaLabel="Fluxo de uso de certificado digital ICP-Brasil no portal"
        steps={[
          { title: "Preparar", description: "O gateway congela o PDF, calcula evidências e abre uma sessão de assinatura remota.", icon: Cloud },
          { title: "Identificar", description: "O prestador apresenta os certificados compatíveis vinculados ao titular.", icon: BadgeCheck },
          { title: "Autorizar", description: "O titular confirma a operação no mecanismo forte oferecido pelo PSC.", icon: KeyRound, tone: "yellow" },
          { title: "Validar PAdES", description: "O gateway confere cadeia, política, integridade e revogação antes de liberar o PDF.", icon: ShieldCheck, href: "/#validar", linkLabel: "Validar depois" },
        ]}
      />

      <h2>Como usar</h2>
      <p>Abra o link individual do documento, confira os dados e selecione <strong>Autorizar no PSC</strong>. Com certificado em nuvem, o redirecionamento protegido permite confirmar a assinatura sem extensão, aplicativo ou agente instalado.</p>
      <h2>Requisito do certificado</h2>
      <p>O percurso sem instalação exige certificado ICP-Brasil A3 em nuvem ativo em um PSC credenciado e conectado ao gateway. Um certificado guardado apenas em token USB continua no computador do titular e exige uma ponte local autorizada pelo prestador; a VPS não consegue acessar fisicamente esse dispositivo.</p>
      <h2>Proteção da credencial</h2>
      <p>O Maiocchi Advogado não solicita arquivo A1, PIN, senha ou chave privada. A credencial de autorização deve ser informada somente na página oficial do PSC exibida após o redirecionamento.</p>
      <h2>Arquitetura</h2>
      <p>A VPS opera como gateway de assinatura remota e mantém trilha de auditoria, evidências e validação PAdES. A custódia da chave e a autorização do titular permanecem no PSC credenciado.</p>
      <h2>Fonte oficial</h2>
      <p>Consulte a <a href="https://www.gov.br/iti/pt-br/assuntos/icp-brasil/lista-de-prestadores-de-servico-de-confianca-psc" target="_blank" rel="noreferrer">lista de prestadores de serviço de confiança credenciados pelo ITI</a>.</p>
    </LegalPage>
  );
}
