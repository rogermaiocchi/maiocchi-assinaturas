import type { Metadata } from "next";
import { BadgeCheck, FileKey, KeyRound, ShieldCheck } from "lucide-react";
import { FlowMap } from "../flow-map";
import { LegalPage } from "../legal-page";
import { WebPkiPanel } from "./web-pki-panel";

export const metadata: Metadata = { title: "Certificado ICP-Brasil" };

export default function IcpBrasilCertificatePage() {
  return (
    <LegalPage
      title="Certificado ICP-Brasil"
      lead="Use o token ou certificado local para autenticação e preparação da assinatura qualificada quando o documento exigir essa modalidade."
      currentPath="/certificado-icp-brasil/"
    >
      <FlowMap
        eyebrow="Fluxo habilitado"
        title="O token assina localmente. O portal só recebe o resultado."
        description="A chave privada permanece no dispositivo do titular. O navegador lista o certificado, assina o hash preparado e devolve a assinatura para fechamento PAdES."
        ariaLabel="Fluxo de uso de certificado digital ICP-Brasil no portal"
        steps={[
          { title: "Detectar", description: "O Web PKI identifica certificados disponíveis no computador ou token conectado.", icon: FileKey },
          { title: "Escolher", description: "O titular seleciona conscientemente o certificado correto para o documento.", icon: BadgeCheck },
          { title: "Autorizar", description: "O PIN é digitado apenas no componente local seguro do certificado.", icon: KeyRound, tone: "yellow" },
          { title: "Fechar PAdES", description: "O bridge monta o PDF assinado e valida cadeia, integridade e revogação.", icon: ShieldCheck, href: "/validar/", linkLabel: "Validar depois" },
        ]}
      />

      <WebPkiPanel />

      <h2>Como usar</h2>
      <p>Conecte o token, mantenha o driver do certificado ativo, abra esta página em navegador compatível e selecione o certificado correspondente ao titular. O teste local assina apenas um hash de verificação; ele não altera documento algum.</p>
      <h2>Limite técnico</h2>
      <p>A autenticação por certificado comprova uma sessão. A assinatura qualificada de documento exige a etapa PAdES, preparada no serviço PKI, assinada no token e fechada no arquivo PDF final.</p>
      <h2>Proteção da credencial</h2>
      <p>O Maiocchi Advogado não solicita arquivo A1, PIN, senha do token ou chave privada. O PIN deve aparecer somente na janela segura do certificado ou do componente local autorizado.</p>
      <h2>Fonte técnica</h2>
      <p>A integração cliente segue a documentação da Lacuna Web PKI para listagem de certificados e assinatura local de dados ou hash por JavaScript.</p>
    </LegalPage>
  );
}
