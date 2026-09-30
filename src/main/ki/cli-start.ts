// Herkunft: MoinStudio src/main/claude/run.ts (MIT): Start offizieller CLIs, auch wenn npm sie als .cmd installiert.

/** Quotet ein Argument für cmd.exe (für per npm installierte `.cmd`-Dateien). */
export function quoteForCmd(arg: string): string {
  if (arg !== '' && !/[\s"&|<>^%()!]/.test(arg)) return arg
  // Backslashes vor Anführungszeichen und am Ende verdoppeln, Anführungszeichen escapen,
  // % aus der Variablen-Erweiterung von cmd.exe herausnehmen.
  return `"${arg.replace(/(\*)"/g, '$1$1\\"').replace(/(\+)$/, '$1$1').replace(/%/g, '"%"')}"`
}

/** `.exe` direkt starten; `.cmd`/`.bat` brauchen cmd.exe (Node startet sie sonst nicht). */
export function commandLine(cli: string, args: string[]): [string, string[], boolean] {
  if (!/\.(cmd|bat)$/i.test(cli)) return [cli, args, false]
  const line = [cli, ...args].map(quoteForCmd).join(' ')
  return [process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], true]
}
