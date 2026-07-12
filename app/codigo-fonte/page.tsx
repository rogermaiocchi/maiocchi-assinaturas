import type { Metadata } from "next";
import { Box, Download, GitBranch, Github, ServerCog } from "lucide-react";
import { FlowMap } from "../flow-map";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Código-fonte e licenças" };

export default function SourceCodePage() {
  return <LegalPage title="Código-fonte e licenças" lead="Transparência sobre o motor de assinatura de código aberto utilizado pelo portal." currentPath="/codigo-fonte/">
    <FlowMap eyebrow="Rastreabilidade da versão" title="Do repositório ao ambiente publicado." description="A tag identifica o código correspondente à versão do portal e mantém visíveis origem, licença e modificações." ariaLabel="Fluxo de publicação do código-fonte do portal" steps={[
      { title: "Origem", description: "O motor DocuSeal permanece identificado sob AGPLv3.", icon: GitBranch },
      { title: "Versão Maiocchi", description: "A tag reúne portal, adaptações e código correspondente.", icon: Box, tone: "yellow", href: "https://github.com/rogermaiocchi/maiocchi-assinaturas/tree/portal-v1.8.0", linkLabel: "Ver tag" },
      { title: "Artefato", description: "O pacote imutável pode ser baixado diretamente do GitHub.", icon: Download, href: "https://github.com/rogermaiocchi/maiocchi-assinaturas/archive/refs/tags/portal-v1.8.0.zip", linkLabel: "Baixar ZIP" },
      { title: "Produção", description: "A implantação usa versão identificada, teste e possibilidade de rollback.", icon: ServerCog },
    ]} />
    <h2>Motor documental</h2><p>O ambiente de documentos utiliza uma versão modificada do DocuSeal 3.0.1, software distribuído sob a GNU Affero General Public License versão 3.</p>
    <h2>Modificações</h2><p>Em 12 de julho de 2026, o portal incorporou o registro externo de autenticidade, folha A4 com QR, verificador público, armazenamento por conteúdo e trilha append-only. O aviso de atribuição original do DocuSeal permanece nas interfaces interativas.</p>
    <h2>Código correspondente</h2><p>O código-fonte completo da versão em execução, incluindo os arquivos necessários para construí-la, está disponível no GitHub.</p>
    <p><a className="button button--yellow" href="https://github.com/rogermaiocchi/maiocchi-assinaturas/archive/refs/tags/portal-v1.8.0.zip"><Github aria-hidden="true" size={18} /><span>Baixar código-fonte no GitHub</span><Download aria-hidden="true" size={17} /></a></p>
    <p><a href="https://github.com/rogermaiocchi/maiocchi-assinaturas/tree/portal-v1.8.0" target="_blank" rel="noreferrer">Consultar o repositório e o histórico da versão</a>.</p>
    <h2>Componentes PKI</h2><p>O `pki-bridge`, o motor DSS, o agente macOS, o esquema da chave e o verificador estão no mesmo repositório. O DSS permanece sob LGPL 2.1 e o DocuSeal sob AGPL; cada componente conserva sua licença e fronteira de processo.</p>
    <h2>Licença</h2><p>Consulte a <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noreferrer" target="_blank">GNU AGPLv3</a>, também incluída no pacote do código-fonte.</p>
  </LegalPage>;
}
