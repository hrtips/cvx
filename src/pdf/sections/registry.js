// ── Section Registry ────────────────────────────────────────────────────────
// Maps layout slot keys to React components.
// Layout configs reference sections by these string keys.
// ────────────────────────────────────────────────────────────────────────────

import { createElement } from 'react'
import { View } from '@react-pdf/renderer'

import IdentityPhoto       from './IdentityPhoto.jsx'
import IdentityCompact     from './IdentityCompact.jsx'
import ContactSection      from './ContactSection.jsx'
import AchievementsSection from './AchievementsSection.jsx'
import EducationSection    from './EducationSection.jsx'
import CompetenciesSection from './CompetenciesSection.jsx'
import RefereesSection     from './RefereesSection.jsx'
import SummarySection      from './SummarySection.jsx'
import ExperienceSection   from './ExperienceSection.jsx'
import HeaderATS           from './HeaderATS.jsx'

export const SECTION_REGISTRY = {
  'identity-photo':   IdentityPhoto,
  'identity-compact': IdentityCompact,
  'contact':          ContactSection,
  'achievements':     AchievementsSection,
  'education':        EducationSection,
  'competencies':     CompetenciesSection,
  'referees':         RefereesSection,
  'summary':          SummarySection,
  'experience':       ExperienceSection,
  'header-ats':       HeaderATS,
}

/**
 * Render an array of slot keys into React elements.
 *
 * Slot key formats:
 *   "summary"              → renders SummarySection with data
 *   "experience"           → renders ExperienceSection with entries
 *   "experience:continued" → renders ExperienceSection with continued=true
 *   "spacer:27"            → renders a spacer View
 *
 * @param {string[]} keys   Slot keys from layout config
 * @param {object}   data   Full CV data bag
 * @param {object}   [extra]  Extra props (entries for experience)
 * @returns {React.ReactElement[]}
 */
export function renderSlot(keys, data, extra = {}) {
  return keys.map((key, i) => {
    // Spacer: "spacer:27"
    if (key.startsWith('spacer:')) {
      const height = parseFloat(key.split(':')[1])
      return createElement(View, { key: `spacer-${i}`, style: { height } })
    }

    // Experience continued: "experience:continued"
    if (key === 'experience:continued') {
      return createElement(ExperienceSection, {
        key: `experience-cont-${i}`,
        data,
        entries: extra.entries ?? [],
        continued: true,
      })
    }

    // Experience (first page): "experience"
    if (key === 'experience') {
      return createElement(ExperienceSection, {
        key: `experience-${i}`,
        data,
        entries: extra.entries ?? [],
        continued: false,
      })
    }

    // Standard section
    const Component = SECTION_REGISTRY[key]
    if (!Component) {
      console.warn(`[section-registry] Unknown section key: "${key}"`)
      return null
    }
    return createElement(Component, { key: `${key}-${i}`, data })
  })
}
