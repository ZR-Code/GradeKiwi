import { useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import { CourseCard } from '../components/CourseCard'
import { Page, PageHeader, SyncErrorBanner } from '../components/Layout'
import { Card, EmptyState, Input, Segmented } from '../components/ui'
import { useStore } from '../hooks/useStore'

export default function Courses() {
  const { summaries } = useStore()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'period' | 'grade' | 'name'>('period')
  const list = summaries
    .filter((s) => `${s.course.name} ${s.course.teacher ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'grade' ? (b.percent ?? -1) - (a.percent ?? -1) : sort === 'name' ? a.course.name.localeCompare(b.course.name) : 0))
  return (
    <>
      <PageHeader title="Courses" subtitle={`${summaries.length} courses`} period />
      <Page>
        <SyncErrorBanner />
        <div className="mb-4 flex items-center gap-3">
          <div className="relative w-72">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses or teachers" className="w-full pl-8" />
          </div>
          <div className="flex-1" />
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: 'period', label: 'Schedule' },
              { value: 'grade', label: 'Grade' },
              { value: 'name', label: 'Name' }
            ]}
          />
        </div>
        {list.length === 0 ? (
          <Card>
            <EmptyState icon={<BookOpen size={18} />} title="No matching courses" />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {list.map((s) => (
              <CourseCard key={s.course.id} s={s} />
            ))}
          </div>
        )}
      </Page>
    </>
  )
}
