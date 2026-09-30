import type { Schluessel } from '@shared/i18n'
import { PageHeader } from '../components/Panel'
import { useT } from '../i18n'

/** Platzhalter für Reiter, die mit einem späteren Meilenstein kommen. */
export function LeererReiter({ titel, text }: { titel: Schluessel; text: Schluessel }): React.JSX.Element {
  const t = useT()
  return <PageHeader title={t(titel)} subtitle={t(text)} />
}
