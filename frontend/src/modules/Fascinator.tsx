import React, { useEffect, useRef, useState } from 'react'
import GlassPanel from '@/components/GlassPanel'
import { api } from '@/lib/api'
import { EventsOn } from '@/wailsjs/runtime/runtime'
import {
  Play, Square, RotateCcw, Send, Settings as Cog, Activity, Zap, Network,
  Brain, Boxes, Ear, MessageSquare, Heart, RefreshCw, Trash2, Plus, Link2,
} from 'lucide-react'

/* Fascinator console — the full control surface for the cognitive backend.
 *
 * Every capability of the Flask API (~80 routes) is reachable from here:
 * graph CRUD, activation, diffusion, top-k, action queue, self model,
 * episodic buffer, memory approval, knowledge packs, ear/vision, chat log,
 * exploration learning and the runtime config.
 *
 * Raw endpoints go through api.fascinator.call(method, path, body).
 */

type Status = { running: boolean; pid?: number; port?: number; ping?: boolean; healthy?: boolean; adopted?: boolean }
type ParsedNLP = {
  nodes: string[]
  edges: { src: string; dst: string; relation: string }[]
  speech_act: string
}

const fas = (m: string, p: string, body?: any) => api.fascinator.call(m, p, body)

const TABS = [
  'console', 'graph', 'nlp', 'engine', 'actions', 'self',
  'memory', 'packs', 'sense', 'speak', 'body', 'chat', 'config',
] as const
type Tab = typeof TABS[number]

const TAB_LABEL: Record<Tab, string> = {
  console: 'CONSOLE', graph: 'GRAPH', nlp: 'NLP', engine: 'ENGINE',
  actions: 'ACTIONS', self: 'SELF', memory: 'MEMORY', packs: 'PACKS',
  sense: 'SENSE', speak: 'SPEAK', body: 'BODY', chat: 'CHAT', config: 'CONFIG',
}

export const Fascinator: React.FC = () => {
  const [status, setStatus] = useState<Status>({ running: false })
  const [logs, setLogs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('console')
  const [err, setErr] = useState('')

  // ── status polling ──
  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const s = await api.fascinator.status()
        if (alive) setStatus(s)
        const l = await api.fascinator.logs()
        if (alive && Array.isArray(l)) setLogs(l)
      } catch (_) {}
    }
    tick()
    const id = setInterval(tick, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr('')
    try { return await fn() } catch (e: any) { setErr(String(e?.message ?? e)); return null }
    finally { setBusy(false) }
  }

  const doStart = () => run(() => api.fascinator.start())
  const doStop = () => run(() => api.fascinator.stop())
  const doRestart = () => run(() => api.fascinator.restart())

  const dot = status.running
    ? <span className="pt-dot pt-dot-live" />
    : <span className="pt-dot pt-dot-idle" />

  const StatusBlob = (
    <div className="flex items-center gap-2 pt-mono text-xs text-text-mid">
      {dot}
      <span>{status.running ? (status.adopted ? 'ADOPTED · 外部实例' : 'RUNNING') : 'STOPPED'}</span>
      {status.running && !status.adopted && status.pid ? <><span className="text-text-lo">·</span><span>PID {status.pid}</span></> : null}
      {status.running && status.port ? <><span className="text-text-lo">·</span><span>:{status.port}</span></> : null}
    </div>
  )

  return (
    <div className="p-6 space-y-4 max-w-[1500px]">
      <GlassPanel
        title="FASCINATOR · 认知架构控制台"

        meta={StatusBlob}
        scanline
        actions={
          <div className="flex items-center gap-2">
            <button className="pt-btn pt-btn-primary" disabled={busy || status.running} onClick={doStart}>
              <Play size={13} /> 启动
            </button>
            <button className="pt-btn" disabled={busy || !status.running} onClick={doStop}>
              <Square size={13} /> 停止
            </button>
            <button className="pt-btn pt-btn-ghost" disabled={busy} onClick={doRestart}>
              <RotateCcw size={13} /> 重启
            </button>
          </div>
        }
      >
      </GlassPanel>

      {err && <div className="pt-glass p-3 text-xs text-sig-error pt-mono border-sig-error">{err}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'pt-section-label px-3 py-2 transition-colors',
              tab === t ? 'text-accent' : 'text-text-lo hover:text-text-mid',
            ].join(' ')}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'console' && <ConsoleTab status={status} logs={logs} />}
      {tab === 'graph' && <GraphTab running={status.running} />}
      {tab === 'nlp' && <NLPTab running={status.running} />}
      {tab === 'engine' && <EngineTab running={status.running} />}
      {tab === 'actions' && <ActionsTab running={status.running} />}
      {tab === 'self' && <SelfTab running={status.running} />}
      {tab === 'memory' && <MemoryTab running={status.running} />}
      {tab === 'packs' && <PacksTab running={status.running} />}
      {tab === 'sense' && <SenseTab running={status.running} />}
      {tab === 'speak' && <SpeakTab running={status.running} />}
      {tab === 'body' && <BodyTab running={status.running} />}
      {tab === 'chat' && <ChatTab running={status.running} />}
      {tab === 'config' && <ConfigTab />}
    </div>
  )
}

/* ── shared bits ──────────────────────────────────────────────────── */

const Tile: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="border border-edge px-3 py-3">
    <div className="pt-section-label text-text-lo">{label}</div>
    <div className={['pt-display text-2xl mt-1 pt-mono', accent ? 'text-accent' : 'text-text-hi'].join(' ')}>{value}</div>
  </div>
)

const Panel: React.FC<{ label: string; children: React.ReactNode; meta?: React.ReactNode }> = ({ label, children, meta }) => (
  <div className="border border-edge p-3">
    <div className="flex items-center justify-between mb-3">
      <span className="pt-section-label text-text-lo">{label}</span>
      {meta}
    </div>
    {children}
  </div>
)

const KV: React.FC<{ k: string; v: any }> = ({ k, v }) => (
  <div className="flex items-baseline justify-between gap-3 py-1 border-b border-edge/50">
    <span className="text-xs text-text-lo">{k}</span>
    <span className="pt-mono text-xs text-text-mid truncate max-w-[70%]">{String(v ?? '—')}</span>
  </div>
)

const needRun = (running: boolean) =>
  !running ? <div className="pt-glass p-4 text-xs text-sig-warn pt-mono">需要先启动 Fascinator 后端进程</div> : null

/* ── CONSOLE ──────────────────────────────────────────────────────── */

const ConsoleTab: React.FC<{ status: Status; logs: string[] }> = ({ status, logs }) => {
  const logRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])
  const [stats, setStats] = useState<any>(null)
  useEffect(() => {
    if (!status.running) return
    fas('GET', '/api/evolution/stats').then(setStats).catch(() => {})
    fas('GET', '/api/llm/status').then(() => {}).catch(() => {})
  }, [status.running])

  return (
    <div className="space-y-3">
      {status.running && (
        <div className="grid grid-cols-4 gap-3">
          <Tile label="STATE" value="LIVE" accent />
          <Tile label="PING" value={status.ping ? 'OK' : '—'} accent={!!status.ping} />
          <Tile label="NODES" value={String(stats?.total_nodes ?? '—')} />
          <Tile label="EDGES" value={String(stats?.total_edges ?? '—')} />
        </div>
      )}
      <GlassPanel title="LOG STREAM" subtitle="进程标准输出 / 错误输出实时尾随">
        <div ref={logRef} className="pt-console mt-3 h-[420px] overflow-auto text-[12px] leading-relaxed p-3">
          {logs.length === 0
            ? <div className="text-[#888]">无日志输出 · 启动 Fascinator 后这里将实时滚动</div>
            : logs.map((l, i) => (
                <div key={i} className={l.includes('ERROR') ? 'text-[#ff8a80]' : 'text-[#c8c8c8]'}>{l}</div>
              ))}
        </div>
      </GlassPanel>
    </div>
  )
}

/* ── GRAPH — SVG force layout + node/edge CRUD ────────────────────── */

type GNode = { id: string; label?: string; weight?: number; activation?: number; confidence?: number; graph_space?: string; x?: number; y?: number }
type GEdge = { src?: string; dst?: string; source?: string; target?: string; relation?: string; weight?: number }

const GraphTab: React.FC<{ running: boolean }> = ({ running }) => {
  const [nodes, setNodes] = useState<GNode[]>([])
  const [edges, setEdges] = useState<GEdge[]>([])
  const [selected, setSelected] = useState<GNode | null>(null)
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const [newNode, setNewNode] = useState({ id: '', label: 'declarative-semantic', weight: 0.5 })
  const [relation, setRelation] = useState('related_to')
  const [filter, setFilter] = useState('')
  const [tk, setTk] = useState<any[]>([])
  const [th, setTh] = useState(0.1)
  const thRef = useRef(0.1)
  thRef.current = th
  const svgRef = useRef<SVGSVGElement | null>(null)
  const W = 960, H = 600

  const load = async () => {
    const [r, tkr] = await Promise.all([
      fas('GET', `/api/graph?threshold=${thRef.current}`),
      fas('GET', '/api/topk'),
    ])
    setTk(tkr?.nodes ?? [])
    if (!r) return
    const ns: GNode[] = (r.nodes ?? []).slice(0, 400)
    const es: GEdge[] = (r.edges ?? []).slice(0, 900)
    // seed positions on a circle, then a few force iterations
    const n = Math.max(ns.length, 1)
    ns.forEach((nd, i) => {
      const a = (i / n) * Math.PI * 2
      nd.x = W / 2 + Math.cos(a) * (W / 3)
      nd.y = H / 2 + Math.sin(a) * (H / 3)
    })
    const idx = new Map(ns.map((nd, i) => [nd.id, i]))
    for (let it = 0; it < 80; it++) {
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j]
          let dx = b.x! - a.x!, dy = b.y! - a.y!
          let d2 = dx * dx + dy * dy || 1
          if (d2 < 160 * 160) {
            const f = 2400 / d2
            dx /= Math.sqrt(d2); dy /= Math.sqrt(d2)
            a.x! -= dx * f; a.y! -= dy * f
            b.x! += dx * f; b.y! += dy * f
          }
        }
      }
      for (const e of es) {
        const s = idx.get(e.src ?? e.source ?? ''), t = idx.get(e.dst ?? e.target ?? '')
        if (s === undefined || t === undefined) continue
        const a = ns[s], b = ns[t]
        const dx = b.x! - a.x!, dy = b.y! - a.y!
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (d - 110) * 0.02
        const ux = dx / d, uy = dy / d
        a.x! += ux * f; a.y! += uy * f
        b.x! -= ux * f; b.y! -= uy * f
      }
      for (const nd of ns) {
        nd.x! += (W / 2 - nd.x!) * 0.005
        nd.y! += (H / 2 - nd.y!) * 0.005
        nd.x = Math.max(30, Math.min(W - 30, nd.x!))
        nd.y = Math.max(30, Math.min(H - 30, nd.y!))
      }
    }
    setNodes([...ns])
    setEdges([...es])
  }

  useEffect(() => { if (running) load() }, [running])

  const addNode = async () => {
    if (!newNode.id.trim()) return
    const ok = await fas('POST', '/api/nodes', {
      id: newNode.id.trim(), label: newNode.label, weight: Number(newNode.weight),
    })
    if (ok !== null) { setNewNode({ id: '', label: 'declarative-semantic', weight: 0.5 }); load() }
  }

  const updateSelected = async (patch: any) => {
    if (!selected) return
    const ok = await fas('PUT', `/api/nodes/${encodeURIComponent(selected.id)}`, patch)
    if (ok !== null) { setSelected({ ...selected, ...patch }); load() }
  }

  const deleteSelected = async () => {
    if (!selected) return
    const ok = await fas('DELETE', `/api/nodes/${encodeURIComponent(selected.id)}`)
    if (ok !== null) { setSelected(null); load() }
  }

  const onNodeClick = async (nd: GNode) => {
    if (linkFrom && linkFrom !== nd.id) {
      const ok = await fas('POST', '/api/edges', { src: linkFrom, dst: nd.id, relation })
      if (ok !== null) { setLinkFrom(null); load() }
      return
    }
    if (linkFrom === nd.id) { setLinkFrom(null); return }
    setSelected(nd)
  }

  const shown = nodes.filter(n =>
    (Number(n.activation ?? 0) >= th || selected?.id === n.id)
    && (!filter || n.id.toLowerCase().includes(filter.toLowerCase())))
  const shownIds = new Set(shown.map(n => n.id))

  if (!running) return <>{needRun(running)}</>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="pt-btn pt-btn-ghost" onClick={load}><RefreshCw size={12} /> REFRESH</button>
        <input
          className="pt-input pt-mono text-xs w-44"
          placeholder="过滤节点 id…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <button
          className={['pt-btn', linkFrom ? 'pt-btn-primary' : 'pt-btn-ghost'].join(' ')}
          onClick={() => setLinkFrom(linkFrom ? null : (selected?.id ?? null))}
        >
          <Link2 size={12} /> {linkFrom ? `连线中：${linkFrom} → 点击目标` : '连线模式'}
        </button>
        <select className="pt-input pt-mono text-xs w-36" value={relation} onChange={e => setRelation(e.target.value)}>
          {['related_to', 'causes', 'part_of', 'is_a', 'used_for', 'located_at'].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <span className="text-xs text-text-lo pt-mono">{shown.length} nodes · {edges.length} edges</span>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-3">
        <div className="border border-edge pt-dotmatrix bg-surface overflow-hidden relative">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 600 }}>
            {edges.map((e, i) => {
              const s = nodes.find(n => n.id === (e.src ?? e.source))
              const t = nodes.find(n => n.id === (e.dst ?? e.target))
              if (!s || !t || !shownIds.has(s.id) || !shownIds.has(t.id)) return null
              return (
                <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke="rgba(0,0,0,0.15)" strokeWidth={0.8} />
              )
            })}
            {shown.map(n => {
              const act = Math.min(1, Number(n.activation ?? 0) / 5)
              const r = 5 + Math.abs(Number(n.weight ?? 0)) * 6
              const isSel = selected?.id === n.id
              return (
                <g key={n.id} onClick={() => onNodeClick(n)} style={{ cursor: 'pointer' }}>
                  <circle cx={n.x} cy={n.y} r={r + (act > 0.05 ? 4 * act : 0)}
                    fill={act > 0.05 ? `rgba(255,107,0,${0.25 + act * 0.7})` : 'rgba(0,0,0,0.2)'}
                    stroke={isSel ? '#009a9b' : 'rgba(0,0,0,0.3)'} strokeWidth={isSel ? 2 : 1} />
                  {(act > 0.05 || isSel) && (
                    <text x={n.x} y={n.y - r - 6} textAnchor="middle" fontSize={10}
                      fill={isSel ? '#009a9b' : 'rgba(0,0,0,0.65)'} className="pt-mono">
                      {n.id.length > 16 ? n.id.slice(0, 15) + '…' : n.id}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        <div className="space-y-3">
          <Panel label="NOW ACTIVE · 当前活跃" meta={<span className="pt-mono text-[10px] text-text-lo">激活≥阈值</span>}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="pt-mono text-[10px] text-text-lo">阈值</span>
              <input type="number" step="0.05" min="0" value={th}
                onChange={e => setTh(Math.max(0, Number(e.target.value) || 0))}
                className="pt-input w-16 pt-mono text-xs" />
              <span className="pt-mono text-[10px] text-text-lo ml-auto">
                {tk.filter(n => Number(n.activation ?? 0) >= th).length} 个</span>
            </div>
            <div className="space-y-1 max-h-[360px] overflow-auto">
              {tk.filter(n => Number(n.activation ?? 0) >= th)
                .sort((a, b) => Number(b.activation ?? 0) - Number(a.activation ?? 0))
                .map(n => (
                <button key={String(n.id)}
                  onClick={() => { const hit = nodes.find(x => x.id === n.id); if (hit) setSelected(hit) }}
                  className="w-full flex items-center gap-2 border border-edge px-2 py-1 text-left hover:border-accent/60">
                  <span className="truncate text-xs flex-1 min-w-0">{String(n.id)}</span>
                  <span className="w-14 h-1 bg-edge rounded relative shrink-0">
                    <span className="absolute inset-y-0 left-0 bg-accent rounded"
                      style={{ width: `${Math.min(100, Number(n.activation ?? 0) * 20)}%` }} />
                  </span>
                  <span className="pt-mono text-[10px] text-accent w-10 text-right shrink-0">
                    {Number(n.activation ?? 0).toFixed(2)}</span>
                </button>
              ))}
              {tk.filter(n => Number(n.activation ?? 0) >= th).length === 0 && (
                <div className="text-xs text-text-lo">此刻没有超过阈值的节点。</div>)}
            </div>
            <div className="text-[10px] text-text-lo mt-1">2.5s 自动刷新 · 点击定位图上节点</div>
          </Panel>
          <Panel label="ADD NODE">
            <div className="space-y-2">
              <input className="pt-input w-full pt-mono text-xs" placeholder="节点 ID（如 图书馆）"
                value={newNode.id} onChange={e => setNewNode({ ...newNode, id: e.target.value })} />
              <div className="flex gap-2">
                <input className="pt-input flex-1 pt-mono text-xs" placeholder="label"
                  value={newNode.label} onChange={e => setNewNode({ ...newNode, label: e.target.value })} />
                <input className="pt-input w-20 pt-mono text-xs" placeholder="w"
                  value={newNode.weight} onChange={e => setNewNode({ ...newNode, weight: Number(e.target.value) || 0 })} />
              </div>
              <button className="pt-btn pt-btn-primary w-full" onClick={addNode}><Plus size={12} /> CREATE</button>
            </div>
          </Panel>

          {selected ? (
            <Panel label="NODE DETAIL" meta={
              <button className="text-sig-error hover:text-red-400" onClick={deleteSelected}>
                <Trash2 size={13} />
              </button>
            }>
              <div className="space-y-1">
                <KV k="id" v={selected.id} />
                <KV k="label" v={selected.label} />
                <KV k="space" v={selected.graph_space} />
                <KV k="weight" v={Number(selected.weight ?? 0).toFixed(2)} />
                <KV k="activation" v={Number(selected.activation ?? 0).toFixed(4)} />
                <KV k="confidence" v={Number(selected.confidence ?? 0).toFixed(2)} />
              </div>
              <div className="flex gap-2 mt-3">
                <button className="pt-btn pt-btn-ghost flex-1 text-xs"
                  onClick={() => updateSelected({ weight: Number(selected.weight ?? 0) + 0.2 })}>w+0.2</button>
                <button className="pt-btn pt-btn-primary flex-1 text-xs"
                  onClick={() => fas('POST', '/api/activate', { node_id: selected.id, strength: 1.0 }).then(load)}>
                  <Zap size={12} /> ACTIVATE
                </button>
              </div>
            </Panel>
          ) : (
            <div className="border border-edge p-3 text-xs text-text-lo">点击画布中的节点查看详情 · 高亮青色 = 激活中</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── NLP ──────────────────────────────────────────────────────────── */

const NLPTab: React.FC<{ running: boolean }> = ({ running }) => {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<ParsedNLP | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (!input.trim()) return
    setBusy(true)
    try {
      const res = await api.fascinator.nlp(input)
      setResult(res?.parsed ?? null)
      setInput('')
    } finally { setBusy(false) }
  }

  return (
    <GlassPanel title="NATURAL LANGUAGE INPUT" subtitle="中文句子 → 解析 → 图谱激活 → 言语行为分类">
      <div className="flex items-start gap-3 mt-3">
        <textarea
          className="pt-input flex-1 min-h-[100px] resize-y"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="例如：明天早上九点带笔记本去图书馆背单词。"
          disabled={!running}
        />
        <button className="pt-btn pt-btn-primary self-stretch px-5" disabled={busy || !running || !input.trim()} onClick={send}>
          <Send size={14} /> SEND
        </button>
      </div>
      {!running && <div className="mt-2 text-xs text-sig-warn pt-mono">需要先启动 Fascinator 后端进程</div>}
      {result && (
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Panel label={`NODES ×${result.nodes.length}`}>
            <div className="space-y-1 max-h-[200px] overflow-auto">
              {result.nodes.map((n, i) => <div key={i} className="pt-chip">{n}</div>)}
            </div>
          </Panel>
          <Panel label={`EDGES ×${result.edges.length}`}>
            <div className="space-y-1 max-h-[200px] overflow-auto pt-mono text-[11px]">
              {result.edges.map((e, i) => (
                <div key={i} className="text-text-mid">
                  <span className="text-accent">{e.src}</span>
                  <span className="text-text-lo"> ─[{e.relation}]→ </span>
                  <span className="text-accent">{e.dst}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel label="SPEECH·ACT">
            <div className="text-xl pt-display text-accent">{result.speech_act}</div>
            <div className="text-xs text-text-lo mt-2">基于 Searle 言语行为五分类</div>
          </Panel>
        </div>
      )}
    </GlassPanel>
  )
}

/* ── ENGINE — diffusion control + top-k ───────────────────────────── */

const EngineTab: React.FC<{ running: boolean }> = ({ running }) => {
  const [status, setStatus] = useState<any>(null)
  const [topk, setTopk] = useState<any>(null)
  const [queue, setQueue] = useState<any[]>([])

  const load = async () => {
    const [s, t, q] = await Promise.all([
      fas('GET', '/api/diffuse/status'),
      fas('GET', '/api/topk'),
      fas('GET', '/api/actions/queue'),
    ])
    if (s) setStatus(s)
    if (t) setTopk(t)
    if (q) setQueue(q?.queue ?? [])
  }
  useEffect(() => { if (running) load() }, [running])
  useEffect(() => {
    if (!running) return
    const id = setInterval(load, 2500)
    return () => clearInterval(id)
  }, [running])

  if (!running) return <>{needRun(running)}</>

  const act = async () => { await fas('POST', '/api/diffuse/step'); load() }
  const round = async () => { await fas('POST', '/api/diffuse/round'); load() }
  const start = async () => { await fas('POST', '/api/diffuse/start'); load() }
  const stop = async () => { await fas('POST', '/api/diffuse/stop'); load() }
  const reset = async () => { await fas('POST', '/api/activate/reset'); load() }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <Tile label="AUTO" value={status?.running ? 'ON' : 'OFF'} accent={!!status?.running} />
        <Tile label="CYCLE" value={String(status?.cycle ?? status?.cycles ?? '—')} />
        <Tile label="TOP·K" value={String(topk?.nodes?.length ?? 0)} />
        <Tile label="QUEUE" value={String(queue.length)} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button className="pt-btn pt-btn-primary" onClick={act}><Zap size={12} /> STEP</button>
        <button className="pt-btn" onClick={round}><RefreshCw size={12} /> ROUND</button>
        <button className="pt-btn" onClick={start}><Play size={12} /> AUTO·START</button>
        <button className="pt-btn" onClick={stop}><Square size={12} /> AUTO·STOP</button>
        <button className="pt-btn pt-btn-ghost" onClick={reset}><RotateCcw size={12} /> RESET 激活</button>
        <button className="pt-btn pt-btn-ghost" onClick={load}><Activity size={12} /> REFRESH</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Panel label="TOP-K NODES" meta={<span className="pt-mono text-[10px] text-text-lo">按激活度</span>}>
          <div className="space-y-1 max-h-[440px] overflow-auto">
            {topk?.nodes?.length ? topk.nodes.map((n: any, i: number) => (
              <div key={i} className="flex items-center justify-between border border-edge px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-text-lo pt-mono text-[10px]">#{String(i + 1).padStart(2, '0')}</span>
                  <span className="truncate">{n.id}</span>
                </div>
                <div className="flex items-center gap-3 pt-mono text-xs">
                  <span className="text-text-lo">w={Number(n.weight).toFixed(2)}</span>
                  <span className="text-accent">a={Number(n.activation).toFixed(3)}</span>
                </div>
              </div>
            )) : <div className="text-text-lo">无激活节点。</div>}
          </div>
        </Panel>
        <Panel label="ACTION QUEUE" meta={<span className="pt-mono text-[10px] text-text-lo">程序性记忆</span>}>
          <div className="space-y-1 max-h-[440px] overflow-auto">
            {queue.length ? queue.map((a: any, i: number) => (
              <div key={i} className="flex items-center justify-between border border-edge px-3 py-2">
                <span className="truncate">{a.node_id}</span>
                <div className="flex items-center gap-3">
                  <span className="pt-mono text-xs text-accent">a={Number(a.activation).toFixed(3)}</span>
                  <button className="pt-btn pt-btn-primary"
                    onClick={async () => { await api.fascinator.executeAction(a.node_id); load() }}>EXEC</button>
                </div>
              </div>
            )) : <div className="text-text-lo">行动队列为空。</div>}
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ── ACTIONS — capabilities / intents / state / log ───────────────── */

const ActionsTab: React.FC<{ running: boolean }> = ({ running }) => {
  const [caps, setCaps] = useState<any[]>([])
  const [intents, setIntents] = useState<any[]>([])
  const [state, setState] = useState<any>(null)
  const [log, setLog] = useState<any[]>([])
  const [registered, setRegistered] = useState<any[]>([])
  // 动作窗口实时化（2026-10-21）：桥事件 fas.action + 2.5s 兜底轮询。
  const [live, setLive] = useState<any | null>(null)

  const load = async () => {
    const [c, i, s, l, r] = await Promise.all([
      fas('GET', '/api/action/capabilities'),
      fas('GET', '/api/action/intents'),
      fas('GET', '/api/action/state'),
      fas('GET', '/api/actions/log'),
      fas('GET', '/api/actions/registered'),
    ])
    if (c) setCaps(c.items ?? c.capabilities ?? c ?? [])
    if (i) setIntents(i.items ?? i.intents ?? i ?? [])
    if (s) setState(s)
    if (l) setLog(l.items ?? l.log ?? l ?? [])
    if (r) setRegistered(r.items ?? r.actions ?? r ?? [])
  }
  useEffect(() => {
    if (!running) return
    load()
    // 实时动作窗（2026-10-21）：2.5s 轮询兜底 + fas.action 桥事件即时刷新
    const t = setInterval(load, 2500)
    const off = EventsOn('fas.action', (data: any) => {
      const p = Array.isArray(data) ? data[0] : data
      if (!p) return
      setLive(p)
      if (p.kind === 'settle') {
        setLog(l => [p, ...l.filter(x => !(x?.ts === p.ts && x?.action === p.action))].slice(0, 120))
      }
    })
    return () => { clearInterval(t); off?.() }
  }, [running])

  if (!running) return <>{needRun(running)}</>

  return (
    <div className="grid grid-cols-2 gap-3">
      <Panel label="CAPABILITIES" meta={<button className="pt-btn pt-btn-ghost" onClick={load}><RefreshCw size={12} /></button>}>
        <div className="space-y-1 max-h-56 overflow-auto text-xs pt-mono text-text-mid">
          {caps.length ? caps.map((c: any, i) => (
            <div key={i} className="border border-edge px-2 py-1">{typeof c === 'string' ? c : JSON.stringify(c)}</div>
          )) : <div className="text-text-lo">无</div>}
        </div>
      </Panel>
      <Panel label="INTENTS">
        <div className="space-y-1 max-h-56 overflow-auto text-xs pt-mono text-text-mid">
          {intents.length ? intents.map((c: any, i) => (
            <div key={i} className="border border-edge px-2 py-1">{typeof c === 'string' ? c : JSON.stringify(c)}</div>
          )) : <div className="text-text-lo">无</div>}
        </div>
      </Panel>
      <Panel label="REGISTERED ACTIONS">
        <div className="space-y-1 max-h-56 overflow-auto text-xs pt-mono text-text-mid">
          {registered.length ? registered.map((c: any, i) => (
            <div key={i} className="border border-edge px-2 py-1">{typeof c === 'string' ? c : JSON.stringify(c)}</div>
          )) : <div className="text-text-lo">无</div>}
        </div>
      </Panel>
      <Panel label="NOW — 她正在做什么">
        {(() => {
          const a = state?.action ?? state
          const cur = a?.current
          return (
            <div className="text-xs pt-mono space-y-1">
              {cur ? (
                <div className="text-accent">
                  正在：{String(cur.action_type ?? cur.action ?? '?')}
                  {cur.target ? ` → ${cur.target}` : ''}
                  <span className="text-text-lo">（已 {a.current_elapsed_s ?? 0}s）</span>
                </div>
              ) : <div className="text-text-lo">当前空闲</div>}
              {Array.isArray(a?.goal_queue) && a.goal_queue.length > 0 && (
                <div className="text-text-mid">队列：{a.goal_queue.map((g: any) => g.action_type ?? g).slice(0, 6).join(' → ')}</div>
              )}
              {live?.kind === 'start' && (
                <div className="text-text-mid">刚刚接到：{live.action}{live.target ? ` → ${live.target}` : ''}</div>
              )}
              {a?.stats && (
                <div className="text-text-lo">
                  累计 ✓{a.stats.success ?? 0} ✗{a.stats.failed ?? 0} 打断{a.stats.interrupted ?? a.stats.cancelled ?? 0}
                </div>
              )}
            </div>
          )
        })()}
      </Panel>
      <div className="col-span-2">
        <Panel label="ACTION LOG — 历史动作序列" meta={<span className="text-[10px] text-text-lo">事件即时 + 2.5s 轮询 · FAS 侧已落盘 data/action_history.jsonl</span>}>
          <div className="space-y-1 max-h-64 overflow-auto text-xs pt-mono">
            {log.length ? log.map((l: any, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-edge/50 py-1">
                <span className="text-text-lo w-14 shrink-0">{String(l.ts ?? '').slice(11, 19)}</span>
                <span className={l.success ? 'text-accent' : 'text-red-400'}>{l.success ? '✓' : '✗'}</span>
                <span className="text-text-mid">{String(l.action ?? '?')}{l.target ? ` → ${l.target}` : ''}</span>
                {!!l.reason && <span className="text-text-lo truncate max-w-40">{l.reason}</span>}
                {typeof l.duration_s === 'number' && <span className="text-text-lo ml-auto shrink-0">{l.duration_s}s</span>}
              </div>
            )) : <div className="text-text-lo">暂无执行记录</div>}
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ── SELF — the self model ────────────────────────────────────────── */

const SelfTab: React.FC<{ running: boolean }> = ({ running }) => {
  const [emotion, setEmotion] = useState<any>(null)
  const [prefs, setPrefs] = useState<any>(null)
  const [goals, setGoals] = useState<any>(null)
  const [beliefs, setBeliefs] = useState<any>(null)
  const [dispositions, setDispositions] = useState<any>(null)
  const [candidates, setCandidates] = useState<any[]>([])
  const [thought, setThought] = useState('')

  const load = async () => {
    const [e, p, g, b, d, c] = await Promise.all([
      fas('GET', '/api/self/emotion/current'),
      fas('GET', '/api/self/preferences'),
      fas('GET', '/api/self/goals'),
      fas('GET', '/api/self/model/beliefs'),
      fas('GET', '/api/self/dispositions'),
      fas('GET', '/api/self/reflection/candidates'),
    ])
    if (e) setEmotion(e)
    if (p) setPrefs(p)
    if (g) setGoals(g)
    if (b) setBeliefs(b)
    if (d) setDispositions(d)
    if (c) setCandidates(c.items ?? c.candidates ?? c ?? [])
  }
  useEffect(() => { if (running) load() }, [running])

  if (!running) return <>{needRun(running)}</>

  const sendThought = async () => {
    if (!thought.trim()) return
    await fas('POST', '/api/self/thought', { text: thought })
    setThought('')
    load()
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Panel label="EMOTION" meta={<Heart size={12} className="text-accent" />}>
          <div className="text-xl pt-display text-accent">{emotion?.emotion ?? emotion?.name ?? '—'}</div>
          {emotion?.intensity !== undefined && <KV k="intensity" v={Number(emotion.intensity).toFixed(2)} />}
        </Panel>
        <Panel label="GOALS">
          <div className="space-y-1 max-h-40 overflow-auto text-xs">
            {goals?.goals?.length ? goals.goals.map((g: any, i: number) => (
              <div key={i} className="border border-edge px-2 py-1">{typeof g === 'string' ? g : (g.text ?? g.description ?? JSON.stringify(g))}</div>
            )) : <div className="text-text-lo">无目标</div>}
          </div>
        </Panel>
        <Panel label="PREFERENCES">
          <div className="space-y-1 max-h-40 overflow-auto text-xs">
            {(prefs?.preferences && Object.entries(prefs.preferences).length > 0)
              ? Object.entries(prefs.preferences).map(([k, v]: any, i) => (
                  <div key={i} className="flex justify-between border border-edge px-2 py-1">
                    <span>{k}</span><span className="pt-mono text-accent">{Number(v).toFixed(2)}</span>
                  </div>
                ))
              : <div className="text-text-lo">无偏好数据</div>}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Panel label="SELF·DIFFUSE" meta={
          <button className="pt-btn pt-btn-ghost"
            onClick={async () => { const r = await fas('POST', '/api/self/diffuse', { query: '自我状态' }); if (r) alert(JSON.stringify(r, null, 2)) }}>
            <Network size={12} /> RUN
          </button>
        }>
          <div className="text-xs text-text-mid leading-relaxed">
            以自我模型为中心跑一次扩散，返回与当前自我最相关的记忆节点（结果弹窗展示）。
          </div>
        </Panel>
        <Panel label="THOUGHT">
          <div className="flex gap-2">
            <input className="pt-input flex-1 pt-mono text-xs" placeholder="向自我注入一条想法…"
              value={thought} onChange={e => setThought(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendThought()} />
            <button className="pt-btn pt-btn-primary" onClick={sendThought}><Send size={12} /></button>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Panel label="BELIEFS">
          <pre className="text-[11px] pt-mono text-text-mid max-h-56 overflow-auto whitespace-pre-wrap">
            {beliefs ? JSON.stringify(beliefs, null, 2) : '—'}
          </pre>
        </Panel>
        <Panel label="DISPOSITIONS">
          <pre className="text-[11px] pt-mono text-text-mid max-h-56 overflow-auto whitespace-pre-wrap">
            {dispositions ? JSON.stringify(dispositions, null, 2) : '—'}
          </pre>
        </Panel>
      </div>

      <Panel label={`REFLECTION CANDIDATES ×${candidates.length}`} meta={
        <button className="pt-btn pt-btn-ghost" onClick={load}><RefreshCw size={12} /></button>
      }>
        <div className="space-y-1 max-h-56 overflow-auto">
          {candidates.length ? candidates.map((c: any, i) => (
            <div key={i} className="flex items-center justify-between border border-edge px-3 py-2 text-xs">
              <span className="truncate">{typeof c === 'string' ? c : (c.text ?? c.content ?? JSON.stringify(c))}</span>
              <button className="pt-btn pt-btn-primary text-xs"
                onClick={async () => { await fas('POST', '/api/self/reflection/approve', { id: c.id ?? i, candidate: c }); load() }}>
                APPROVE
              </button>
            </div>
          )) : <div className="text-text-lo text-xs">无待反思条目</div>}
        </div>
      </Panel>
    </div>
  )
}

/* ── MEMORY — episodic buffer + NLP logs + approve ────────────────── */

const MemoryTab: React.FC<{ running: boolean }> = ({ running }) => {
  const [buffer, setBuffer] = useState<any[]>([])
  const [nlpLogs, setNlpLogs] = useState<any[]>([])

  const load = async () => {
    const [b, l] = await Promise.all([fas('GET', '/api/buffer'), fas('GET', '/api/nlp/logs')])
    if (b) setBuffer(b.items ?? b.buffer ?? b ?? [])
    if (l) setNlpLogs(l.items ?? l.logs ?? l ?? [])
  }
  useEffect(() => { if (running) load() }, [running])

  if (!running) return <>{needRun(running)}</>

  return (
    <div className="grid grid-cols-2 gap-3">
      <Panel label="EPISODIC BUFFER" meta={
        <div className="flex gap-2">
          <button className="pt-btn pt-btn-ghost" onClick={load}><RefreshCw size={12} /></button>
          <button className="pt-btn pt-btn-ghost"
            onClick={async () => { await fas('POST', '/api/buffer/clear'); load() }}><Trash2 size={12} /></button>
        </div>
      }>
        <div className="space-y-1 max-h-[420px] overflow-auto">
          {buffer.length ? buffer.map((b: any, i) => (
            <div key={i} className="border border-edge px-3 py-2">
              <div className="text-xs text-text-mid">{typeof b === 'string' ? b : (b.text ?? b.content ?? JSON.stringify(b))}</div>
              <div className="flex gap-2 mt-1">
                <button className="pt-btn pt-btn-primary text-[10px]"
                  onClick={async () => { await fas('POST', '/api/buffer/promote', { id: b.id ?? i, item: b }); load() }}>
                  PROMOTE 入图谱
                </button>
              </div>
            </div>
          )) : <div className="text-text-lo text-xs">情景缓冲区为空</div>}
        </div>
      </Panel>
      <Panel label="NLP LOGS">
        <div className="space-y-1 max-h-[420px] overflow-auto text-xs pt-mono">
          {nlpLogs.length ? nlpLogs.map((l: any, i) => (
            <div key={i} className="text-text-mid border-b border-edge/50 pb-1">
              {typeof l === 'string' ? l : JSON.stringify(l)}
            </div>
          )) : <div className="text-text-lo">无解析记录</div>}
        </div>
      </Panel>
    </div>
  )
}

/* ── PACKS — knowledge packs ──────────────────────────────────────── */

const PacksTab: React.FC<{ running: boolean }> = ({ running }) => {
  const [packs, setPacks] = useState<any[]>([])
  const [name, setName] = useState('')

  const load = async () => {
    const r = await fas('GET', '/api/packs')
    if (r) setPacks(r.items ?? r.packs ?? r ?? [])
  }
  useEffect(() => { if (running) load() }, [running])

  if (!running) return <>{needRun(running)}</>

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <input className="pt-input pt-mono text-xs w-56" placeholder="新知识包名称"
          value={name} onChange={e => setName(e.target.value)} />
        <button className="pt-btn pt-btn-primary"
          onClick={async () => {
            if (!name.trim()) return
            await fas('POST', '/api/packs/create', { name })
            setName(''); load()
          }}><Plus size={12} /> CREATE</button>
        <button className="pt-btn pt-btn-ghost" onClick={async () => { await fas('POST', '/api/packs/reload'); load() }}>
          <Boxes size={12} /> RELOAD ALL
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {packs.length ? packs.map((p: any, i) => {
          const pid = p.id ?? p.name ?? String(i)
          const enabled = p.enabled ?? false
          return (
            <div key={i} className="border border-edge p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="pt-mono text-sm text-text-hi">{p.name ?? p.id}</span>
                <span className={['pt-chip', enabled ? 'text-accent border-accent' : 'text-text-lo'].join(' ')}>
                  {enabled ? 'ON' : 'OFF'}
                </span>
              </div>
              {p.description && <div className="text-xs text-text-lo line-clamp-2">{p.description}</div>}
              <div className="flex items-center justify-between text-xs text-text-lo pt-mono">
                <span>{p.nodes ?? '—'} nodes</span>
                <span>{p.edges ?? '—'} edges</span>
              </div>
              <div className="flex gap-2">
                <button className="pt-btn pt-btn-ghost flex-1 text-xs"
                  onClick={async () => { await fas('POST', '/api/packs/' + (enabled ? 'disable' : 'enable'), { id: pid, name: p.name }); load() }}>
                  {enabled ? 'DISABLE' : 'ENABLE'}
                </button>
                <button className="pt-btn pt-btn-ghost text-xs text-sig-error"
                  onClick={async () => { await fas('POST', '/api/packs/delete', { id: pid, name: p.name }); load() }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          )
        }) : <div className="text-text-lo text-xs col-span-3">无知识包</div>}
      </div>
    </div>
  )
}

/* ── SENSE — ear & vision channels ────────────────────────────────── */

const SenseTab: React.FC<{ running: boolean }> = ({ running }) => {
  const [ear, setEar] = useState<any>(null)
  const [vision, setVision] = useState<any>(null)
  const [objects, setObjects] = useState<any[]>([])
  const [earText, setEarText] = useState('')

  const load = async () => {
    const [e, v, o] = await Promise.all([
      fas('GET', '/api/ear/status'), fas('GET', '/api/vision/status'), fas('GET', '/api/vision/objects'),
    ])
    if (e) setEar(e)
    if (v) setVision(v)
    if (o) setObjects(o.items ?? o.objects ?? o ?? [])
  }
  useEffect(() => { if (running) load() }, [running])

  if (!running) return <>{needRun(running)}</>

  const earEnabled = ear?.enabled ?? ear?.active ?? false
  const visionEnabled = vision?.enabled ?? vision?.active ?? false

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Panel label="EAR · 听觉通道" meta={<Ear size={12} className="text-accent" />}>
          <div className="flex items-center gap-3">
            <span className={['pt-chip', earEnabled ? 'text-accent border-accent' : ''].join(' ')}>
              {earEnabled ? 'ENABLED' : 'DISABLED'}
            </span>
            <button className="pt-btn pt-btn-ghost text-xs"
              onClick={async () => { await fas('POST', earEnabled ? '/api/ear/disable' : '/api/ear/enable'); load() }}>
              {earEnabled ? '关闭' : '开启'}
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <input className="pt-input flex-1 pt-mono text-xs" placeholder="手动送一段文本进听觉流…"
              value={earText} onChange={e => setEarText(e.target.value)} />
            <button className="pt-btn pt-btn-primary text-xs"
              onClick={async () => {
                if (!earText.trim()) return
                const r = await fas('POST', '/api/ear/process', { text: earText })
                if (r !== null) { setEarText(''); alert(JSON.stringify(r, null, 2)) }
              }}>PROCESS</button>
          </div>
        </Panel>
        <Panel label="VISION · 视觉通道" meta={<Brain size={12} className="text-accent" />}>
          <div className="flex items-center gap-3">
            <span className={['pt-chip', visionEnabled ? 'text-accent border-accent' : ''].join(' ')}>
              {visionEnabled ? 'ENABLED' : 'DISABLED'}
            </span>
            <button className="pt-btn pt-btn-ghost text-xs"
              onClick={async () => { await fas('POST', visionEnabled ? '/api/vision/disable' : '/api/vision/enable'); load() }}>
              {visionEnabled ? '关闭' : '开启'}
            </button>
          </div>
          <div className="text-xs text-text-lo mt-3">识别对象经确认后进入知识图谱。</div>
        </Panel>
      </div>
      <Panel label={`VISION OBJECTS ×${objects.length}`} meta={
        <button className="pt-btn pt-btn-ghost" onClick={load}><RefreshCw size={12} /></button>
      }>
        <div className="grid grid-cols-4 gap-2">
          {objects.length ? objects.map((o: any, i) => (
            <div key={i} className="border border-edge p-2 text-xs">
              <div className="pt-mono text-text-hi">{typeof o === 'string' ? o : (o.name ?? o.label ?? JSON.stringify(o))}</div>
              <button className="pt-btn pt-btn-primary text-[10px] mt-2 w-full"
                onClick={async () => { await fas('POST', '/api/vision/confirm', { id: o.id ?? i, object: o }); load() }}>
                CONFIRM
              </button>
            </div>
          )) : <div className="text-text-lo text-xs col-span-4">暂无待确认对象</div>}
        </div>
      </Panel>
    </div>
  )
}

/* ── CHAT — conversation log + gaps ───────────────────────────────── */

const ChatTab: React.FC<{ running: boolean }> = ({ running }) => {
  const [logs, setLogs] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [q, setQ] = useState('')

  const load = async () => {
    const [l, s] = await Promise.all([fas('GET', '/api/chat/log'), fas('GET', '/api/chat/log/stats')])
    if (l) setLogs(l.items ?? l.logs ?? l ?? [])
    if (s) setStats(s)
  }
  useEffect(() => { if (running) load() }, [running])

  if (!running) return <>{needRun(running)}</>

  const search = async () => {
    if (!q.trim()) { load(); return }
    const r = await fas('GET', `/api/chat/log/search?q=${encodeURIComponent(q)}`)
    if (r) setLogs(r.items ?? r.results ?? r ?? [])
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Tile label="MESSAGES" value={String(stats?.total ?? stats?.count ?? logs.length)} />
        <Tile label="SESSIONS" value={String(stats?.sessions ?? '—')} />
        <Tile label="GAPS" value={String(stats?.gaps ?? '—')} />
      </div>
      <Panel label="CONVERSATION LOG" meta={
        <div className="flex gap-2">
          <input className="pt-input pt-mono text-xs w-40" placeholder="搜索对话…"
            value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
          <button className="pt-btn pt-btn-ghost" onClick={load}><MessageSquare size={12} /></button>
          <button className="pt-btn pt-btn-ghost text-sig-error"
            onClick={async () => { await fas('POST', '/api/chat/log/clear'); load() }}><Trash2 size={12} /></button>
        </div>
      }>
        <div className="space-y-1 max-h-[460px] overflow-auto text-xs pt-mono">
          {logs.length ? logs.map((l: any, i) => (
            <div key={i} className="border-b border-edge/50 pb-1 text-text-mid">
              {typeof l === 'string' ? l : JSON.stringify(l)}
            </div>
          )) : <div className="text-text-lo">无对话记录</div>}
        </div>
      </Panel>
    </div>
  )
}

/* ── CONFIG ───────────────────────────────────────────────────────── */

/* ── SPEAK — 她的实时消息流 + 直接对话 ────────────────────────────────
 * 消息来源两路：
 *   1. fas.utterance 桥事件（reactive 回复 / proactive 主动 / question 提问），
 *      由 App.tsx 统一写入 localStorage('haru.speak.log')，本页读取 + 实时追加；
 *   2. 本页输入框 POST /api/nlp（走面板同一 REST 代理），发送方留痕。
 * 她选择沉默时（回合无 answer）不会有任何 haru 消息——沉默也是回答。 */

type SpeakMsg = { id: number; role: 'haru' | 'you'; text: string; origin?: string; ts: number;
  // 调试（2026-10-19）：这条话生成时所用的图谱切片（FAS 侧 refs.graph 随桥下行）
  graph?: { ci?: string | null; goal?: string | null; class?: string | null;
            nodes?: { id: string; note?: string; act?: number; conf?: number | null;
                      created?: string; role?: 'basis' | 'hot' }[];
            edges?: [string, string, string, number][] } | null }
const SPEAK_STORE = 'haru.speak.log'
const SPEAK_CAP = 200
const ORIGIN_TAG: Record<string, string> = { proactive: '主动', question: '提问', reactive: '回复' }

const SpeakTab: React.FC<{ running: boolean }> = ({ running }) => {
  const [msgs, setMsgs] = useState<SpeakMsg[]>(() => {
    try {
      const raw = localStorage.getItem(SPEAK_STORE)
      const arr = raw ? JSON.parse(raw) : []
      return Array.isArray(arr) ? arr.slice(-SPEAK_CAP) : []
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const seen = useRef(new Map<string, number>())

  // 去重：桥事件与 /api/nlp 应答兜底可能同文双至（10s 窗口内同 role+text 算一条）
  const add = (m: Omit<SpeakMsg, 'id'>) => {
    const key = `${m.role}|${m.text}`
    const last = seen.current.get(key)
    const now = Date.now()
    if (last && now - last < 10000) return
    seen.current.set(key, now)
    setMsgs(ms => [...ms, { ...m, id: now + Math.random() }].slice(-SPEAK_CAP))
  }

  useEffect(() => {
    const off = EventsOn('fas.utterance', (data: any) => {
      const u = Array.isArray(data) ? data[0] : data
      const text = String(u?.text ?? '').trim()
      if (!text) return
      add({ role: 'haru', text, origin: String(u?.origin ?? 'reactive'),
            ts: Date.now(), graph: u?.refs?.graph ?? null })
    })
    return () => { off?.() }
  }, [])

  /* 保底补拉（2026-10-16）：桥事件只到"当时在线"的前端——Charon 停机、
   * 订阅未装载或恰好错过投递瞬间，她当时说的话就永远进不了气泡流。
   * 但话本身在 Haru 侧有账（chat_log 的 proactive/question 条目），
   * 挂载时补拉一次合并进历史（文本去重），气泡与事实保底一致。 */
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const r: any = await fas('GET', '/api/chat/log?n=80')
        if (dead || !r?.success || !Array.isArray(r.entries)) return
        const back: SpeakMsg[] = []
        for (const e of r.entries) {
          let text = '', origin = ''
          if (e?.proactive) { text = String(e.system_response ?? '').trim(); origin = 'proactive' }
          else if (e?.curiosity && e?.curiosity_question) { text = String(e.curiosity_question).trim(); origin = 'question' }
          if (!origin || !text) continue
          back.push({
            id: back.length + Math.random(), role: 'haru', text, origin,
            ts: e?.time ? (new Date(e.time).getTime() || 0) : 0,
          })
        }
        if (!back.length) return
        setMsgs(prev => {
          const known = new Set(prev.map(m => `haru|${m.text}`))
          const merged = [...prev]
          for (const m of back) {
            if (!known.has(`haru|${m.text}`)) { merged.push(m); known.add(`haru|${m.text}`) }
          }
          merged.sort((a, b) => a.ts - b.ts)
          const next = merged.slice(-SPEAK_CAP)
          try { localStorage.setItem(SPEAK_STORE, JSON.stringify(next)) } catch { /* 存储满：会话内可见即可 */ }
          return next
        })
      } catch { /* Haru 没跑 = 无从补拉，不影响实时通道 */ }
    })()
    return () => { dead = true }
  }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [msgs])

  const send = async () => {
    const t = input.trim()
    if (!t || sending) return
    setSending(true)
    setInput('')
    const mine: SpeakMsg = { id: Date.now() + Math.random(), role: 'you', text: t, ts: Date.now() }
    add(mine)
    // haru 消息由 App.tsx 全局监听统一落盘；'you' 只有这里产生，自己补写，
    // 否则切走 tab 再回来，自己说的话会从历史里消失。
    try {
      const arr = JSON.parse(localStorage.getItem(SPEAK_STORE) || '[]')
      arr.push(mine)
      localStorage.setItem(SPEAK_STORE, JSON.stringify(arr.slice(-SPEAK_CAP)))
    } catch { /* 存储满 → 本次会话内仍可见 */ }
    try {
      const r: any = await fas('POST', '/api/nlp', { text: t })
      if (r?.answer) add({ role: 'haru', text: String(r.answer), origin: 'reactive', ts: Date.now() })
    } catch (e: any) {
      add({ role: 'haru', text: `[投递失败] ${String(e?.message ?? e)}`, origin: 'error', ts: Date.now() })
    } finally { setSending(false) }
  }

  return (
    <div className="space-y-3">
      <Panel label="HARU · 她的话" meta={
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-lo pt-mono">{msgs.length} 条 · 本地留存 {SPEAK_CAP} 封顶</span>
          <button className="pt-btn pt-btn-ghost text-sig-error" title="清空"
            onClick={() => { setMsgs([]); try { localStorage.removeItem(SPEAK_STORE) } catch {} }}>
            <Trash2 size={12} />
          </button>
        </div>
      }>
        <div ref={listRef} className="h-[420px] overflow-auto space-y-2 pr-2">
          {msgs.length === 0
            ? <div className="text-text-lo text-xs pt-mono">还没有消息 · 她说的每句话（回复/主动/提问）都会留在这里</div>
            : msgs.map(m => m.role === 'you'
              ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[70%] border border-edge px-3 py-2 text-xs text-text-mid whitespace-pre-wrap">{m.text}</div>
                </div>
              )
              : (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[80%] border border-accent/40 px-3 py-2">
                    <div className="pt-section-label text-accent text-[10px]">
                      HARU{m.origin && ORIGIN_TAG[m.origin] ? ` · ${ORIGIN_TAG[m.origin]}` : ''}
                      <span className="text-text-lo ml-2">{new Date(m.ts).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-xs text-text-hi mt-1 whitespace-pre-wrap">{m.text}</div>
                    {m.graph?.nodes?.length ? (
                      <details className="mt-2">
                        <summary className="pt-mono text-[10px] text-text-lo cursor-pointer select-none">
                          调试 · 这次话所用的图谱（{m.graph.nodes.length} 节点
                          {m.graph.goal ? ` · ${m.graph.goal}` : ''}
                          {m.graph.ci ? ` · ${m.graph.ci}` : ''}）
                        </summary>
                        <div className="mt-1 space-y-0.5">
                          {m.graph.nodes.map((n, i) => (
                            <div key={i} className="pt-mono text-[10px] text-text-mid">
                              {n.role === 'hot'
                                ? <span className="text-text-lo"
                                    title="语言层切片里的热节点（未登记为该念头的 basis）">热·</span>
                                : null}
                              <span className="text-text-hi">{n.id}</span>
                              {n.note ? <span className="text-accent">〔{n.note}〕</span> : null}
                              <span className="text-text-lo">
                                {' '}act {n.act}
                                {n.conf != null ? ` · conf ${n.conf}` : ''}
                                {n.created ? ` · ${n.created}` : ''}
                              </span>
                            </div>
                          ))}
                          {(m.graph.edges ?? []).map((e, i) => (
                            <div key={`e${i}`} className="pt-mono text-[10px] text-text-lo">
                              {e[0]} —{e[1]}→ {e[2]}（{e[3]}）
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </div>
              ))}
        </div>
      </Panel>
      <div className="flex gap-2">
        <input
          className="pt-input pt-mono text-xs flex-1"
          placeholder={running ? '跟她说点什么…（Enter 发送）' : '需要先启动 Fascinator 后端进程'}
          value={input} disabled={!running || sending}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button className="pt-btn pt-btn-primary" disabled={!running || sending || !input.trim()} onClick={send}>
          <Send size={12} /> {sending ? '…' : '发送'}
        </button>
      </div>
    </div>
  )
}

/* 统一开关式：语音、麦克风、ghost 都用这一个拨动开关，状态即时反馈。
 * on=绿色滑块右移，off=灰色左移；disabled 用于"需先开上层开关"。 */
const Switch: React.FC<{ on: boolean; onClick: () => void; disabled?: boolean; label?: string }> =
  ({ on, onClick, disabled, label }) => (
    <button onClick={onClick} disabled={disabled}
      className={['flex items-center gap-2 group', disabled ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}>
      <span className={['relative inline-block w-10 h-5 rounded-full transition-colors',
        on ? 'bg-accent' : 'bg-edge'].join(' ')}>
        <span className={['absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-surface transition-transform',
          on ? 'translate-x-5' : ''].join(' ')} style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }} />
      </span>
      {label && <span className={['pt-mono text-xs', on ? 'text-accent' : 'text-text-lo'].join(' ')}>{label}</span>}
    </button>
  )

/* ── BODY — 她的身体：语音 / 屏幕观察 / Steam 情境 / 生活循环 / 认知能力 / 云端预算
 * 全部经 fas() 代理打 FAS-Companion REST。隐私纪律在这页是明面的：
 * 麦克风监听与屏幕观察开关在后端都是 ephemeral——可热开、重启必关。 */

const BodyTab: React.FC<{ running: boolean }> = ({ running }) => {
  const [voice, setVoice] = useState<any>(null)
  const [screen, setScreen] = useState<any>(null)
  const [avatar, setAvatar] = useState<any>(null)
  const [living, setLiving] = useState<any>(null)
  const [caps, setCaps] = useState<any>(null)
  const [usage, setUsage] = useState<any>(null)
  const [steam, setSteam] = useState<any>(null)
  const [pca, setPca] = useState<any>(null)
  const [ssp, setSsp] = useState<any>(null)
  const [speakText, setSpeakText] = useState('')
  const [spk, setSpk] = useState<any>(null)          // 出声进度（快轮询）
  const spkTimer = useRef<number | null>(null)
  const [budget, setBudget] = useState('0')
  const [note, setNote] = useState('')

  const STAGE: Record<string, string> = {
    loading_models: '加载语音模型', translating: '转成日语', synthesizing: '合成日语音频',
    playing: '播放中', done: '说完', error: '失败',
  }
  const startSpeakPoll = () => {
    if (spkTimer.current) clearInterval(spkTimer.current)
    const t0 = Date.now()
    spkTimer.current = window.setInterval(async () => {
      const d = await fas('GET', '/api/voice/status')
      const p = (d as any)?.progress
      if (p) setSpk(p)
      if (!p || p.stage === 'done' || p.stage === 'error' || Date.now() - t0 > 200000) {
        if (spkTimer.current) { clearInterval(spkTimer.current); spkTimer.current = null }
        if (p && (p.stage === 'done' || p.stage === 'error')) setTimeout(() => setSpk(null), 5000)
      }
    }, 700)
  }
  useEffect(() => () => { if (spkTimer.current) clearInterval(spkTimer.current) }, [])

  const bodySspRefresh = async () => {
    const r = await fas('GET', '/api/ssp'); if (r) setSsp(r)
  }

  const load = async () => {
    const [v, s, a, l, c, u, st, sp, pa] = await Promise.all([
      fas('GET', '/api/voice/status'), fas('GET', '/api/screen/status'),
      fas('GET', '/api/avatar/state'), fas('GET', '/api/living'),
      fas('GET', '/api/cognition/capabilities'), fas('GET', '/api/usage'),
      fas('GET', '/api/steam/status'), fas('GET', '/api/ssp'),
      fas('GET', '/api/pc_autonomy'),
    ])
    if (v) setVoice(v); if (s) setScreen(s); if (a) setAvatar(a)
    if (l) setLiving(l); if (c) setCaps(c); if (u) setUsage(u); if (st) setSteam(st)
    if (sp) setSsp(sp)
    if (pa) setPca(pa)
    if (u?.summary?.budget_cny) setBudget(String(u.summary.budget_cny))
  }
  useEffect(() => {
    if (!running) return
    load()
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [running])

  if (!running) return <>{needRun(running)}</>
  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(''), 4000) }

  const voiceCtl = async (body: any, ok: string) => {
    const r = await fas('POST', '/api/voice', body); if (r) { flash(ok); load() }
  }
  const screenCtl = async (on: boolean) => {
    const r = await fas('POST', '/api/screen', { enabled: on })
    if (r) { flash(on ? '屏幕观察已开启（重启后自动关闭）' : '屏幕观察已停止'); load() }
  }
  const observeOnce = async () => {
    const r = await fas('POST', '/api/screen/observe', {})
    if (r) flash(r.success ? `摘要：${(r.preview ?? '').slice(0, 60)}${r.duplicate ? '（与上次相同）' : ''}` : `观察失败：${r.reason ?? JSON.stringify(r).slice(0, 60)}`)
  }
  const livingCtl = async (action: string, aid: string) => {
    const r = await fas('POST', '/api/living', { action, activity: aid })
    if (r?.success) { flash(`${action}: ${aid}`); load() } else flash(`失败：${r?.error ?? ''}`)
  }
  const setConfig = async (k: string, v: any, ok: string) => {
    const r = await fas('PUT', '/api/config', { [k]: v })
    if (r) { flash(ok + '（已持久化）'); load() }
  }

  const modeColor: Record<string, string> = {
    production_in_use: 'text-accent', flag_off: 'text-text-lo',
    enabled_wired_runtime_unverified: 'text-sig-warn',
  }

  return (
    <div className="space-y-3">
      {note && <div className="pt-glass border border-accent/40 p-2 text-xs text-accent pt-mono">{note}</div>}

      {/* 语音 */}
      <div className="grid grid-cols-2 gap-3">
        <Panel label="VOICE · 日语语音闭环" meta={<span className="pt-mono text-[10px] text-text-lo">{voice?.state ?? '—'}</span>}>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs">她说出声（日语 TTS 发声+打断）</span>
            <Switch on={!!voice?.enabled}
              onClick={() => voiceCtl(voice?.enabled ? { enabled: false, listen: false } : { enabled: true },
                voice?.enabled ? '语音已停用' : '语音已启用')} />
          </div>
          <div className="flex items-center justify-between py-1.5 border-t border-edge/50">
            <span className="text-xs">麦克风持续监听 <span className="text-[10px] text-text-lo pt-mono">重启自动关</span></span>
            <Switch on={!!voice?.listening} disabled={!voice?.enabled}
              onClick={() => voiceCtl({ listen: !voice?.listening },
                voice?.listening ? '麦克风已关' : '麦克风监听中')} />
          </div>
          <div className="flex gap-2 mt-3">
            <input className="pt-input flex-1 pt-mono text-xs" placeholder="让她说出这句话（播报前自动转日语）…"
              value={speakText} onChange={e => setSpeakText(e.target.value)} />
            <button className="pt-btn pt-btn-primary text-xs" disabled={!speakText.trim() || !!spk}
              onClick={async () => {
                const r: any = await fas('POST', '/api/voice/speak', { text: speakText })
                if (r?.started) { setSpk({ stage: 'loading_models', pct: 1, detail: '已受理' }); startSpeakPoll() }
                else flash(r?.reason === 'busy' ? '她正在说话中…'
                  : r?.reason === 'disabled' ? '先拨开上方「她说出声」开关' : '未能开始（语音未装配）')
              }}>{spk ? '…' : '出声'}</button>
          </div>
          {spk && (
            <div className="mt-3">
              <div className="flex justify-between text-[10px] pt-mono text-text-lo">
                <span>{STAGE[spk.stage] ?? spk.stage}{spk.detail ? ` · ${spk.detail}` : ''}</span>
                <span>{spk.pct}%</span>
              </div>
              <div className="h-1.5 bg-edge rounded overflow-hidden mt-1">
                <div className="h-full bg-accent transition-all duration-700"
                  style={{ width: `${spk.pct}%` }} />
              </div>
            </div>
          )}
          <div className="mt-3 space-y-1 text-xs pt-mono text-text-lo">
            <div>vad: {String(voice?.backends?.vad ?? '—')} · asr: {String(voice?.backends?.asr ?? '—')} · tts: {String(voice?.backends?.tts ?? '—')}</div>
            <div>分段 {voice?.stats?.segments ?? 0} · 识别 {voice?.stats?.recognized ?? 0} · 出声 {voice?.stats?.spoken ?? 0} · 打断 {voice?.stats?.interrupts ?? 0}</div>
            {voice?.reason && <div className="text-sig-warn">{String(voice.reason).slice(0, 90)}</div>}
            <div>说日语={voice?.speak_lang} · 听={voice?.asr_language}（输入输出语言分开，你的中文不会被强改）</div>
          </div>
        </Panel>

        {/* 形象状态 + 屏幕 */}
        <Panel label="AVATAR · 存在感 / SCREEN · 眼睛" meta={
          <span className={['pt-chip', screen?.enabled ? 'text-sig-warn border-sig-warn' : ''].join(' ')}>{screen?.enabled ? '采集中' : '观察关'}</span>}>
          <div className="flex items-center gap-2 mb-3">
            <span className="pt-display text-2xl text-accent">{avatar?.state ?? '—'}</span>
            <span className="text-xs text-text-lo pt-mono">by {avatar?.source ?? '—'}</span>
          </div>
          <div className="text-[10px] pt-mono text-text-lo max-h-16 overflow-auto">
            {(avatar?.recent ?? []).map((x: any) => `${x.from}→${x.to}`).join(' · ')}
          </div>
          <div className="h-px bg-edge my-3" />
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs">屏幕观察 <span className="text-[10px] text-text-lo pt-mono">重启自动关</span></span>
            <Switch on={!!screen?.enabled}
              onClick={() => screenCtl(!screen?.enabled)} />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button className="pt-btn pt-btn-ghost text-xs" disabled={!screen?.enabled} onClick={observeOnce}>观察一次</button>
          </div>
          <div className="text-[10px] text-text-lo mt-2 pt-mono">
            默认关 · 重启必回关 · 采集期右上角常亮指示 · 截图不落盘不上云（本小时 {screen?.hour_count ?? 0} 次 / 共 {screen?.observations ?? 0}）
          </div>
        </Panel>
      </div>

      {/* 生活循环 */}
      <Panel label="LIVING · 她的后台生活" meta={
        <div className="flex items-center gap-3">
          <span className="text-xs pt-mono text-text-lo">今日网络预算余 {living?.budget_left ?? '—'}</span>
          <Switch on={!!living?.enabled} label={living?.enabled ? 'ON' : 'OFF'}
            onClick={() => setConfig('living_loop_enabled', !living?.enabled, living?.enabled ? '生活循环关' : '生活循环开')} />
        </div>}>
        <div className="space-y-1 max-h-44 overflow-auto">
          {(living?.activities ?? []).map((a: any) => (
            <div key={a.id} className="flex items-center gap-2 border border-edge px-2 py-1 text-xs">
              <span className="pt-mono w-14 text-text-lo">{a.state}</span>
              <span className="flex-1 truncate">{a.topic}</span>
              {a.share && <span className="text-accent pt-mono text-[10px]">分享:{a.share}{living?.share_candidates?.some((c: any) => c.topic === a.topic && c.delivered) ? '·已投' : ''}</span>}
              {['active', 'waiting'].includes(a.state) && <button className="pt-btn pt-btn-ghost text-[10px]" onClick={() => livingCtl('pause', a.id)}>暂停</button>}
              {a.state === 'paused' && <button className="pt-btn pt-btn-primary text-[10px]" onClick={() => livingCtl('resume', a.id)}>继续</button>}
              {!['abandoned', 'done'].includes(a.state) && <button className="pt-btn pt-btn-ghost text-[10px] text-sig-error" onClick={() => livingCtl('abandon', a.id)}>放弃</button>}
            </div>
          )) || <div className="text-text-lo text-xs">还没有生活活动（开启循环后，她会从聊天里的知识缺口自己找事做）</div>}
        </div>
      </Panel>

      {/* 伺か/SSP 桌面形象 */}
      <Panel label="GHOST · 桌面形象（伺か/SSP）" meta={
        <span className={['pt-mono text-[10px]', ssp?.ghost_reachable ? 'text-accent' : 'text-text-lo'].join(' ')}>
          {ssp?.ghost_reachable ? 'ghost 在线' : 'ghost 未显示（托盘里调出）'}
        </span>}>
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs">让 Haru 用桌面 ghost 演说（话语→气泡+动画）</span>
          <Switch on={!!ssp?.enabled}
            onClick={() => fas('POST', '/api/ssp', { enabled: !ssp?.enabled }).then(bodySspRefresh).then(() => flash(ssp?.enabled ? '形象已收回（回 Charon 气泡）' : '形象已启用'))} />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button className="pt-btn pt-btn-ghost text-xs" disabled={!ssp?.enabled}
            onClick={async () => {
              const r = await fas('POST', '/api/ssp', { test: '我是 Haru，桌面形态上线测试。' })
              flash(r?.delivered ? '已推送——看 ghost 头顶气泡' : 'SSP 不可达（ghost 没显示？）')
            }}>推一句测试</button>
          <span className="text-[10px] text-text-lo pt-mono">注：ghost 自身词典的自发台词与 Haru 无关（要纯净需配 Haru 专属空词典 ghost）</span>
        </div>
        <div className="text-[10px] text-text-lo mt-2 pt-mono">
          SSTP over HTTP（127.0.0.1:9801）· 纯表现层旁路，ghost 关了不影响任何功能 · 语音发声与 ghost 无关（那是上面的 VOICE 开关）
        </div>
      </Panel>

      {/* 电脑控制权（pc_autonomy）：级别阶梯 + 后台姿态 + 实时在场 */}
      <Panel label="AUTONOMY · 电脑控制权" meta={<span className="pt-mono text-[11px]">
        {pca ? (pca.present ? <span className="text-accent">有人在场</span>
          : <span className="text-text-lo">无人在场</span>) : null}
        {pca?.idle_s != null ? <span className="text-text-lo"> · 键鼠闲置 {Math.round(pca.idle_s)}s</span> : null}
      </span>}>
        <div className="flex gap-2 items-center">
          {([['off', '关闭'], ['attended', '有人·仅后台'], ['unattended', '无人值守·可前台']] as const).map(([v, lab]) => (
            <button key={v} className={`pt-btn text-xs ${pca?.level === v ? 'pt-btn-primary' : 'pt-btn-ghost'}`}
              onClick={async () => {
                const r = await fas('POST', '/api/pc_autonomy', { level: v })
                if (r?.success) { flash(`电脑控制权：${lab}`); load() }
                else flash(`失败：${r?.error ?? ''}`)
              }}>{lab}</button>
          ))}
          <span className="mx-1 text-edge">|</span>
          <Switch on={!!pca?.background} label="显式后台"
            onClick={async () => {
              const r = await fas('POST', '/api/pc_autonomy', { background: !(pca?.background) })
              if (r?.success) { flash(`后台姿态：${r.changed?.background ? '开' : '关'}`); load() }
            }} />
        </div>
        <div className="text-[10px] text-text-lo mt-1.5 leading-relaxed">
          关闭=她不能启动任何程序（已开着的照玩）；有人=只在她启动程序时强制最小化不抢你的键鼠；
          无人值守=可以自己开游戏并放到前台。白名单：{(pca?.apps ?? []).join(' / ') || '（空）'}
        </div>
      </Panel>

      {/* Steam + 预算 + 能力 */}
      <div className="grid grid-cols-3 gap-3">
        <Panel label="STEAM · 游戏情境" meta={
          <Switch on={!!steam?.enabled} label={steam?.enabled ? 'ON' : 'OFF'}
            onClick={() => setConfig('steam_poll_enabled', !steam?.enabled, steam?.enabled ? 'Steam 关' : 'Steam 开')} />}>
          <div className="text-xs pt-mono text-text-lo space-y-1">
            <div>key: {steam?.has_key ? '已配置 ✓' : '未配置（STEAM_API_KEY）'}</div>
            <div>steamid: {steam?.steam_id_set ? '已配置 ✓' : '待提供'}</div>
          </div>
          <button className="pt-btn pt-btn-ghost text-xs mt-2"
            onClick={async () => {
              const r = await fas('POST', '/api/steam/tick', {})
              if (r?.ok && r.changed) flash(`事件：${r.event?.kind} ${r.event?.game ?? ''}`)
              else if (r?.ok) flash(`无变化 · 当前:${r.current?.game ?? '没在玩'}`)
              else flash(`轮询未成：${r?.reason ?? ''}`)
            }}>立即轮询一次</button>
        </Panel>

        <Panel label="USAGE · 云端用量/预算">
          <div className="text-xs pt-mono space-y-1 text-text-mid">
            <div>本月调用 <span className="text-accent">{usage?.summary?.calls ?? 0}</span> · 失败 {usage?.summary?.failed ?? 0} · 估算 ¥{usage?.summary?.cost_cny ?? 0}</div>
            {usage?.over_budget && <div className="text-sig-error">已达预算阈值 → LLM 降级中</div>}
          </div>
          <div className="flex gap-2 mt-3">
            <input className="pt-input w-24 pt-mono text-xs" type="number" min="0" step="1"
              value={budget} onChange={e => setBudget(e.target.value)} />
            <button className="pt-btn pt-btn-primary text-xs"
              onClick={() => setConfig('llm_monthly_budget_cny', Number(budget) || 0, `预算阈值 ¥${budget}`)}>设定</button>
          </div>
          <div className="text-[10px] text-text-lo mt-1">0=不限；单价表在认知仓 config（当前未填价=只记账不拦截）</div>
        </Panel>

        <Panel label="COGNITION · 能力清单" meta={<button className="pt-btn pt-btn-ghost" onClick={load}><RefreshCw size={12} /></button>}>
          <div className="space-y-1 max-h-56 overflow-auto text-[11px] pt-mono">
            {Object.entries(caps?.capabilities ?? {}).map(([k, v]: any) => (
              <div key={k} className="flex justify-between border-b border-edge/50 py-0.5">
                <span className="text-text-mid">{k}</span>
                <span className={modeColor[v.mode] ?? 'text-text-lo'}>
                  {v.mode === 'production_in_use' ? '●在用' : v.mode === 'flag_off' ? '○关' : '◐接线未实测'}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

const ConfigTab: React.FC = () => {
  const [cfgText, setCfgText] = useState('')

  const load = async () => {
    try {
      const c = await api.fascinator.readConfig()
      setCfgText(typeof c === 'string' ? c : JSON.stringify(c, null, 2))
    } catch (_) {}
  }
  const save = async () => { try { await api.fascinator.writeConfig(cfgText) } catch (_) {} }
  useEffect(() => { load() }, [])

  return (
    <GlassPanel
      title="CONFIG EDITOR"

      actions={
        <div className="flex items-center gap-2">
          <button className="pt-btn pt-btn-ghost" onClick={load}><RotateCcw size={13} /> RELOAD</button>
          <button className="pt-btn pt-btn-primary" onClick={save}><Cog size={13} /> SAVE</button>
        </div>
      }
    >
      <textarea
        className="pt-input mt-3 w-full min-h-[420px] pt-mono text-[12px] leading-relaxed"
        value={cfgText}
        onChange={e => setCfgText(e.target.value)}
        spellCheck={false}
      />
      <div className="mt-2 text-xs text-text-lo">
        lambda_decay (衰减) · beta_spread (扩散增益) · theta_threshold (激活阈值) ·
        theta_action (行动阈值) · k_top (注意容量) · max_depth (扩散深度) · auto_interval (自动节拍)
      </div>
    </GlassPanel>
  )
}

export default Fascinator
