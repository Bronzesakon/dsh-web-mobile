import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu, IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from './locales.ts'
import {
  readHapticEnabled,
  writeHapticEnabled,
  readHapticIntensity,
  writeHapticIntensity,
} from './effects/haptic-pref.ts'
import type { HapticIntensity } from './effects/haptic-pref.ts'

/** Full props for the General-settings row (the slot owner passes nothing). */
export type HapticRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<typeof NS>

/** Intensity tiers in menu order. */
const INTENSITIES: readonly { id: HapticIntensity; labelKey: 'haptic.intensity.light' | 'haptic.intensity.medium' | 'haptic.intensity.heavy' }[] = [
  { id: 'light', labelKey: 'haptic.intensity.light' },
  { id: 'medium', labelKey: 'haptic.intensity.medium' },
  { id: 'heavy', labelKey: 'haptic.intensity.heavy' },
]

/**
 * General-settings preference row: pill switch for the tap vibration plus an
 * intensity selector styled after the official LanguageRow pill control
 * (bg-module-platform + chevron Menu). Client-only preferences — the switch
 * is a plain role=switch button (no official switch primitive exists) and
 * the intensity is a portaled Menu. Layout is a column: title + plugin
 * attribution on top, then a controls row with the switch and the selector
 * side by side, so the long title never squeezes the controls on a narrow
 * phone. While the switch is off the selector is disabled and grayed by the
 * stylesheet. State is read from localStorage on mount, so the row always
 * reflects the persisted preferences; writes persist and the haptic effect
 * re-arms on the custom event (intensity is read per tap, no re-arm needed).
 * The row renders on any width but the stylesheet hides it on desktop, where
 * the vibration can never fire (the plugin keeps ≥1024px identical to an
 * uninstalled state).
 */
export function HapticRow({ t }: HapticRowProps) {
  const [enabled, setEnabled] = useState(readHapticEnabled)
  const [intensity, setIntensity] = useState(readHapticIntensity)
  const [open, setOpen] = useState(false)
  const activeLabel = INTENSITIES.find((o) => o.id === intensity)?.labelKey ?? 'haptic.intensity.light'
  return (
    <div className="dsh-mobile-nav-haptic-row">
      <span className="dsh-mobile-nav-haptic-title">{t('haptic.title')}</span>
      <span className="dsh-mobile-nav-haptic-desc">{t('haptic.desc')}</span>
      <div className="dsh-mobile-nav-haptic-controls">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('haptic.title')}
          className="dsh-mobile-nav-haptic-switch"
          data-on={enabled ? '' : undefined}
          onClick={() => {
            const next = !enabled
            writeHapticEnabled(next)
            setEnabled(next)
            if (!next) setOpen(false)
          }}
        >
          <span className="dsh-mobile-nav-haptic-thumb" />
        </button>
        <Menu
          open={open}
          onClose={() => setOpen(false)}
          items={INTENSITIES.map((o) => ({ id: o.id, label: t(o.labelKey) }))}
          selectedId={intensity}
          onSelect={(id) => {
            const next = id === 'medium' || id === 'heavy' ? id : 'light'
            writeHapticIntensity(next)
            setIntensity(next)
            setOpen(false)
          }}
          align="end"
          portal
          anchor={
            <button
              type="button"
              className="dsh-mobile-nav-haptic-selector"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={t('haptic.intensityLabel')}
              disabled={!enabled}
              onClick={() => setOpen((v) => !v)}
            >
              {t(activeLabel)}
              <IconChevronDownOutline14 className="dsh-mobile-nav-haptic-chevron" />
            </button>
          }
        />
      </div>
    </div>
  )
}
