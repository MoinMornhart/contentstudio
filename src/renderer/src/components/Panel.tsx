import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }): React.JSX.Element {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  )
}

export function Card({ title, children, badge }: { title: string; children: ReactNode; badge?: string }): React.JSX.Element {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {badge && <span className="badge">{badge}</span>}
      </div>
      <div className="card-body">{children}</div>
    </section>
  )
}
