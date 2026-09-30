# KI-Anbieter: Nutzungsbedingungen und Entscheidungen

Stand: Recherche vom **30.09.2026**. Alle Zitate stammen aus den verlinkten Originalseiten und wurden an diesem Tag
abgerufen. Das ist keine Rechtsberatung. Eigene Bewertungen sind mit **[EINSCHÄTZUNG]** markiert. Anbieter ändern ihre
Bedingungen oft: Diese Seite wird bei jedem Meilenstein-Release neu geprüft.

Ausgangslage: ContentStudio ist Open Source (MIT), kostenlos, lokal, ohne Server und ohne Konto. Die App nutzt immer nur
den **eigenen** Zugang der Person, leitet nichts über fremde Konten, baut keinen eigenen Login für Abos und liest oder
speichert keine Session-Tokens.

## Entscheidung für ContentStudio

| Weg | Urteil | Entscheidung |
|---|---|---|
| Claude Code CLI mit eigenem Pro/Max-Abo (`claude -p`) | unklar | **nicht eingebaut**, solange es keine Freigabe von Anthropic gibt |
| Claude Desktop → lokaler MCP-Server von ContentStudio | erlaubt | eingebaut (ROADMAP 3.7) |
| Anthropic-API-Schlüssel (eigener) | erlaubt | eingebaut, offizielles SDK |
| Codex CLI mit ChatGPT-Anmeldung (`codex exec`) | erlaubt für lokale Open-Source-Apps | eingebaut |
| „Sign in with ChatGPT“ (OAuth in der App) | offiziell möglich | **nicht eingebaut**: bräuchte eigenen Login und Token-Speicher (Projektregel 3) |
| ChatGPT Desktop → lokaler MCP-Server | erlaubt | eingebaut (ROADMAP 3.7) |
| OpenAI-API-Schlüssel (eigener) | erlaubt | eingebaut |
| Gemini CLI mit Google-Konto | eingestellt seit 18.06.2026 | entfällt |
| Antigravity CLI (`agy`) mit Google-Konto aus einer fremden App | nicht erlaubt [EINSCHÄTZUNG] | **nicht eingebaut** |
| Gemini-API-Schlüssel (AI Studio) | erlaubt; in EWR, Schweiz, UK nur bezahlter Tarif | eingebaut, mit Bestätigung „bezahlter Schlüssel“ |
| Ollama, LM Studio, llama.cpp (lokal) | erlaubt | eingebaut, nur über ihre lokalen Schnittstellen, nichts mitgeliefert |
| OpenRouter (eigener Schlüssel) | erlaubt | eingebaut |
| YouTube Data API v3 (eigener Schlüssel) | erlaubt mit Auflagen | 30-Tage-Regel, Löschknopf, Quellenangabe, Link zu den YouTube-Bedingungen |

**Warum kein Claude-Abo über `claude -p`?** Anthropic erlaubt ausdrücklich, dass sich eine Person mit ihrem eigenen Abo
im unveränderten Claude Code anmeldet, auch wenn ein fremdes Produkt Claude Code ausführt. Gleichzeitig steht in der
Agent-SDK-Übersicht: „Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login
or rate limits for their products“. Eine App für andere, die Aufträge über das Abo-Kontingent der Person laufen lässt,
bietet genau diese „rate limits“ an. Ohne Freigabe baut ContentStudio das nicht ein. Wer Claude mit seinem Abo nutzen
will, verbindet ContentStudio mit Claude Desktop (MCP): Dort chattet die Person selbst in Anthropics App, ContentStudio
ist nur ein Werkzeug. Liegt eine Freigabe von Anthropic vor, lässt sich der Weg aus MoinStudio (`src/main/claude/`)
nachrüsten.

---

## 1. Claude Code CLI mit eigenem Pro/Max-Abo

**Urteil: unklar.**

- https://code.claude.com/docs/en/legal-and-compliance
  - „**OAuth authentication** is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise
    subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications.“
  - „**Developers** building products or services that interact with Claude's capabilities, including those using the
    Agent SDK, should use API key authentication through Claude Console or a supported cloud provider. Anthropic does not
    permit third-party developers to offer Claude.ai login into their own applications, or to route requests through
    Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or
    intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's
    own flow.“
  - „Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude
    subscription, including where a platform hosts Claude Code as described under *Can customers offer Claude Code in
    their products?* above.“
  - „Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK.“
  - „Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice.“
  - „You can accurately say, in plain text, that your product has Claude Code preinstalled or that it runs Claude Code.
    But you can't use the Claude Code or Anthropic names or logos as part of your own product, feature, or company name
    […]“
- https://code.claude.com/docs/en/agent-sdk/overview: „Unless previously approved, Anthropic does not allow third party
  developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK.
  Use the API key authentication methods described in the Quickstart instead.“
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan: Die geplante Änderung
  ist seit dem 15.06.2026 pausiert; heute zählen „Claude Agent SDK usage, the `claude -p` command, and third-party apps
  built on the Agent SDK“ gegen das Abo-Kontingent.
- https://www.anthropic.com/legal/consumer-terms (gültig ab 08.10.2025): verboten ist „Except when you are accessing our
  Services via an Anthropic API Key or where we otherwise explicitly permit it, to access the Services through automated
  or non-human means, whether through a bot, script, or otherwise.“

[EINSCHÄTZUNG] Ein einzelner, von der Person ausgelöster Aufruf ihres selbst installierten Claude Code liegt am ehesten
im geduldeten Bereich, eine schriftliche Freigabe für eine verteilte App gibt es aber nicht. Klarheit bringt nur eine
Anfrage bei Anthropic.

Falls der Weg je freigegeben wird, gelten die Regeln aus MoinStudio: Claude Code nicht mitliefern; nur das unveränderte
`claude` starten; `%USERPROFILE%\.claude\.credentials.json` nie lesen; `claude setup-token` nie auslösen; im Kindprozess
`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`,
`CLAUDE_CODE_USE_FOUNDRY`, `ANTHROPIC_PROFILE` entfernen; nie `--bare`; Rechte nur gezielt über `--allowedTools` bzw.
`--permission-mode`; nur Aufrufe auf Aktion der Person; Namen nur als Text, kein Logo.

## 2. Claude Desktop ruft den lokalen MCP-Server von ContentStudio auf

**Urteil: erlaubt.**

- https://claude.com/docs/connectors/building/mcpb: „An MCP Bundle (`.mcpb`) is a zip archive containing a local MCP
  server and a `manifest.json`, which Claude Desktop installs in a single click […] The server runs on the user's machine
  over stdio“ und „Users install the `.mcpb` file themselves in Claude Desktop. Desktop extension listings in the
  directory are deprecated, and the directory no longer accepts MCPB submissions.“
- https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop: „Click
  'Advanced settings' and find the Extension Developer section. Click 'Install Extension…' Select the .mcpb file and
  follow the prompts to install.“

Regeln: nur stdio bzw. localhost; Werkzeuge klar beschreiben, schreibende Werkzeuge kennzeichnen; keine Geheimnisse im
Manifest; Verteilung über die eigenen Releases.

## 3. Eigener Anthropic-API-Schlüssel

**Urteil: erlaubt.**

- https://code.claude.com/docs/en/legal-and-compliance: „Each end user must authenticate with their own Anthropic API
  key, Claude subscription plan credentials, or 3P inference provider credential“.
- https://www.anthropic.com/legal/commercial-terms (Effective June 17, 2025): „Subject to these Terms, Anthropic gives
  Customer permission to use the Services, including to power products and services Customer makes available to its own
  customers and end users.“

Regeln: Schlüssel nur verschlüsselt lokal (Electron `safeStorage`/DPAPI), nie protokolliert, nur an `api.anthropic.com`;
Hinweis „Kosten laufen über dein Anthropic-Konto, es gilt die Usage Policy von Anthropic“.

## 4. OpenAI Codex CLI mit ChatGPT-Anmeldung und ChatGPT Desktop mit MCP

**Urteil: erlaubt** für lokale, quelloffene Apps; ChatGPT Desktop mit lokalem MCP-Server: erlaubt.

- https://learn.chatgpt.com/docs/app-server.md: „If you've built a local or open-source application using Codex
  app-server authentication, you can continue using it, though we recommend migrating to Sign in with ChatGPT so users
  have greater control over and visibility into their usage. […] App-server authentication has never been permitted for
  commercial or hosted services.“
- https://learn.chatgpt.com/docs/non-interactive-mode.md: „`codex exec` reuses saved CLI authentication by default.“ und
  „API keys are the right default for automation because they are simpler to provision and rotate.“
- https://learn.chatgpt.com/docs/auth.md: „Treat `~/.codex/auth.json` like a password: it contains access tokens.“
- https://developers.openai.com/siwc/token-sharing-open-source.md: „These docs explain ChatGPT plan usage for open-source
  and locally hosted apps.“
- https://learn.chatgpt.com/docs/extend/mcp.md: „The ChatGPT desktop app, Codex CLI, and IDE extension support MCP
  servers“; unterstützt werden „STDIO servers: Servers that run as a local process (started by a command).“
- Nicht abrufbar (HTTP 403): die Terms of Use und das Services Agreement auf openai.com.

Regeln: nur das unveränderte `codex` starten, Anmeldung macht die Person selbst (`codex login`); `~/.codex/auth.json`
nie lesen; im Kindprozess `OPENAI_API_KEY`, `CODEX_API_KEY`, `OPENAI_BASE_URL` entfernen; `--sandbox read-only`, nie
`danger-full-access`, `--dangerously-bypass-approvals-and-sandbox` oder `--full-auto`; keine gehostete oder kommerzielle
Variante; Hinweis „läuft über dein ChatGPT-Abo und dessen Limits“.

## 5. Eigener OpenAI-API-Schlüssel

**Urteil: erlaubt** (Vertragstext selbst nicht abrufbar, 403).

- https://developers.openai.com/api/docs/guides/production-best-practices: „Avoid exposing the API keys in your code or in
  public repositories; instead, store them in a secure location.“

## 6. Google Gemini

**Gemini CLI mit Google-Konto: eingestellt. Antigravity (`agy`) aus fremden Apps: nicht erlaubt [EINSCHÄTZUNG].
Gemini-API-Schlüssel: erlaubt, in EWR/CH/UK nur bezahlt.**

- https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli (19.05.2026): „On
  June 18, 2026, Gemini CLI and Gemini Code Assist IDE extensions will stop serving requests for Google AI Pro and Ultra,
  as well as those using it free of charge using Gemini Code Assist for individuals.“
- https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md: „Directly accessing the services
  powering Gemini CLI […] using third-party software, tools, or services […] is a violation of applicable terms and
  policies.“
- https://antigravity.google/terms/, Abschnitt 6: „This includes, but is not limited to, using the Service in connection
  with products not provided by us. Using third party software, tools, or services to access the Service (e.g. using
  OpenClaw with Antigravity OAuth) is a breach of this Agreement.“
- https://ai.google.dev/gemini-api/terms (28.04.2026): „When you use Unpaid Services, including, for example, Google AI
  Studio and the unpaid quota on Gemini API, Google uses the content you submit to the Services and any generated
  responses to provide, improve, and develop Google products and services and machine learning technologies […]“ und
  „You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland,
  or the United Kingdom.“; „You must be 18 years of age or older to use the APIs.“

Regeln: kein Google-Abo-Weg; Google-OAuth-Dateien nie anfassen; vor der ersten Nutzung bestätigen lassen, dass ein
bezahlter Schlüssel verwendet wird (Gratis-Tarif: Training und menschliche Prüfung).

## 7. Lokale Modelle

**Urteil: erlaubt.** Ollama und llama.cpp stehen unter MIT. LM Studio (https://lmstudio.ai/app-terms, 23.08.2026): „You
will not […] integrate the Software with other software other than through Company published interfaces made available
with the Software“ – die Anbindung über den lokalen Server ist eine solche veröffentlichte Schnittstelle; mitgeliefert
wird nichts. Für das gewählte Modell gilt dessen eigene Lizenz.

## 8. OpenRouter

**Urteil: erlaubt.** https://openrouter.ai/terms (31.08.2026): Verboten ist „access[ing] the Site or Service for purposes
of reselling API access to Models or otherwise developing a competing service.“ Es gelten zusätzlich die Bedingungen des
gewählten Modells; Logging/Training in den eigenen OpenRouter-Einstellungen prüfen.

## Zusatz: YouTube Data API v3 mit eigenem Schlüssel

**Urteil: erlaubt, mit Auflagen.** https://developers.google.com/youtube/terms/developer-policies (14.09.2026):

- „API Clients may temporarily store limited amounts of Non-Authorized Data for as long as is necessary for the purposes
  of the API Client but not longer than 30 calendar days. […] after 30 calendar days, the API Client must either delete
  or refresh the stored data.“
- „Your API Clients that access or use user data must provide a way for a user to request that you delete stored data
  related to that user.“
- „API Clients must display a link to YouTube's Terms of Service ( https://www.youtube.com/t/terms ) […]“
- „Any API Client page or feature that displays YouTube content […] must make clear to the viewer that YouTube is the
  source of the relevant content […]“
- „You must not […] embed your API Credentials in open source projects.“

Umsetzung: kein mitgelieferter Schlüssel; gespeicherte Kanal-Daten tragen `abgerufen` und werden nach 30 Tagen
automatisch entfernt; Knopf „Gespeicherte YouTube-Daten löschen“; Quelle „YouTube“ und Link zu den YouTube-Bedingungen
an der Anzeige. Dieselben Regeln gelten für den Feed-Weg ohne Schlüssel (siehe [datenquellen.md](datenquellen.md)).

## Für alle Wege

- Nie fremde Zugänge nutzen und keinen eigenen Abo-Login bauen.
- Anmeldedateien anderer Programme weder lesen noch weitergeben.
- Eigene Schlüssel nur verschlüsselt lokal speichern, nie protokollieren.
- Vor der ersten Nutzung eines Anbieters zeigen: wessen Konto und Kosten, welche Bedingungen, was gesendet wird.
- Keine Anbieter-Logos oder -Namen als Produkt- oder Funktionsname.
