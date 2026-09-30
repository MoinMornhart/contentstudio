import { describe, expect, it, vi } from 'vitest'

// electron und electron-updater gibt es im Testlauf nicht – nur die reine Hilfsfunktion wird geprüft.
vi.mock('electron', () => ({ app: {}, ipcMain: {} }))
vi.mock('electron-updater', () => ({ autoUpdater: {} }))

const { releaseNotesText } = await import('../../src/main/updater')

describe('releaseNotesText', () => {
  it('macht aus HTML-Release-Notizen lesbaren Text', () => {
    expect(releaseNotesText('<h2>Neu</h2><ul><li>Installer &amp; Update</li><li>Icon</li></ul>')).toBe('Neu\nInstaller & Update\nIcon')
  })
  it('verbindet Notizen mehrerer Versionen und verträgt null', () => {
    expect(releaseNotesText([{ version: '1', note: 'A' }, { version: '2', note: null }])).toBe('A')
    expect(releaseNotesText(null)).toBe('')
  })
})
