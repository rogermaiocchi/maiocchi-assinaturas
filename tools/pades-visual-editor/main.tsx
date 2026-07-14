/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartHorizontal,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Download,
  Grid3X3,
  Maximize2,
  MousePointer2,
  RotateCcw,
  Save,
} from "lucide-react";
import {
  A4 as PDF_A4,
  EDITOR_SCALE,
  EVIDENCE_BLOCKS,
  PAGE_MARGINS as PDF_PAGE_MARGINS,
  editorBox,
} from "../../services/pki-bridge/src/pades-evidence-layout.mjs";
import "./style.css";

type Box = { x: number; y: number; w: number; h: number };
type Layout = Record<string, Box>;
type SignatureMode = "icp-brasil" | "gov-br" | "simples";

const SIGNATURE_MODES: Record<SignatureMode, {
  label: string;
  header: string;
  infrastructure: string;
  icpBrasil: boolean;
  itiValidationEligible: boolean;
}> = {
  "icp-brasil": {
    label: "ICP-Brasil",
    header: "ICP-BRASIL",
    infrastructure: "ICP-Brasil",
    icpBrasil: true,
    itiValidationEligible: true,
  },
  "gov-br": {
    label: "GOV.BR",
    header: "GOV.BR",
    infrastructure: "GOV.BR",
    icpBrasil: false,
    itiValidationEligible: true,
  },
  simples: {
    label: "Simples",
    header: "ASSINATURA SIMPLES",
    infrastructure: "Assinatura eletrônica simples",
    icpBrasil: false,
    itiValidationEligible: false,
  },
};

const A4 = {
  width: Math.round(PDF_A4.width * EDITOR_SCALE),
  height: Math.round(PDF_A4.height * EDITOR_SCALE),
};
const PAGE_MARGINS = {
  top: Math.round(PDF_PAGE_MARGINS.top * EDITOR_SCALE),
  right: Math.round(PDF_PAGE_MARGINS.right * EDITOR_SCALE),
  bottom: Math.round(PDF_PAGE_MARGINS.bottom * EDITOR_SCALE),
  left: Math.round(PDF_PAGE_MARGINS.left * EDITOR_SCALE),
};
const LAYOUT_STORAGE_KEY = "maiocchi-pades-layout-v7";
const initialLayout = Object.fromEntries(
  Object.entries(EVIDENCE_BLOCKS).map(([id, block]) => [id, editorBox(block)]),
) as Layout;

const labels: Record<string, string> = {
  header: "Cabeçalho e marcas",
  title: "Título",
  document: "Identificação do documento",
  hash: "Hash",
  qr: "QR Code",
  context: "Identificação e eventos",
  attributes: "Atributos ITI",
  pqc: "Atestado pós-quântico",
  validation: "Validação",
  barcode: "Código de barras",
  seal: "Assinatura",
  legal: "Base legal e validação",
  footer: "Rodapé",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><span>{label}</span><strong contentEditable suppressContentEditableWarning>{children}</strong></div>;
}

function Block({
  id,
  box,
  selected,
  onSelect,
  onDragStart,
  onResizeStart,
  children,
  className = "",
}: {
  id: string;
  box: Box;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (event: React.PointerEvent) => void;
  onResizeStart: (event: React.PointerEvent) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`layout-block ${selected ? "is-selected" : ""} ${className}`}
      data-block={id}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      onPointerDown={onSelect}
    >
      <button className="drag-handle" title={`Mover ${labels[id]}`} aria-label={`Mover ${labels[id]}`} onPointerDown={onDragStart}>
        <MousePointer2 size={13} />
        <span>{labels[id]}</span>
      </button>
      {children}
      <button className="resize-handle" title={`Redimensionar ${labels[id]}`} aria-label={`Redimensionar ${labels[id]}`} onPointerDown={onResizeStart}>
        <Maximize2 size={12} />
      </button>
    </section>
  );
}

function SecuritySeal({ icpBrasil }: { icpBrasil: boolean }) {
  if (!icpBrasil) {
    return (
      <div className="security-seal is-neutral">
        <img src="/assets/pades-security-seal-4k.png?v=10" alt="" />
        <div className="seal-pades-mark" aria-label="PAdES">
          <strong>PAdES</strong>
          <i />
          <small>PDF SIGNATURE</small>
        </div>
        <div className="seal-copy">
          <span className="seal-kicker">Assinatura eletrônica · PAdES</span>
          <strong contentEditable suppressContentEditableWarning>REGISTRO ELETRÔNICO</strong>
          <div contentEditable suppressContentEditableWarning>Identidade e instante: consulte o endereço de validação.</div>
          <small contentEditable suppressContentEditableWarning>Modalidade simples ou avançada · sem alegação ICP-Brasil</small>
          <code contentEditable suppressContentEditableWarning>MAI-2026-ESY0-6MPD-QQBP-RMG4</code>
        </div>
      </div>
    );
  }

  return (
    <div className="security-seal">
      <img src="/assets/pades-security-seal-4k.png?v=10" alt="" />
      <img className="seal-icp-mark" src="/assets/icp-brasil-oficial.png" alt="ICP-Brasil" />
      <div className="seal-copy">
        <span className="seal-kicker">Assinatura digital ICP-Brasil · PAdES AD-RB</span>
        <strong contentEditable suppressContentEditableWarning>ROGER MAIOCCHI</strong>
        <div contentEditable suppressContentEditableWarning>CPF 006.***.***-40 · 13/07/2026 15:57:40 UTC</div>
        <small contentEditable suppressContentEditableWarning>Certificado A3 · atributos incorporados · confira pelo QR ou código</small>
        <code contentEditable suppressContentEditableWarning>CERT SHA-256 020996E7 AA6CF44F 59AEFD21 DF96CA39 12A075C6 6D230987 9C8EB1C1 197C562D</code>
      </div>
    </div>
  );
}

function DocumentCanvas({
  layout,
  selected,
  select,
  startAction,
  mode,
}: {
  layout: Layout;
  selected: string;
  select: (id: string) => void;
  startAction: (mode: "drag" | "resize", id: string, event: React.PointerEvent) => void;
  mode: SignatureMode;
}) {
  const modeConfig = SIGNATURE_MODES[mode];
  const { icpBrasil, itiValidationEligible } = modeConfig;
  const props = (id: string, className = "") => ({
    id,
    box: layout[id],
    selected: selected === id,
    onSelect: () => select(id),
    onDragStart: (event: React.PointerEvent) => startAction("drag", id, event),
    onResizeStart: (event: React.PointerEvent) => startAction("resize", id, event),
    className,
  });

  return (
    <article className="a4-canvas" aria-label="Folha de evidências da assinatura digital editável">
      <Block {...props("header", "header-block")}>
        <div className="header-brand-row">
          <span className="header-record">Evidências da assinatura digital</span>
          <span className={icpBrasil ? "header-mode is-icp" : "header-mode"}>
            Modalidade · {modeConfig.header}
          </span>
        </div>
      </Block>

      <Block {...props("title", "title-block")}>
        <h1 contentEditable suppressContentEditableWarning>Documento eletrônico assinado</h1>
        <p contentEditable suppressContentEditableWarning>O arquivo eletrônico assinado é o original. Esta página organiza evidências de conferência; sinais gráficos não substituem a validação criptográfica.</p>
      </Block>

      <Block {...props("document", "panel meta-grid")}>
        <Field label="Código de verificação">MAI-2026-ESY0-6MPD-QQBP-RMG4</Field>
        <Field label="Número do documento">20260713155250664425469195217</Field>
        <Field label="Arquivo">Relatorio-Inteligencia-Juridica.pdf</Field>
        <Field label="Páginas">13 (12 originais + 1 evidência)</Field>
      </Block>

      <Block {...props("hash", "hash-block")}>
        <Field label="Hash SHA-256 do PDF preparado para assinatura">
          <code>020996e7aa6cf44f59aefd21df96ca39 81f2075c6d33097c9ecb1c192e5630de</code>
        </Field>
        <small>O hash integral do PDF final assinado é publicado no endereço de validação.</small>
      </Block>

      <Block {...props("qr", "qr-block")}>
        <img src="/assets/verification-qr.png" alt="QR Code de verificação" />
      </Block>

      <Block {...props("context", "context-block")}>
        <h2>Identificação e eventos</h2>
        <div className="context-grid">
          <Field label="Emitente / gerado por">Roger Maiocchi · CPF 006.***.***-40 · OAB/DF 31.249</Field>
          <Field label="Destinado a">Destinatário informado no documento</Field>
          <Field label="Finalidade">Conferência e preservação do documento eletrônico</Field>
          <Field label="Evento 1 · documento preparado">13/07/2026, 15:52:50 · America/Sao_Paulo</Field>
          <Field label="Evento 2 · assinatura">Instante registrado no resumo visual abaixo</Field>
          <Field label="Token / modalidade">{icpBrasil ? "Certificado ICP-Brasil A3 · token criptográfico" : mode === "gov-br" ? "Conta GOV.BR · infraestrutura reconhecida" : "Modalidade simples registrada pelo fluxo"}</Field>
          <Field label="Tipo de assinatura">{icpBrasil ? "PAdES AD-RB · ICP-Brasil" : mode === "gov-br" ? "Assinatura avançada · GOV.BR" : "Assinatura eletrônica simples"}</Field>
          <Field label="Ambiente">MacBook · macOS · MaiocchiPadesTokenAgent</Field>
          <Field label="IP / localização">189.6.10.176 · não fornecida pelo usuário</Field>
        </div>
      </Block>

      <Block {...props("attributes", "panel attributes-block")}>
        {icpBrasil ? <>
          <div className="section-heading"><h2>Atributos confirmados no PAdES</h2><code>DOC-ICP-15.03 v9.1 · OID 2.16.76.1.7.1.11.1.3</code></div>
          <div className="attribute-row ok"><i></i><b>INCORPORADOS</b><span contentEditable suppressContentEditableWarning>signerAttr · /Name · /M · /Location · /Reason · /ContactInfo · /Prop_Build</span></div>
          <div className="attribute-row conditional"><i></i><b>ACT / CONDICIONAL</b><span contentEditable suppressContentEditableWarning>contentTimeStamp · signatureTimeStampToken · Document Time-stamp</span></div>
          <div className="attribute-row context"><i></i><b>CONTEXTO</b><span contentEditable suppressContentEditableWarning>/Reference · /Changes · /V=0 · /Prop_AuthTime · DSS · VRI</span></div>
        </> : <>
          <div className="section-heading"><h2>Atributos da assinatura</h2><code>{modeConfig.infrastructure}</code></div>
          <div className="attribute-row generic"><i></i><b>FORMATO</b><span contentEditable suppressContentEditableWarning>{mode === "gov-br" ? "Assinatura eletrônica avançada" : "Assinatura eletrônica simples"}</span></div>
          <div className="attribute-row context"><i></i><b>MODALIDADE</b><span contentEditable suppressContentEditableWarning>{mode === "gov-br" ? "Infraestrutura oficial GOV.BR" : "Registrada pelo fluxo de assinatura"}</span></div>
          <div className="attribute-row context"><i></i><b>CONFERÊNCIA</b><span contentEditable suppressContentEditableWarning>Consultar QR e código de verificação</span></div>
        </>}
      </Block>

      <Block {...props("pqc", "panel pqc-block")}>
        <Field label="Atestado pós-quântico do manifesto"><code>PQC-MLDSA65-465P-VSS7-TP75-ZZC4</code></Field>
        <small contentEditable suppressContentEditableWarning>{icpBrasil
          ? "ML-DSA-65 · evidência complementar; não substitui o PAdES ICP-Brasil."
          : "ML-DSA-65 · evidência complementar; não altera a modalidade eletrônica registrada."}</small>
      </Block>

      <Block {...props("validation", "validation-block")}>
        <span>VALIDAR O ORIGINAL</span>
        <strong contentEditable suppressContentEditableWarning>assinatura.maiocchi.adv.br/validar</strong>
        {itiValidationEligible && <small><a href="https://validar.iti.gov.br/" target="_blank" rel="noreferrer">validar.iti.gov.br</a></small>}
      </Block>

      <Block {...props("barcode", "barcode-block")}>
        <img src="/assets/verification-barcode.png" alt="Código de barras de verificação" />
      </Block>

      <Block {...props("seal", "seal-block")}>
        <SecuritySeal icpBrasil={icpBrasil} />
      </Block>

      <Block {...props("legal", "legal-block")}>
        <p contentEditable suppressContentEditableWarning>{icpBrasil
          ? "MP 2.200-2/2001, art. 10, § 1º · L 14.063/2020, art. 4º, III."
          : "Assinatura eletrônica conforme a modalidade registrada · MP 2.200-2/2001, art. 10, § 2º · Lei 14.063/2020, art. 4º."}</p>
      </Block>
    </article>
  );
}

function App() {
  const stored = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || "null"); } catch { return null; }
  }, []);
  const [layout, setLayout] = useState<Layout>(stored?.layout || initialLayout);
  const [mode, setMode] = useState<SignatureMode>(stored?.mode in SIGNATURE_MODES ? stored.mode : "icp-brasil");
  const [selected, setSelected] = useState("seal");
  const [zoom, setZoom] = useState(0.76);
  const [grid, setGrid] = useState(true);
  const action = useRef<null | { mode: "drag" | "resize"; id: string; startX: number; startY: number; origin: Box }>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!action.current) return;
      const current = action.current;
      const dx = (event.clientX - current.startX) / zoom;
      const dy = (event.clientY - current.startY) / zoom;
      setLayout((value) => {
        const next = { ...value };
        if (current.mode === "drag") {
          next[current.id] = {
            ...current.origin,
            x: clamp(Math.round(current.origin.x + dx), 0, A4.width - current.origin.w),
            y: clamp(Math.round(current.origin.y + dy), 0, A4.height - current.origin.h),
          };
        } else {
          next[current.id] = {
            ...current.origin,
            w: clamp(Math.round(current.origin.w + dx), 90, A4.width - current.origin.x),
            h: clamp(Math.round(current.origin.h + dy), 24, A4.height - current.origin.y),
          };
        }
        return next;
      });
    };
    const up = () => { action.current = null; document.body.classList.remove("is-dragging"); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [zoom]);

  const startAction = (mode: "drag" | "resize", id: string, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(id);
    action.current = { mode, id, startX: event.clientX, startY: event.clientY, origin: { ...layout[id] } };
    document.body.classList.add("is-dragging");
  };

  const updateSelected = (patch: Partial<Box>) => setLayout((value) => ({ ...value, [selected]: { ...value[selected], ...patch } }));
  const nudge = (x: number, y: number) => updateSelected({
    x: clamp(layout[selected].x + x, 0, A4.width - layout[selected].w),
    y: clamp(layout[selected].y + y, 0, A4.height - layout[selected].h),
  });
  const align = (where: "start" | "center" | "end") => updateSelected({
    x: where === "start"
      ? PAGE_MARGINS.left
      : where === "center"
        ? Math.round((PAGE_MARGINS.left + A4.width - PAGE_MARGINS.right - layout[selected].w) / 2)
        : A4.width - PAGE_MARGINS.right - layout[selected].w,
  });
  const save = () => localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ layout, mode }));
  const reset = () => { setLayout(initialLayout); setMode("icp-brasil"); localStorage.removeItem(LAYOUT_STORAGE_KEY); };
  const download = () => {
    const modeConfig = SIGNATURE_MODES[mode];
    const blob = new Blob([JSON.stringify({
      version: 6,
      canvas: A4,
      margins: PAGE_MARGINS,
      mode,
      infrastructure: modeConfig.infrastructure,
      icpBrasilCredentialIncluded: modeConfig.icpBrasil,
      itiValidationEligible: modeConfig.itiValidationEligible,
      layout,
    }, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href, download: "maiocchi-pades-layout.json" });
    link.click();
    URL.revokeObjectURL(href);
  };
  const box = layout[selected];

  return (
    <main className={grid ? "app has-grid" : "app"}>
      <header className="toolbar">
        <div className="toolbar-brand"><img src="/assets/maiocchi-mark.svg" alt="m." /><div><strong>Laboratório visual PAdES</strong><span>cópia de trabalho · baseline ITI preservada</span></div></div>
        <div className="toolbar-actions" aria-label="Ferramentas de edição">
          <button title="Alinhar à esquerda" aria-label="Alinhar à esquerda" onClick={() => align("start")}><AlignStartHorizontal /></button>
          <button title="Centralizar" aria-label="Centralizar" onClick={() => align("center")}><AlignCenterHorizontal /></button>
          <button title="Alinhar à direita" aria-label="Alinhar à direita" onClick={() => align("end")}><AlignEndHorizontal /></button>
          <span className="divider" />
          <button title="Mover para a esquerda" aria-label="Mover para a esquerda" onClick={() => nudge(-2, 0)}><ArrowLeft /></button>
          <button title="Mover para cima" aria-label="Mover para cima" onClick={() => nudge(0, -2)}><ArrowUp /></button>
          <button title="Mover para baixo" aria-label="Mover para baixo" onClick={() => nudge(0, 2)}><ArrowDown /></button>
          <button title="Mover para a direita" aria-label="Mover para a direita" onClick={() => nudge(2, 0)}><ArrowRight /></button>
          <span className="divider" />
          <button className={grid ? "is-active" : ""} title="Alternar grade" aria-label="Alternar grade" onClick={() => setGrid((value) => !value)}><Grid3X3 /></button>
          <button title="Salvar no navegador" aria-label="Salvar no navegador" onClick={save}><Save /></button>
          <button title="Exportar coordenadas" aria-label="Exportar coordenadas" onClick={download}><Download /></button>
          <button title="Restaurar composição" aria-label="Restaurar composição" onClick={reset}><RotateCcw /></button>
        </div>
      </header>

      <aside className="inspector">
        <span className="inspector-kicker">Bloco selecionado</span>
        <h2>{labels[selected]}</h2>
        <div className="coordinate-grid">
          {(["x", "y", "w", "h"] as const).map((key) => <label key={key}><span>{key.toUpperCase()}</span><input type="number" value={box[key]} onChange={(event) => updateSelected({ [key]: Number(event.target.value) })} /></label>)}
        </div>
        <label className="zoom-control"><span>Zoom {Math.round(zoom * 100)}%</span><input type="range" min="0.5" max="1" step="0.02" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <div className="mode-selector" role="group" aria-label="Modalidade da assinatura">
          <span>Modalidade</span>
          <div>
            {(Object.keys(SIGNATURE_MODES) as SignatureMode[]).map((value) => (
              <button
                key={value}
                type="button"
                className={mode === value ? "is-selected" : ""}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >{SIGNATURE_MODES[value].label}</button>
            ))}
          </div>
          <small>O VALIDAR ITI aparece somente para ICP-Brasil e GOV.BR reconhecido.</small>
        </div>
        <p>Arraste pela etiqueta amarela. Redimensione pelo canto inferior direito. Textos sublinhados são editáveis diretamente.</p>
        <div className="legend"><i></i><span>Coordenadas compartilhadas com o renderer do PDF.</span></div>
      </aside>

      <section className="workspace" aria-label="Editor visual">
        <div className="canvas-stage" style={{ width: A4.width * zoom, height: A4.height * zoom }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <DocumentCanvas layout={layout} selected={selected} select={setSelected} startAction={startAction} mode={mode} />
          </div>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
