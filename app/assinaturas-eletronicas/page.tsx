import type { Metadata } from "next";
import { BadgeCheck, FileSearch, Scale, ShieldCheck } from "lucide-react";
import { FlowMap } from "../flow-map";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Assinaturas eletrônicas" };

export default function ElectronicSignaturesPage() {
  return <LegalPage title="Assinaturas eletrônicas" lead="O nome da modalidade deve corresponder às evidências que o processo realmente produz." currentPath="/assinaturas-eletronicas/">
    <FlowMap eyebrow="Mapa de decisão" title="A modalidade vem depois do caso." description="A aparência da assinatura não define sua categoria. Forma legal, risco e evidências orientam a escolha." ariaLabel="Fluxo para escolha e validação da modalidade de assinatura" steps={[
      { title: "Entender o ato", description: "Verifique finalidade, forma exigida e participantes.", icon: FileSearch },
      { title: "Avaliar o risco", description: "Considere identificação, controle e aceitação necessária.", icon: Scale },
      { title: "Escolher evidências", description: "Use assinatura simples, avançada ou qualificada conforme o caso.", icon: ShieldCheck, tone: "yellow" },
      { title: "Validar o resultado", description: "Confira integridade, autoria e registros no arquivo final.", icon: BadgeCheck, href: "/validar/", linkLabel: "Abrir validação" },
    ]} />
    <h2>Assinatura eletrônica simples</h2><p>Permite identificar o signatário e associar dados eletrônicos ao documento. No portal, o acesso por link, o preenchimento e a assinatura desenhada são tratados como simples por padrão. A trilha ajuda a demonstrar o processo, mas não transforma a assinatura em qualificada.</p>
    <h2>Assinatura eletrônica avançada</h2><p>Deve estar associada ao signatário de maneira unívoca, permanecer sob seu controle e permitir a detecção de alterações posteriores. O GOV.BR oferece assinatura avançada a pessoas com conta prata ou ouro. O Maiocchi Advogado orienta o percurso externo, mas não opera a API governamental.</p>
    <h2>Assinatura eletrônica qualificada</h2><p>Utiliza certificado digital emitido no âmbito da ICP-Brasil. O certificado vincula o titular a um par de chaves criptográficas. A chave privada permanece sob controle do titular e não deve ser enviada ao portal.</p>
    <h2>Qual modalidade usar?</h2><p>A resposta depende da lei, da forma do ato, do risco, da identificação necessária e da aceitação das partes. O próprio fluxo informará a modalidade disponível. Em caso de dúvida, interrompa a assinatura e procure o advogado responsável.</p>
    <h2>Assinatura digitalizada não é assinatura digital</h2><p>Uma imagem da assinatura manuscrita não produz, sozinha, a proteção criptográfica de uma assinatura digital. A autenticidade e a integridade devem ser avaliadas pelas evidências do processo.</p>
    <h2>Fontes oficiais</h2>
    <ul className="source-list">
      <li><a href="https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm" target="_blank" rel="noreferrer">Lei nº 14.063/2020</a></li>
      <li><a href="https://www.gov.br/iti/pt-br/assuntos/assinatura-eletronica-avancada/assinatura-eletronica-avancada" target="_blank" rel="noreferrer">ITI: assinatura eletrônica avançada</a></li>
      <li><a href="https://www.gov.br/iti/pt-br/acesso-a-informacao/perguntas-frequentes/certificacao-digital" target="_blank" rel="noreferrer">ITI: perguntas frequentes sobre certificação digital</a></li>
    </ul>
  </LegalPage>;
}
