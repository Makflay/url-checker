import type { ReactNode } from "react";

import "./section.css";

interface SectionProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function Section({
  title,
  description,
  children,
  className,
}: SectionProps) {
  const sectionClassName = className ? `section ${className}` : "section";

  const hasChildren = children !== undefined && children !== null;

  return (
    <section className={sectionClassName}>
      <header className="section__header">
        <h2 className="section__title">{title}</h2>

        {description ? (
          <p className="section__description">{description}</p>
        ) : null}
      </header>

      {hasChildren ? <div className="section__content">{children}</div> : null}
    </section>
  );
}
