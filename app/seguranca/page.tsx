import type { Metadata } from "next";
import { ArchiveRestore, Fingerprint, Network, ShieldCheck } from "lucide-react";
import { FlowMap } from "../flow-map";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Segurança" };

export default function SecurityPage() {
  return <LegalPage title="Segurança" lead="Controles reais, limites claros e cuidado com a evidência eletrônica." currentPath="/seguranca/">
    <FlowMap eyebrow="Defesa em camadas" title="Proteção ao longo do percurso." description="Conexão, isolamento, evidência e recuperação atuam em conjunto; nenhuma camada isolada elimina todo risco." ariaLabel="Camadas de segurança do portal de assinaturas" steps={[
      { title: "Conexão", description: "HTTPS protege o transporte entre navegador e portal.", icon: Network },
      { title: "Acesso", description: "Links individuais e serviços separados reduzem exposição.", icon: Fingerprint },
      { title: "Evidência", description: "Eventos, hashes e validações apoiam a conferência.", icon: ShieldCheck, tone: "yellow" },
      { title: "Recuperação", description: "Backups, versões e rollback apoiam a continuidade.", icon: ArchiveRestore },
    ]} />
    <h2>Conexão e isolamento</h2><p>O portal utiliza HTTPS, proxy reverso, serviços isolados em containers e bancos não expostos diretamente à internet. A navegação permanece em um único domínio, com roteamento interno separado entre portal, motor documental e serviço criptográfico.</p>
    <h2>Acesso ao documento</h2><p>Links e códigos são individuais. O sistema registra eventos necessários ao fluxo e aplica controles de requisição. Compartilhamento do link reduz a segurança e deve ser comunicado.</p>
    <h2>Integridade</h2><p>O SHA-256 do PDF assinado é registrado externamente, junto do relatório e de um envelope assinado pelo portal. A folha com QR é separada e não altera o original. Na assinatura digital, a validação deve detectar mudança posterior no conteúdo coberto.</p>
    <h2>Certificados</h2><p>Chave privada, PIN e senha não são solicitados pelo escritório. Trust stores de assinatura de PDF, autenticação mTLS e testes permanecem separados para evitar confiança indevida.</p>
    <h2>Backups e atualização</h2><p>O ambiente possui backup privado, procedimento de restauração e versões identificadas. Atualizações relevantes exigem teste e possibilidade de rollback.</p>
    <h2>Limites</h2><p>Nenhuma medida elimina todo risco. Indisponibilidade, equipamento comprometido, malware no dispositivo do usuário ou falha de fornecedor podem afetar o processo. Interrompa a operação diante de comportamento inesperado.</p>
    <h2>Comunicar incidente</h2><p>Envie a descrição, o horário e o nome do documento para <a href="mailto:roger@maiocchi.adv.br?subject=Segurança%20do%20portal">roger@maiocchi.adv.br</a>. Não envie senha, PIN, chave privada nem código de acesso.</p>
  </LegalPage>;
}
