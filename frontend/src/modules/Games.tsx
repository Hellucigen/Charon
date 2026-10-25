import React, { useEffect, useState } from 'react'
import GlassPanel from '@/components/GlassPanel'
import { api } from '@/lib/api'
import { Plus, Trash2 } from 'lucide-react'

/* Games — aggregated foreground-app usage for game processes, from the
 * Time module's tracker. Includes a weekly budget guard (local only). */

const fmtH = (sec: number) => {
  const h = sec / 3600
  return h >= 10 ? `${h.toFixed(0)}h` : `${h.toFixed(1)}h`
}

export const Games: React.FC = () => {
  const [stats, setStats] = useState<any>(null)
  const [days, setDays] = useState(14)
  const [marks, setMarks] = useState<any[]>([])
  const [newMark, setNewMark] = useState('')
  const [budget, setBudget] = useState(() => parseFloat(localStorage.getItem('games.weekly.budget') || '10'))

  const load = async (d = days) => {
    setStats(await api.games.stats(d))
    setMarks(await api.games.marks() ?? [])
  }
  useEffect(() => { load() }, [])

  const total = stats?.total ?? 0
  const perDay = stats?.by_day?.length ? total / stats.by_day.length : 0
  const weekly = perDay * 7
  const over = weekly > budget * 3600

  return (
    <div className="p-6 space-y-4">
      <GlassPanel title="GAMES · 游戏时长" />

      <div className="grid grid-cols-4 gap-4">
        <GlassPanel title={`TOTAL / ${days}D`}>
          <div className="pt-mono text-3xl mt-2">{fmtH(total)}</div>
        </GlassPanel>
        <GlassPanel title="DAILY AVG">
          <div className="pt-mono text-3xl mt-2">{fmtH(perDay)}</div>
        </GlassPanel>
        <GlassPanel title="WEEKLY EST">
          <div className={`pt-mono text-3xl mt-2 ${over ? 'text-sig-error' : ''}`}>{fmtH(weekly)}</div>
        </GlassPanel>
        <GlassPanel title="WEEKLY BUDGET">
          <div className="flex items-center gap-1 mt-2">
            <input type="number" step="0.5" className="pt-input pt-mono text-sm w-16" value={budget}
              onChange={e => {
                const v = parseFloat(e.target.value) || 0
                setBudget(v)
                localStorage.setItem('games.weekly.budget', String(v))
              }} />
            <span className="pt-mono text-xs text-text-lo">h/周</span>
          </div>
          {over && <div className="text-[10px] text-sig-error mt-1">超预算 · {fmtH(weekly - budget * 3600)}</div>}
        </GlassPanel>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <GlassPanel title="BY APP · 按进程" subtitle={`${days} 天内`}>
          <div className="flex gap-1.5 mt-2">
            {[7, 14, 30].map(d => (
              <button key={d} className={`pt-btn text-xs ${days === d ? 'pt-btn-primary' : ''}`}
                onClick={() => { setDays(d); load(d) }}>{d}D</button>
            ))}
          </div>
          <div className="mt-3 space-y-1">
            {(stats?.by_app ?? []).map((r: any) => {
              const max = stats.by_app[0].seconds || 1
              return (
                <div key={r.app} className="text-xs">
                  <div className="flex justify-between pt-mono">
                    <span className="truncate">{r.app}</span>
                    <span className="text-text-lo">{fmtH(r.seconds)}</span>
                  </div>
                  <div className="h-1.5 bg-surface mt-0.5">
                    <div className="h-full bg-accent" style={{ width: `${(r.seconds / max) * 100}%` }} />
                  </div>
                </div>
              )
            })}
            {(stats?.by_app ?? []).length === 0 && (
              <div className="text-xs text-text-lo py-2">
                暂无数据 · 确认 Time 模块已开启前台追踪,或添加游戏进程标记
              </div>
            )}
          </div>
        </GlassPanel>

        <GlassPanel title="BY DAY · 每日趋势" subtitle="秒 → 小时">
          <div className="mt-3 flex items-end gap-1 h-[180px]">
            {(stats?.by_day ?? []).slice(-30).map((d: any) => {
              const max = Math.max(...(stats?.by_day ?? []).map((x: any) => x.seconds), 1)
              return (
                <div key={d.day} className="flex-1 group relative" title={`${d.day}: ${fmtH(d.seconds)}`}>
                  <div className="bg-accent/70 hover:bg-accent w-full" style={{ height: `${Math.max((d.seconds / max) * 160, 2)}px` }} />
                </div>
              )
            })}
            {(stats?.by_day ?? []).length === 0 && <div className="text-xs text-text-lo">暂无数据</div>}
          </div>
        </GlassPanel>
      </div>

      <GlassPanel title="MARKS · 游戏进程标记" subtitle="内置常见平台已覆盖,可补充自定义进程关键字">
        <div className="flex gap-2 mt-3">
          <input className="pt-input flex-1 pt-mono text-xs" placeholder="进程名关键字(如 Valorant、javaw、Runes of Magic)"
            value={newMark} onChange={e => setNewMark(e.target.value)} />
          <button className="pt-btn pt-btn-primary" disabled={!newMark} onClick={async () => {
            await api.games.addMark(newMark); setNewMark(''); load()
          }}><Plus size={13} /> 添加</button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {marks.map(m => (
            <span key={m.id} className="inline-flex items-center gap-1 border border-edge px-2 py-0.5 text-xs pt-mono">
              {m.pattern}
              <button className="text-sig-error" onClick={async () => { await api.games.deleteMark(m.id); load() }}>
                <Trash2 size={10} />
              </button>
            </span>
          ))}
        </div>
      </GlassPanel>
    </div>
  )
}

export default Games
