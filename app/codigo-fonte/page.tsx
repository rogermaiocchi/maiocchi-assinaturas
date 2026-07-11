import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Código-fonte e licenças" };

export default function SourceCodePage() {
  return <LegalPage title="Código-fonte e licenças" lead="Transparência sobre o motor de assinatura de código aberto utilizado pelo portal.">
    <h2>Motor documental</h2><p>O ambiente de documentos utiliza uma versão modificada do DocuSeal 3.0.1, software distribuído sob a GNU Affero General Public License versão 3.</p>
    <h2>Modificações</h2><p>Em 10 de julho de 2026, interface, identidade visual, navegação, comunicações e autenticação foram adaptadas para o Maiocchi Advogado. O aviso de atribuição original permanece nas interfaces interativas.</p>
    <h2>Código correspondente</h2><p>O código-fonte completo da versão em execução, incluindo os arquivos necessários para construí-la, está disponível no GitHub.</p>
    <p><a className="button button--yellow" href="https://github.com/rogermaiocchi/maiocchi-assinaturas/archive/refs/tags/portal-v1.2.2.zip">Baixar código-fonte no GitHub</a></p>
    <p><a href="https://github.com/rogermaiocchi/maiocchi-assinaturas/tree/portal-v1.2.2" target="_blank" rel="noreferrer">Consultar o repositório e o histórico da versão</a>.</p>
    <h2>Componentes PKI</h2><p>O portal não apresenta a integração Lacuna como ativa enquanto licença, configuração e homologação não estiverem concluídas. Componentes comerciais permanecem sujeitos aos termos do fornecedor e não integram o pacote AGPL do DocuSeal.</p>
    <h2>Licença</h2><p>Consulte a <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noreferrer" target="_blank">GNU AGPLv3</a>, também incluída no pacote do código-fonte.</p>
  </LegalPage>;
}
