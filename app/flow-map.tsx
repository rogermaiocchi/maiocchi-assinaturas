import Link from "next/link";
import { ArrowDown, ArrowRight, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

export type FlowStep = {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  linkLabel?: string;
  tone?: "light" | "yellow" | "dark";
};

type FlowMapProps = {
  eyebrow: string;
  title: string;
  description: string;
  steps: FlowStep[];
  ariaLabel: string;
};

export function FlowMap({ eyebrow, title, description, steps, ariaLabel }: FlowMapProps) {
  const style = { "--flow-columns": Math.min(steps.length, 4) } as CSSProperties;

  return (
    <figure className="flow-map" aria-label={ariaLabel}>
      <figcaption className="flow-map__caption">
        <p className="eyebrow eyebrow--light">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </figcaption>
      <ol className="flow-map__track" style={style}>
        {steps.map((step, index) => {
          const Icon = step.icon;
          const content = (
            <>
              <span className="flow-map__topline">
                <span className="flow-map__number">{String(index + 1).padStart(2, "0")}</span>
                <Icon aria-hidden="true" size={22} strokeWidth={1.8} />
              </span>
              <strong>{step.title}</strong>
              <span className="flow-map__description">{step.description}</span>
              {step.href && (
                <span className="flow-map__link">
                  {step.linkLabel || "Abrir etapa"} <ArrowRight aria-hidden="true" size={15} />
                </span>
              )}
            </>
          );

          return (
            <li className="flow-map__item" key={step.title}>
              {step.href ? (
                step.href.startsWith("/") ? (
                  <Link className={`flow-map__node flow-map__node--${step.tone || "light"}`} href={step.href}>{content}</Link>
                ) : (
                  <a
                    className={`flow-map__node flow-map__node--${step.tone || "light"}`}
                    href={step.href}
                    target={step.href.startsWith("http") ? "_blank" : undefined}
                    rel={step.href.startsWith("http") ? "noreferrer" : undefined}
                  >{content}</a>
                )
              ) : (
                <div className={`flow-map__node flow-map__node--${step.tone || "light"}`}>{content}</div>
              )}
              {index < steps.length - 1 && (
                <span className="flow-map__connector" aria-hidden="true">
                  <ArrowRight className="flow-map__connector-horizontal" size={20} />
                  <ArrowDown className="flow-map__connector-vertical" size={20} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
