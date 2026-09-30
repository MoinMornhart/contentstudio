// Tests laufen immer auf Deutsch, egal welche Sprache Windows hat (sonst weichen Meldungen auf englischen Rechnern ab).
import { setzeHauptSprache } from '../src/main/i18n'

setzeHauptSprache('de')
