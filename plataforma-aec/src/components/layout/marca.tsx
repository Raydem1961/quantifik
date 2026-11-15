import * as React from 'react';

/** Símbolo do ObraTop: a cobertura (o "topo") sobre três volumes (a obra). Mesmo desenho de public/marca. */
export function Simbolo({ className }: { className?: string }) {
  const id = React.useId();
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true" focusable="false">
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3546c4" /><stop offset="1" stopColor="#7c3aed" /></linearGradient></defs>
      <rect width="512" height="512" rx="116" fill={`url(#${id})`} />
      <path d="M92 262 L256 118 L420 262" fill="none" stroke="#fff" strokeWidth="42" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="146" y="314" width="60" height="96" rx="13" fill="#fff" opacity=".62" />
      <rect x="226" y="262" width="60" height="148" rx="13" fill="#fff" />
      <rect x="306" y="314" width="60" height="96" rx="13" fill="#fff" opacity=".62" />
    </svg>
  );
}

/** Nome com o "Top" na cor da marca. */
export const Nome = ({ className }: { className?: string }) => (
  <span className={className}>Obra<span className="text-[#5b47d6] dark:text-[#b4a5ff]">Top</span></span>
);
