"use client";

import { useEffect, useId, useRef, useState } from "react";

type MermaidDiagramProps = {
  eyebrow: string;
  title: string;
  description: string;
  ariaLabel: string;
  definition: string;
  mobileDefinition?: string;
  steps: Array<[title: string, description: string]>;
};

export function MermaidDiagram({
  eyebrow,
  title,
  description,
  ariaLabel,
  definition,
  mobileDefinition,
  steps,
}: MermaidDiagramProps) {
  const container = useRef<HTMLDivElement>(null);
  const renderSequence = useRef(0);
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [isMobile, setIsMobile] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const source = isMobile && mobileDefinition ? mobileDefinition : definition;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 780px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const target = container.current;
    if (!target || !("IntersectionObserver" in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setShouldRender(true);
      observer.disconnect();
    }, { rootMargin: "320px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldRender) return;
    let active = true;

    async function renderDiagram() {
      try {
        setReady(false);
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          htmlLabels: true,
          theme: "base",
          fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif",
          themeVariables: {
            background: "transparent",
            primaryColor: "#191b18",
            primaryTextColor: "#f7f7f4",
            primaryBorderColor: "#666960",
            lineColor: "#ffb800",
            secondaryColor: "#ffb800",
            secondaryTextColor: "#111210",
            tertiaryColor: "#242622",
            fontSize: "15px",
          },
          flowchart: {
            curve: "basis",
            nodeSpacing: 34,
            rankSpacing: 44,
            useMaxWidth: true,
          },
        });

        renderSequence.current += 1;
        const id = `mermaid-${reactId}-${renderSequence.current}`;
        const { svg, bindFunctions } = await mermaid.render(id, source);
        if (!active || !container.current) return;
        container.current.innerHTML = svg;
        bindFunctions?.(container.current);
        setFailed(false);
        setReady(true);
      } catch {
        if (active) {
          setFailed(true);
          setReady(false);
        }
      }
    }

    if (container.current) container.current.innerHTML = "";
    void renderDiagram();
    return () => { active = false; };
  }, [reactId, shouldRender, source]);

  return (
    <figure className="mermaid-diagram" aria-labelledby={`${reactId}-title`}>
      <figcaption className="mermaid-diagram__caption">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${reactId}-title`}>{title}</h2>
        <p>{description}</p>
      </figcaption>
      <div
        className="mermaid-diagram__surface"
        ref={container}
        role={failed ? undefined : "img"}
        aria-label={failed ? undefined : ariaLabel}
        aria-busy={!failed && !ready}
      />
      <ol className={failed ? "mermaid-diagram__fallback" : "sr-only"}>
        {steps.map(([stepTitle, stepDescription]) => (
          <li key={stepTitle}><strong>{stepTitle}</strong><span>{stepDescription}</span></li>
        ))}
      </ol>
    </figure>
  );
}
