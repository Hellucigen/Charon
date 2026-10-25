import React, { useEffect, useState } from 'react'
import GlassPanel from '@/components/GlassPanel'
import { api } from '@/lib/api'
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react'

/* Academic — courses timetable, assignment deadlines and GPA. */

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export const Academic: React.FC = () => {
  const [courses, setCourses] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [showDone, setShowDone] = useState(false)
  const [gpa, setGpa] = useState<any>(null)
  const [cForm, setCForm] = useState({ name: '', teacher: '', day: 1, start: '', end: '', credits: '', score: '' })
  const [aForm, setAForm] = useState({ title: '', course_id: '', due: '', priority: 'normal' })

  const load = async () => {
    setCourses(await api.academic.courses() ?? [])
    setAssignments(await api.academic.assignments(showDone) ?? [])
    setGpa(await api.academic.gpa())
  }
  useEffect(() => { load() }, [showDone])

  const addCourse = async () => {
    if (!cForm.name) return
    await api.academic.saveCourse({
      ...cForm, credits: parseFloat(cForm.credits) || 0,
      score: cForm.score === '' ? -1 : parseFloat(cForm.score),
    })
    setCForm({ name: '', teacher: '', day: 1, start: '', end: '', credits: '', score: '' })
    load()
  }

  const addAssignment = async () => {
    if (!aForm.title) return
    await api.academic.saveAssignment({
      ...aForm,
      due_at: aForm.due ? Math.floor(new Date(aForm.due).getTime() / 1000) : 0,
    })
    setAForm({ title: '', course_id: '', due: '', priority: 'normal' })
    load()
  }

  const fmtDue = (ts: number) => {
    if (!ts) return '不限'
    const d = new Date(ts * 1000)
    const days = (ts - Date.now() / 1000) / 86400
    const overdue = days < 0 && true
    const soon = days >= 0 && days < 2
    return (
      <span className={overdue ? 'text-sig-error' : soon ? 'text-accent' : 'text-text-lo'}>
        {d.toLocaleDateString()} {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}
        {overdue ? ' · 逾期' : soon ? ' · 将到期' : ''}
      </span>
    )
  }

  const courseName = (a: any) => courses.find(c => c.id === a.course_id)?.name || a.course

  return (
    <div className="p-6 space-y-4">
      <GlassPanel title="ACADEMIC · 学业中心" />

      <div className="grid grid-cols-3 gap-4">
        <GlassPanel title="WEIGHTED AVG" subtitle="加权平均分">
          <div className="pt-mono text-3xl mt-2">{gpa ? Number(gpa.avg).toFixed(1) : '—'}</div>
        </GlassPanel>
        <GlassPanel title="GPA / 4.0" subtitle="常见四档制">
          <div className="pt-mono text-3xl mt-2">{gpa ? Number(gpa.gpa4).toFixed(2) : '—'}</div>
        </GlassPanel>
        <GlassPanel title="GRADED" subtitle="已出分课程">
          <div className="pt-mono text-3xl mt-2">{gpa?.graded ?? 0}</div>
        </GlassPanel>
      </div>

      <GlassPanel title="ASSIGNMENTS · 作业" subtitle={`${assignments.filter(a => !a.done).length} 个未完成`}>
        <div className="flex gap-2 mt-3 flex-wrap">
          <input className="pt-input flex-1 pt-mono text-xs min-w-[160px]" placeholder="作业标题 *"
            value={aForm.title} onChange={e => setAForm({ ...aForm, title: e.target.value })} />
          <select className="pt-input pt-mono text-xs" value={aForm.course_id} onChange={e => setAForm({ ...aForm, course_id: e.target.value })}>
            <option value="">无课程</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="datetime-local" className="pt-input pt-mono text-xs"
            value={aForm.due} onChange={e => setAForm({ ...aForm, due: e.target.value })} />
          <select className="pt-input pt-mono text-xs" value={aForm.priority} onChange={e => setAForm({ ...aForm, priority: e.target.value })}>
            <option value="normal">普通</option>
            <option value="high">紧急</option>
          </select>
          <button className="pt-btn pt-btn-primary" disabled={!aForm.title} onClick={addAssignment}><Plus size={13} /> 添加</button>
          <button className="pt-btn text-xs" onClick={() => setShowDone(!showDone)}>{showDone ? '隐藏已完成' : '显示已完成'}</button>
        </div>
        <div className="mt-3 space-y-1 max-h-[280px] overflow-auto">
          {assignments.map(a => (
            <div key={a.id} className={`flex items-center gap-2 border border-edge px-3 py-1.5 text-xs ${a.done ? 'opacity-50' : ''}`}>
              <button className={a.done ? 'text-accent' : 'text-text-lo'} title="切换完成"
                onClick={async () => { await api.academic.toggleAssignment(a.id); load() }}>
                {a.done ? <CheckCircle2 size={13} /> : <Circle size={13} />}
              </button>
              {a.priority === 'high' && <span className="text-sig-error pt-mono text-[10px]">!</span>}
              <span className={`flex-1 truncate ${a.done ? 'line-through' : ''}`}>{a.title}</span>
              {courseName(a) && <span className="text-text-lo shrink-0">{courseName(a)}</span>}
              <span className="shrink-0 pt-mono text-[10px]">{fmtDue(a.due_at)}</span>
              <button className="text-sig-error shrink-0" onClick={async () => { await api.academic.deleteAssignment(a.id); load() }}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          {assignments.length === 0 && <div className="text-xs text-text-lo py-2">没有作业 · 享受当下</div>}
        </div>
      </GlassPanel>

      <GlassPanel title="COURSES · 课程表">
        <div className="flex gap-2 mt-3 flex-wrap">
          <input className="pt-input pt-mono text-xs w-28" placeholder="课程名 *"
            value={cForm.name} onChange={e => setCForm({ ...cForm, name: e.target.value })} />
          <input className="pt-input pt-mono text-xs w-24" placeholder="教师"
            value={cForm.teacher} onChange={e => setCForm({ ...cForm, teacher: e.target.value })} />
          <select className="pt-input pt-mono text-xs" value={cForm.day} onChange={e => setCForm({ ...cForm, day: parseInt(e.target.value) })}>
            {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <input type="time" className="pt-input pt-mono text-xs" value={cForm.start} onChange={e => setCForm({ ...cForm, start: e.target.value })} />
          <input type="time" className="pt-input pt-mono text-xs" value={cForm.end} onChange={e => setCForm({ ...cForm, end: e.target.value })} />
          <input className="pt-input pt-mono text-xs w-16" placeholder="学分" value={cForm.credits} onChange={e => setCForm({ ...cForm, credits: e.target.value })} />
          <input className="pt-input pt-mono text-xs w-16" placeholder="分数" value={cForm.score} onChange={e => setCForm({ ...cForm, score: e.target.value })} />
          <button className="pt-btn pt-btn-primary" disabled={!cForm.name} onClick={addCourse}><Plus size={13} /></button>
        </div>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-3 gap-2">
          {courses.map(c => (
            <div key={c.id} className="border border-edge px-3 py-2 text-xs group relative">
              <div className="flex justify-between">
                <span className="text-sm">{c.name}</span>
                <button className="text-sig-error opacity-0 group-hover:opacity-100"
                  onClick={async () => { await api.academic.deleteCourse(c.id); load() }}><Trash2 size={11} /></button>
              </div>
              <div className="text-text-lo pt-mono text-[10px] mt-1">
                {DAY_NAMES[c.day]} {c.start}{c.end ? `–${c.end}` : ''} {c.location && `· ${c.location}`}
              </div>
              <div className="text-text-lo pt-mono text-[10px]">
                {c.teacher && `${c.teacher} · `}{c.credits} 学分{c.score >= 0 ? ` · ${c.score}分` : ''}
              </div>
            </div>
          ))}
          {courses.length === 0 && <div className="text-xs text-text-lo py-2">还没有课程</div>}
        </div>
      </GlassPanel>
    </div>
  )
}

export default Academic
