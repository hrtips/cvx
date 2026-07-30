// ── Summary section (main column) ───────────────────────────────────────────
import { View } from '@react-pdf/renderer'
import SectionTitle from '../components/SectionTitle.jsx'
import BulletList from '../components/BulletList.jsx'

/** @param {{ data: import('../types.js').CVContent }} props */
export default function SummarySection({ data }) {
  const { summary } = data
  if (!summary?.length) return null
  return (
    <View>
      <SectionTitle>Summary</SectionTitle>
      <BulletList items={summary} gap={7.5} />
    </View>
  )
}
