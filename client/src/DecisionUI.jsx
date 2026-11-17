import React from 'react';
import Icon from './Icons.jsx';

export function ToolHeader({ icon, eyebrow, title, description, algorithm, children, as: Heading = 'h2' }) {
  return <div className="tool-heading"><div className="tool-heading-top"><span className="tool-icon"><Icon name={icon} size={25} /></span>{algorithm && <span className="tool-algorithm">{algorithm}</span>}</div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<Heading>{title}</Heading><p className="tool-description">{description}</p>{children}</div>;
}
export function ToolSteps({ steps }) {
  return <ol className="tool-steps" aria-label="How to use this tool">{steps.map((label, index) => <li key={label}><span>{index + 1}</span>{label}</li>)}</ol>;
}
export function AlgorithmNote({ name, children }) {
  return <details className="algorithm-explanation"><summary><Icon name="info" size={16} />How it works · {name}<Icon name="chevron" size={15} /></summary><div>{children}</div></details>;
}
export function ToolMessage({ title, children, icon = 'info', tone = 'neutral' }) {
  return <div className={'tool-message tone-' + tone}><Icon name={icon} size={20} /><div>{title && <strong>{title}</strong>}<div>{children}</div></div></div>;
}
