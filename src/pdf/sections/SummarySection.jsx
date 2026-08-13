// ── Summary section (main column) ───────────────────────────────────────────
import { View } from '@react-pdf/renderer'
import BulletList from '../components/BulletList.jsx'
import SectionTitle from '../components/SectionTitle.jsx'
import { useTheme } from '../ThemeContext.jsx'

/** @param {{ data: import('../types.js').CVContent }} props */
export default function SummarySection({ data }) {
  const { summary } = data
  const t = useTheme()
  if (!summary?.length) return null
  return (
    <View>
      <SectionTitle>Summary</SectionTitle>
      <BulletList items={summary} gap={t.spacing.summaryBulletGap} />
    </View>
  )
}
