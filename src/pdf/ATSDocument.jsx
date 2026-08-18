// ── ATS-SAFE CV DOCUMENT ────────────────────────────────────────────────────
// Single-column, plain PDF optimised for Applicant Tracking Systems.
// Uses ThemeContext for mono palette but keeps its own section rendering
// (ATS sections have different styling from the designed two-column layout).
// Run:  npm run pdf:ats
// ────────────────────────────────────────────────────────────────────────────

import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { useMemo } from 'react'
import { buildKeywords } from './keywords.js'
import { bulletText } from './layout.js'
import { ThemeContext, useTheme } from './ThemeContext.jsx'
import { monoTheme } from './themes/mono.js'

const M = 42 // page margin ≈ 14.8mm

/** @param {import('./types.js').Theme} t */
const makeStyles = (t) =>
  StyleSheet.create({
    page: {
      fontFamily: t.typography.fontFamily,
      backgroundColor: t.palette.white,
      paddingHorizontal: M,
      paddingTop: M,
      paddingBottom: M
    },

    // Header
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 2
    },
    headerText: { flex: 1, paddingRight: 12 },
    name: { fontSize: 16, fontWeight: 700, color: t.palette.textDark },
    titleLine: { fontSize: 10, color: t.palette.textBody, marginTop: 2, marginBottom: 3 },
    contactLine: { fontSize: 8.5, color: t.palette.textMuted },
    photo: { width: 72, height: 72, objectFit: 'cover', borderRadius: 3 },

    // Section heading
    section: {
      fontSize: 9.5,
      fontWeight: 700,
      color: t.palette.textDark,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      borderBottomWidth: 0.75,
      borderBottomColor: t.palette.textDark,
      paddingBottom: 2,
      marginTop: 14,
      marginBottom: 8
    },

    // Experience
    role: { fontSize: 10, fontWeight: 700, color: t.palette.textDark },
    expMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 1.5,
      marginBottom: 2
    },
    company: { fontSize: 9, color: t.palette.textBody },
    period: { fontSize: 9, color: t.palette.textMuted },
    desc: {
      fontSize: 8.5,
      fontStyle: 'italic',
      color: t.palette.textMuted,
      lineHeight: 1.4,
      marginBottom: 4
    },
    progBlock: { marginVertical: 3 },
    progRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 },
    progTitle: { fontSize: 8.5, color: t.palette.textBody },
    progPeriod: { fontSize: 8.5, color: t.palette.textMuted },
    entryGap: { height: 9 },

    // Bullets
    bulletRow: { flexDirection: 'row', marginBottom: 2.5 },
    bulletDash: { fontSize: 9, color: t.palette.textDark, marginRight: 5, marginTop: 0.5 },
    bulletText: { flex: 1, fontSize: 9, color: t.palette.textDark, lineHeight: 1.45 },

    // Education
    degree: { fontSize: 9.5, fontWeight: 700, color: t.palette.textDark },
    eduMeta: { fontSize: 9, color: t.palette.textBody, marginBottom: 2 },

    // Competencies
    compText: { fontSize: 9, color: t.palette.textDark, lineHeight: 1.6 },

    // Achievements
    achieveRow: { flexDirection: 'row', marginBottom: 3.5 },
    achieveYear: { fontSize: 9, fontWeight: 700, color: t.palette.textDark, width: 150 },
    achieveText: { flex: 1, fontSize: 9, color: t.palette.textBody },

    // Referees
    refName: { fontSize: 9.5, fontWeight: 700, color: t.palette.textDark },
    refDetail: { fontSize: 9, color: t.palette.textBody, marginBottom: 1 },
    refGap: { height: 7 }
  })

/** @param {import('./types.js').RenderContent} props */
function ATSContent({
  personal,
  summary,
  experience,
  achievements,
  education,
  certifications,
  publications,
  languages,
  competencies,
  referees,
  profilePhoto
}) {
  const theme = useTheme()
  const s = useMemo(() => makeStyles(theme), [theme])

  const linkParts = (personal.links ?? []).map((l) => (l.label ? `${l.label}: ${l.href}` : l.href))
  const contactParts = [
    personal.phone,
    personal.email,
    personal.linkedin,
    personal.location,
    ...linkParts
  ].filter(Boolean)

  return (
    <Page size="A4" style={s.page}>
      {/* Header */}
      <View style={s.headerRow}>
        <View style={s.headerText}>
          <Text style={s.name}>{personal.name}</Text>
          <Text style={s.titleLine}>
            {personal.title}
            {personal.company ? `  |  ${personal.company}` : ''}
          </Text>
          <Text style={s.contactLine}>{contactParts.join('  |  ')}</Text>
        </View>
        {profilePhoto && <Image src={profilePhoto} style={s.photo} />}
      </View>

      {/* Summary */}
      {summary?.length > 0 && (
        <View>
          <Text style={s.section}>Summary</Text>
          {summary.map((b, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: bullet text may repeat; index is the stable identity for this single-shot ATS render
            <View key={i} style={s.bulletRow}>
              <Text style={s.bulletDash}>–</Text>
              <Text style={s.bulletText}>{typeof b === 'string' ? b : b.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Experience */}
      {experience?.length > 0 && (
        <View>
          <Text style={s.section}>Experience</Text>
          {experience.map((e, i) => (
            <View key={`${e.role}-${e.company}`}>
              {i > 0 && <View style={s.entryGap} />}
              <Text style={s.role}>{e.role}</Text>
              <View style={s.expMeta}>
                <Text style={s.company}>
                  {e.company}
                  {/* RV15: `experience[].location` was drawn NOWHERE in this
                      variant — the designed CV renders it, the ATS one dropped
                      it silently. Content, not decoration, so INV-0. Appended
                      to the company run rather than given its own column: the
                      period is right-aligned in this row and a third cell
                      would reflow a layout nothing else needed changed. */}
                  {e.location ? ` · ${e.location}` : ''}
                </Text>
                <Text style={s.period}>{e.period}</Text>
              </View>
              {e.description && <Text style={s.desc}>{e.description}</Text>}
              {
                /** @type {import('./types.js').ProgressionStep[]} */ (e.progression)?.length >
                  0 && (
                  <View style={s.progBlock}>
                    {
                      /** @type {import('./types.js').ProgressionStep[]} */ (e.progression).map(
                        (p) => (
                          <View key={p.title} style={s.progRow}>
                            <Text style={s.progTitle}>{p.title}</Text>
                            <Text style={s.progPeriod}>{p.period}</Text>
                          </View>
                        )
                      )
                    }
                  </View>
                )
              }
              {e.bullets?.map((b, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: bullet text may repeat; index is the stable identity for this single-shot ATS render
                <View key={j} style={s.bulletRow}>
                  <Text style={s.bulletDash}>–</Text>
                  <Text style={s.bulletText}>{bulletText(b)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Education */}
      {education?.length > 0 && (
        <View>
          <Text style={s.section}>Education</Text>
          {education.map((edu, i) => (
            <View key={edu.degree}>
              {i > 0 && <View style={{ height: 5 }} />}
              <Text style={s.degree}>{edu.degree}</Text>
              <Text style={s.eduMeta}>
                {edu.institution}
                {edu.period ? `  |  ${edu.period}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Certifications */}
      {certifications?.length > 0 && (
        <View>
          <Text style={s.section}>Certifications</Text>
          {certifications.map((c, i) => (
            <View key={c.name}>
              {i > 0 && <View style={{ height: 5 }} />}
              <Text style={s.degree}>{c.name}</Text>
              {(c.issuer || c.year) && (
                <Text style={s.eduMeta}>{[c.issuer, c.year].filter(Boolean).join('  |  ')}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Publications */}
      {publications?.length > 0 && (
        <View>
          <Text style={s.section}>Publications</Text>
          {publications.map((p, i) => (
            <View key={p.title}>
              {i > 0 && <View style={{ height: 5 }} />}
              <Text style={s.degree}>{p.title}</Text>
              {(p.venue || p.year) && (
                <Text style={s.eduMeta}>{[p.venue, p.year].filter(Boolean).join('  |  ')}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Core Competencies */}
      {competencies?.length > 0 && (
        <View>
          <Text style={s.section}>Core Competencies</Text>
          <Text style={s.compText}>{competencies.join('  ·  ')}</Text>
        </View>
      )}

      {/* Languages */}
      {languages?.length > 0 && (
        <View>
          <Text style={s.section}>Languages</Text>
          <Text style={s.compText}>
            {languages
              .map((l) => (l.proficiency ? `${l.language} (${l.proficiency})` : l.language))
              .join('  ·  ')}
          </Text>
        </View>
      )}

      {/* Achievements */}
      {achievements?.length > 0 && (
        <View>
          <Text style={s.section}>Achievements</Text>
          {achievements.map((a, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: achievement text may repeat; index is the stable identity for this single-shot ATS render
            <View key={i} style={s.achieveRow}>
              <Text style={s.achieveYear}>{a.year}</Text>
              <Text style={s.achieveText}>{a.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Referees. D1: an EMPTY list is not "no section" — it is the documented
          request for the fallback line, and three shipped texts promise it
          (SKILL.md's content-files list, the scaffolded referees.yaml comment,
          and layouts/two-column.yaml's note that "the ATS layout still includes
          it"). Gating the whole block on `length > 0` made `referees: []` — the
          value `cvx init` scaffolds — print nothing at all here, while the
          designed variant printed it correctly via SIDEBAR_SECTIONS' `always`
          flag. Only a genuinely absent `referees` key renders nothing. */}
      {referees && (
        <View>
          <Text style={s.section}>References</Text>
          {referees.length === 0 && (
            <Text style={s.refDetail}>References available upon request.</Text>
          )}
          {referees.map((ref, i) => (
            <View key={ref.name}>
              {i > 0 && <View style={s.refGap} />}
              <Text style={s.refName}>{ref.name}</Text>
              {ref.title && (
                <Text style={s.refDetail}>
                  {ref.title}
                  {ref.company ? `, ${ref.company}` : ''}
                </Text>
              )}
              {ref.phone && <Text style={s.refDetail}>{ref.phone}</Text>}
              {ref.email && <Text style={s.refDetail}>{ref.email}</Text>}
            </View>
          ))}
        </View>
      )}
    </Page>
  )
}

/**
 * @param {import('./types.js').RenderContent & {
 *   theme?: import('./types.js').Theme,
 *   config?: import('./types.js').CVConfig,
 *   creationDate?: Date,
 * }} props
 */
export default function ATSDocument({
  personal,
  summary,
  experience,
  achievements,
  education,
  certifications,
  publications,
  languages,
  competencies,
  referees,
  keywords,
  profilePhoto,
  theme,
  config,
  creationDate
}) {
  const activeTheme = theme ?? monoTheme

  // ATS / AI-parser keywords embedded in the PDF's Keywords metadata field.
  const keywordString = buildKeywords({ keywords, competencies, experience, personal }, config)

  return (
    <ThemeContext.Provider value={activeTheme}>
      <Document
        title={personal.name}
        author={personal.name}
        subject={personal.title ?? 'Curriculum Vitae'}
        keywords={keywordString}
        creator="cvx"
        producer="cvx"
        language="en"
        creationDate={creationDate}
      >
        <ATSContent
          personal={personal}
          summary={summary}
          experience={experience}
          achievements={achievements}
          education={education}
          certifications={certifications}
          publications={publications}
          languages={languages}
          competencies={competencies}
          referees={referees}
          profilePhoto={profilePhoto}
        />
      </Document>
    </ThemeContext.Provider>
  )
}
