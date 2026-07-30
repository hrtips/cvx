// ── Summary section (main column) ───────────────────────────────────────────
import { View } from '@react-pdf/renderer'
import BulletList from '../components/BulletList.jsx'
import SectionTitle from '../components/SectionTitle.jsx'

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
