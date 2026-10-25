import React, { useEffect, useMemo, useState } from 'react'
import GlassPanel from '@/components/GlassPanel'
import { api } from '@/lib/api'
import { Downloads } from '@/modules/Downloads'
import { Network } from '@/modules/Network'
import { Download, RefreshCw, Clock, Hash, Braces, FileClock } from 'lucide-react'

/* Toolkit — the consolidated utilities surface: Edge history archiver
 * (incremental local save), plus the network and file tools that used to
 * be separate modules. */

const fmtH = (ms: number) => ms >= 60000 ? `${(ms / 60000).toFixed(1)}min` : `${(ms / 1000).toFixed(0)}s`

type Tab = 'edge' | 'net' | 'misc' | 'dl'

export const Toolkit: React.FC = () => {
  const [tab, setTab] = useState<Tab>('edge')

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'edge', label: 'EDGE 历史归档', icon: FileClock },
    { id: 'net',  label: '网络工具',     icon: Hash },
    { id: 'misc', label: '实用工具',     icon: Braces },
    { id: 'dl',   label: '下载整理',     icon: Download },
  ]

  return (
    <div className="p-6 space-y-4">
      <GlassPanel title="TOOLKIT · 工具箱" />

      <div className="flex gap-1.5">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} className={`pt-btn text-xs ${tab === t.id ? 'pt-btn-primary' : ''}`} onClick={() => setTab(t.id)}>
              <Icon size={12} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'edge' && <EdgeHistory />}
      {tab === 'net' && <div className="-m-6"><Network /></div>}
      {tab === 'misc' && <MiscTools />}
      {tab === 'dl' && <div className="-m-6"><Downloads /></div>}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────
   EDGE history archiver
──────────────────────────────────────────────────────────────────── */

const EdgeHistory: React.FC = () => {
  const [profiles, setProfiles] = useState<any[]>([])
  const [sel, setSel] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [stats, setStats] = useState<any>(null)
  const [rows, setRows] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [exportDir, setExportDir] = useState('')

  const refresh = async () => {
    setProfiles(await api.toolkit.edgeProfiles() ?? [])
    setStats(await api.toolkit.edgeStats())
    setRows(await api.toolkit.edgeHistory(q, 400) ?? [])
  }
  useEffect(() => { refresh() }, [])

  const importAll = async () => {
    setBusy(true)
    try {
      const r = await api.toolkit.edgeImport(sel)
      const n = (r?.imported ?? 0) as number
      setMsg(n > 0 ? `新增归档 ${n} 条 · 本地共 ${r?.stored ?? 0} 条` : `已是最新 · 本地共 ${r?.stored ?? 0} 条`)
      await refresh()
    } catch (e: any) {
      setMsg(`提取失败: ${e?.message ?? e}`)
    } finally { setBusy(false) }
  }

  const exportArchive = async (fmt: string) => {
    if (!exportDir) { setMsg('先填导出目录'); return }
    const path = await api.toolkit.edgeExport(exportDir, fmt)
    setMsg(`已导出: ${path}`)
  }

  return (
    <div className="space-y-4">
      <GlassPanel title="ARCHIVE · 本地归档" subtitle="Edge 只保留近几个月记录,此处增量保存到本地">
        <div className="flex gap-2 mt-3 flex-wrap items-center">
          <select className="pt-input pt-mono text-xs w-44" value={sel} onChange={e => setSel(e.target.value)}>
            <option value="">全部配置文件</option>
            {profiles.map(p => <option key={p.profile} value={p.profile}>{p.profile}</option>)}
          </select>
          <button className="pt-btn pt-btn-primary" disabled={busy} onClick={importAll}>
            <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> {busy ? '提取中…' : '提取新增记录'}
          </button>
          <span className="text-xs pt-mono text-text-lo">
            本地 {stats?.total ?? 0} 条 · {stats?.first_day ?? '—'} → {stats?.last_day ?? '—'}
          </span>
        </div>
        {msg && <div className="text-xs text-accent mt-2 pt-mono">{msg}</div>}

        {profiles.length > 0 && (
          <div className="mt-3 space-y-1">
            {profiles.map(p => (
              <div key={p.profile} className="flex items-center gap-2 border border-edge px-3 py-1.5 text-xs">
                <span className="pt-dot live shrink-0" />
                <span className="flex-1 truncate">{p.profile}</span>
                <span className="pt-mono text-[10px] text-text-lo">已存 {p.saved} 条</span>
                <span className="pt-mono text-[10px] text-text-lo">
                  源文件 {new Date(p.file_mtime * 1000).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {stats?.domains?.length > 0 && (
        <GlassPanel title="TOP DOMAINS · 常访问域名">
          <div className="flex flex-wrap gap-1.5 mt-3">
            {stats.domains.map((d: any) => (
              <span key={d.host} className="pt-chip pt-chip-accent">{d.host} · {d.count}</span>
            ))}
          </div>
        </GlassPanel>
      )}

      <GlassPanel title="EXPORT · 导出备份" subtitle="CSV 可直接用 Excel 打开">
        <div className="flex gap-2 mt-3">
          <input className="pt-input flex-1 pt-mono text-xs" placeholder="导出目录绝对路径(如 E:\\Archive\\browser)"
            value={exportDir} onChange={e => setExportDir(e.target.value)} />
          <button className="pt-btn pt-btn-primary" onClick={() => exportArchive('csv')}>CSV</button>
          <button className="pt-btn" onClick={() => exportArchive('json')}>JSON</button>
        </div>
      </GlassPanel>

      <GlassPanel title="BROWSE · 已归档记录" subtitle="支持关键词过滤 URL 与标题">
        <div className="flex gap-2 mt-3">
          <input className="pt-input flex-1 pt-mono text-xs" placeholder="搜索已归档的记录…"
            value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={async e => { if (e.key === 'Enter') setRows(await api.toolkit.edgeHistory(q, 400) ?? []) }} />
          <button className="pt-btn" disabled={stats?.total === 0}
            onClick={async () => {
              if (confirm('清空本地 Edge 归档? 下次提取将从头开始全量导入。')) {
                await api.toolkit.edgeClear(); setQ(''); refresh()
              }
            }}>清空</button>
        </div>
        <div className="mt-3 space-y-1 max-h-[460px] overflow-auto">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start gap-2 border border-edge px-3 py-1.5 text-xs group hover:border-accent/50">
              <Clock size={11} className="text-text-lo shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{r.title || <span className="text-text-lo">(无标题)</span>}</div>
                <a href={r.url} target="_blank" rel="noreferrer" className="pt-mono text-[10px] text-teal truncate block">
                  {r.url}
                </a>
              </div>
              <span className="pt-mono text-[10px] text-text-lo shrink-0 text-right">
                {new Date(r.visit_at * 1000).toLocaleString()}
                {r.duration_ms > 0 && <span className="block">停留 {fmtH(r.duration_ms)}</span>}
              </span>
            </div>
          ))}
          {rows.length === 0 && <div className="pt-empty mt-2">尚无归档 · 点击「提取新增记录」</div>}
        </div>
      </GlassPanel>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────
   Misc utilities — pure client side
──────────────────────────────────────────────────────────────────── */

const Copy: React.FC<{ text: string }> = ({ text }) => (
  <button className="pt-btn pt-btn-ghost text-[10px]" onClick={() => navigator.clipboard?.writeText(text)}>复制</button>
)

const Timestamp: React.FC = () => {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  const [input, setInput] = useState('')
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t) }, [])

  const parsed = useMemo(() => {
    const s = input.trim()
    if (!s) return null
    if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000)
    if (/^\d{13}$/.test(s)) return new Date(Number(s))
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }, [input])

  return (
    <GlassPanel title="TIMESTAMP · 时间戳">
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="pt-mono text-xl">{now}</span>
          <Copy text={String(now)} />
          <span className="text-xs text-text-lo">{new Date(now * 1000).toLocaleString()}</span>
        </div>
        <input className="pt-input pt-mono text-xs" placeholder="输入 10/13 位时间戳或日期字符串"
          value={input} onChange={e => setInput(e.target.value)} />
        {parsed && (
          <div className="pt-mono text-xs flex flex-wrap gap-3">
            <span>本地 {parsed.toLocaleString()}</span>
            <span>UTC {parsed.toISOString()}</span>
            <span className="text-accent">秒 {Math.floor(parsed.getTime() / 1000)}</span>
            <span className="text-accent">毫秒 {parsed.getTime()}</span>
          </div>
        )}
      </div>
    </GlassPanel>
  )
}

const UUIDGen: React.FC = () => {
  const [list, setList] = useState<string[]>([])
  const gen = (n = 5) => {
    const out: string[] = []
    for (let i = 0; i < n; i++) {
      out.push(crypto.randomUUID ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
          }))
    }
    setList(out)
  }
  return (
    <GlassPanel title="UUID / RANDOM · 生成器">
      <div className="p-3 space-y-2">
        <div className="flex gap-2">
          <button className="pt-btn pt-btn-primary" onClick={() => gen(1)}>生成 1</button>
          <button className="pt-btn" onClick={() => gen(5)}>生成 5</button>
          <button className="pt-btn" onClick={() => setList([])}>清空</button>
        </div>
        {list.map((u, i) => (
          <div key={i} className="flex items-center gap-2 text-xs pt-mono">
            <span className="flex-1 break-all">{u}</span>
            <Copy text={u} />
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

const ColorTool: React.FC = () => {
  const [hex, setHex] = useState('#ff6b00')
  const parse = useMemo(() => {
    const m = hex.trim().replace('#', '')
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(m)) return null
    const s = m.length === 3 ? m.split('').map(c => c + c).join('') : m
    const n = parseInt(s, 16)
    return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 }
  }, [hex])
  return (
    <GlassPanel title="COLOR · 颜色格式">
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input type="color" value={hex} onChange={e => setHex(e.target.value)} className="w-8 h-8 border border-edge cursor-pointer" />
          <input className="pt-input pt-mono text-xs w-32" value={hex} onChange={e => setHex(e.target.value)} />
        </div>
        {parse && (
          <div className="pt-mono text-xs space-y-1">
            <div className="flex gap-2 items-center"><span className="flex-1">rgb({parse.r}, {parse.g}, {parse.b})</span><Copy text={`rgb(${parse.r}, ${parse.g}, ${parse.b})`} /></div>
            <div className="flex gap-2 items-center"><span className="flex-1">{hex}</span><Copy text={hex} /></div>
          </div>
        )}
      </div>
    </GlassPanel>
  )
}

const JWTDecode: React.FC = () => {
  const [jwt, setJwt] = useState('')
  const [out, setOut] = useState('')
  const decode = () => {
    const parts = jwt.trim().split('.')
    if (parts.length < 2) { setOut('需要 header.payload 两段'); return }
    try {
      const p = (s: string) => JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=')))
      const payload = p(parts[1])
      if (payload.exp) payload._exp_readable = new Date(payload.exp * 1000).toLocaleString()
      if (payload.iat) payload._iat_readable = new Date(payload.iat * 1000).toLocaleString()
      setOut(JSON.stringify({ header: p(parts[0]), payload }, null, 2))
    } catch (e: any) { setOut('解析失败: ' + e.message) }
  }
  return (
    <GlassPanel title="JWT · 解码(不验签)">
      <div className="p-3 space-y-2">
        <textarea className="pt-input pt-mono text-xs" rows={2} placeholder="粘贴 token"
          value={jwt} onChange={e => setJwt(e.target.value)} />
        <button className="pt-btn pt-btn-primary" onClick={decode}>解码</button>
        {out && <pre className="pt-console p-2 text-[11px] overflow-auto max-h-64">{out}</pre>}
      </div>
    </GlassPanel>
  )
}

const TextTool: React.FC = () => {
  const [text, setText] = useState('')
  const op = (fn: (s: string) => string) => setText(fn(text))
  const stats = useMemo(() => {
    const lines = text ? text.split('\n').length : 0
    return { chars: text.length, bytes: new Blob([text]).size, lines }
  }, [text])
  return (
    <GlassPanel title="TEXT · 文本处理" subtitle={`${stats.chars} 字符 · ${stats.bytes} 字节 · ${stats.lines} 行`}>
      <div className="p-3 space-y-2">
        <textarea className="pt-input pt-mono text-xs" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="粘贴文本…" />
        <div className="flex flex-wrap gap-1.5">
          <button className="pt-btn" onClick={() => op(s => s.toUpperCase())}>大写</button>
          <button className="pt-btn" onClick={() => op(s => s.toLowerCase())}>小写</button>
          <button className="pt-btn" onClick={() => op(s => s.split('\n').map(l => l.trim()).join('\n'))}>去行首尾空格</button>
          <button className="pt-btn" onClick={() => op(s => [...new Set(s.split('\n'))].join('\n'))}>去重行</button>
          <button className="pt-btn" onClick={() => op(s => s.split('\n').sort().join('\n'))}>排序</button>
          <button className="pt-btn" onClick={() => op(s => s.split('').reverse().join(''))}>反转</button>
          <button className="pt-btn" onClick={() => { try { setText(JSON.stringify(JSON.parse(text), null, 2)) } catch { /* 非 JSON */ } }}>格式化 JSON</button>
          <button className="pt-btn" onClick={() => { try { setText(JSON.stringify(JSON.parse(text))) } catch { /* 非 JSON */ } }}>压缩 JSON</button>
        </div>
      </div>
    </GlassPanel>
  )
}

const MiscTools: React.FC = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <Timestamp />
    <TextTool />
    <UUIDGen />
    <ColorTool />
    <JWTDecode />
  </div>
)

export default Toolkit
