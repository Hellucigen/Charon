import React, { useCallback, useEffect, useRef, useState } from 'react'
import { EventsOn } from '@/wailsjs/runtime/runtime'
import { api } from '@/lib/api'
import { Brain, Send, X } from 'lucide-react'

/* Companion — 陪伴模块（深度融入 Charon 的工业仪表盘语言）。
 *
 * 视觉：与全局一致——浅色 pt-glass 面板、1px 边、点阵画布、等宽铭牌；
 * 陪伴区的柔软处只用两处：暖纸色对话面板（--accent-amber 系）和
 * 琥珀色 Haru 专属强调（区别于全局橙=action，琥珀=她）。
 *
 * 数据契约（全部来自 FAS 真实接口，UI 不制造认知状态）：
 *   · 用户输入 / Haru 回复  → api.fascinator.call POST /api/nlp（channel=web）
 *   · 她的主动/被动话语下行 → Wails 事件 fas.utterance（charon_bridge 透传）
 *   · 形象状态             → fas.avatar_state 事件 + /api/avatar/state
 *   · 认知面板             → /api/cognition/state、/api/graph、/api/living
 * 内部思考/联想/搜索结果不进对话区——只有真实表达才显示。
 */

const FAS = (m: string, p: string, body?: any) => api.fascinator.call(m, p, body)
const esc = (s: any) => (s ?? '').toString()

type Line = { who: string; text: string; cls: 'user' | 'haru' | 'pro' | 'sys' }
type Intent = { id?: string; kind?: string; activation?: number; goal?: string; basis?: string[]; status?: string }
type CogState = { intentions?: Intent[]; thresholds?: Record<string, number>; field_change?: number; reflection_pressure?: number }
type GraphData = { nodes?: any[]; edges?: any[] }
type Living = { activities?: any[]; budget_left?: number }

const norm = (s: string) => s.replace(/[\s\p{P}]+/gu, '').slice(0, 60)
const STATE_ZH: Record<string, string> = {
  idle: '发呆中', thinking: '在想事情', browsing: '在上网闲逛',
  researching: '在查资料', playing: '在玩游戏', speaking: '正在说话',
  listening: '在听你说话', moving: '走动中',
}

export const Companion: React.FC = () => {
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [avatar, setAvatar] = useState<string>('…')
  const [showCog, setShowCog] = useState(false)
  const [cog, setCog] = useState<CogState | null>(null)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [living, setLiving] = useState<Living | null>(null)
  const [nodeSel, setNodeSel] = useState<any>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const logRef = useRef<HTMLDivElement>(null)
  const dlgRef = useRef<HTMLDivElement>(null)

  const push = useCallback((who: string, text: string, cls: Line['cls']) => {
    const key = norm(who + text)
    if (seenRef.current.has(key)) return          // 去重：fetch 回答与桥事件不双显
    seenRef.current.add(key)
    if (seenRef.current.size > 40) {
      const it = seenRef.current.values()
      for (let i = 0; i < 20; i++) {
        const v = it.next().value
        if (v !== undefined) seenRef.current.delete(v)
      }
    }
    setLines(ls => [...ls, { who, text, cls }].slice(-120))
  }, [])

  // ── 历史播种：App 层的 haru.speak.log 已记录全部话语（含 reactive）──
  useEffect(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('haru.speak.log') || '[]')
      for (const u of arr.slice(-24)) {
        const who = u.role === 'haru' ? (u.origin === 'proactive' || u.origin === 'question' ? 'HARU ✦' : 'HARU') : '你'
        push(who, String(u.text ?? ''), u.role === 'haru' ? (u.origin === 'proactive' ? 'pro' : 'haru') : 'user')
      }
    } catch { /* 坏档不致命 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 她的话语下行：主动/被动都进对话区（App 层气泡只弹 proactive）──
  useEffect(() => {
    const off = EventsOn('fas.utterance', (data: any) => {
      const u = Array.isArray(data) ? data[0] : data
      const text = String(u?.text ?? '').trim()
      if (!text) return
      const origin = String(u?.origin ?? 'reactive')
      push(origin === 'proactive' || origin === 'question' ? 'HARU ✦' : 'HARU',
           text, origin === 'proactive' ? 'pro' : 'haru')
      setThinking(false)
    })
    return () => { off?.() }
  }, [push])

  // ── 形象状态 ──
  useEffect(() => {
    const off = EventsOn('fas.avatar_state', (data: any) => {
      const d = Array.isArray(data) ? data[0] : data
      if (d?.state) setAvatar(STATE_ZH[d.state] || d.state)
    })
    const tick = async () => {
      try {
        const r = await FAS('GET', '/api/avatar/state')
        if (r?.state) setAvatar(STATE_ZH[r.state] || r.state)
      } catch { /* FAS 未启动 */ }
    }
    tick()
    const id = setInterval(tick, 20000)
    return () => { off?.(); clearInterval(id) }
  }, [])

  const send = useCallback(async () => {
    const t = input.trim()
    if (!t || thinking) return
    setInput('')
    push('你', t, 'user')
    setThinking(true)
    try {
      const r = await FAS('POST', '/api/nlp', { text: t, channel: 'web' })
      if (r?.answer) {
        push('HARU', String(r.answer), 'haru')
        setThinking(false)
      } else {
        push('系统', '（她没有接话——回答为空，稍后再试。）', 'sys')
        setThinking(false)
      }
    } catch (e: any) {
      push('系统', '连接 FAS 失败：' + String(e).slice(0, 80), 'sys')
      setThinking(false)
    }
  }, [input, thinking, push])

  // ── 认知面板数据 ──
  const fetchCog = useCallback(async () => {
    try { const c = await FAS('GET', '/api/cognition/state'); setCog(c ?? null) } catch { setCog(null) }
    try { const g = await FAS('GET', '/api/graph'); setGraph(g ?? null) } catch { setGraph(null) }
    try { const l = await FAS('GET', '/api/living'); setLiving(l ?? null) } catch { setLiving(null) }
  }, [])
  useEffect(() => {
    if (!showCog) return
    fetchCog()
    const id = setInterval(fetchCog, 30000)
    return () => clearInterval(id)
  }, [showCog, fetchCog])

  useEffect(() => { logRef.current?.scrollTo(0, 1e9) }, [lines])
  useEffect(() => { dlgRef.current?.scrollTo(0, 1e9) }, [lines])

  const last = lines[lines.length - 1]
  const hot = (graph?.nodes || []).filter(n => n.activation != null)
    .sort((a, b) => b.activation - a.activation).slice(0, 8)
  const intents = (cog?.intentions || [])
    .filter(i => i.status === 'ready' || (i.activation ?? 0) > 0.3)
    .sort((a, b) => (b.activation ?? 0) - (a.activation ?? 0)).slice(0, 5)

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      {/* 画布：全局同款点阵，但换成暖调（陪伴区的地面） */}
      <div className="absolute inset-0"
           style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.07) 1px, transparent 1px)',
                    backgroundSize: '24px 24px' }} />
      <div className="absolute inset-0"
           style={{ background: 'radial-gradient(ellipse 110% 80% at 50% 30%, rgba(60,58,86,.35), rgba(21,26,46,.4))' }} />

      {/* 立绘区：留空（将来放图时在此容器内加 <img>） */}
      <div className="absolute left-1/2 bottom-[172px] -translate-x-[55%]"
           style={{ width: 'min(34vh,300px)', height: 'min(58vh,540px)' }} />

      {/* 状态铭牌：全局同款工业铭牌风（点+大写+字距），琥珀=她 */}
      <div className="absolute top-4 left-5 z-10 pt-glass px-3 py-1.5 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#e8b778' }} />
        <span className="pt-mono text-[11px] tracking-[.2em] uppercase text-[#c8c4b8]">
          HARU · {avatar}
        </span>
      </div>

      {/* 对话面板：暖纸色的 pt-glass——同结构，暖底 */}
      <div className="absolute left-[5%] right-[5%] bottom-5 z-[5] pt-glass
                      rounded-[var(--pt-radius)] overflow-visible"
           style={{ background: 'linear-gradient(180deg, rgba(32,38,60,.92), rgba(26,31,50,.95))',
                    borderColor: '#3a4058' }}>
        {/* 记录流 */}
        <div ref={logRef} className="max-h-[24vh] overflow-y-auto px-6 pt-4 space-y-2">
          {lines.map((l, i) => (
            <div key={i} className={`text-[13px] leading-relaxed border-l-2 pl-2.5
                ${l.cls === 'user' ? 'border-[#8a95c8]/70 text-[#b8c2e8]/90'
                  : l.cls === 'pro' ? 'border-[#e8b778] text-[#f0e2c8]'
                  : l.cls === 'sys' ? 'border-[#55596e] text-[#8b8878] italic'
                  : 'border-[#6a6a80] text-[#d8d4c8]'}`}>
              <span className="block text-[10.5px] pt-mono tracking-wider text-[#6f6c88] uppercase">{l.who}</span>
              {l.cls === 'pro' && <span style={{ color: '#e8b778' }} className="mr-1">✦</span>}{l.text}
            </div>
          ))}
        </div>
        {/* 当前台词 */}
        <div ref={dlgRef} className="px-6 pt-1.5 max-h-[20vh] overflow-y-auto">
          <div className="min-h-[52px] text-[15.5px] leading-[1.8] whitespace-pre-wrap text-[#ece5d8]">
            {thinking ? <span className="text-[#6f6c88]">…</span>
              : last ? <>{last.cls === 'pro' && <span style={{ color: '#e8b778' }} className="mr-1">✦</span>}{last.text}</>
              : <span className="text-[#6f6c88]">（想她了就打句话。她自己想说的时候，也会开口。）</span>}
          </div>
        </div>
        {/* 输入行：全局白底输入 + 琥珀焦点 */}
        <div className="flex gap-2 px-5 pb-3.5 pt-2">
          <input value={input} onChange={e => setInput(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') send() }}
                 placeholder="和她说点什么…"
                 className="flex-1 rounded-[var(--pt-radius)] border border-[#3a4058] bg-[#181d30]
                            px-3.5 py-2 text-[14px] text-[#ece5d8] placeholder-[#5f5c70]
                            outline-none transition-colors"
                 style={{ boxShadow: '0 1px 0 rgba(255,255,255,.8) inset' }}
                 onFocus={e => (e.currentTarget.style.borderColor = '#e8b778')}
                 onBlur={e => (e.currentTarget.style.borderColor = '#3a4058')} />
          <button onClick={send} disabled={thinking}
                  className="rounded-[var(--pt-radius)] border px-3.5 transition-colors disabled:opacity-40"
                  style={{ borderColor: '#e8b778', color: '#e8b778', background: 'rgba(232,183,120,.12)' }}>
            <Send size={15} />
          </button>
          <button onClick={() => { setShowCog(s => !s); fetchCog() }}
                  className="rounded-[var(--pt-radius)] border px-3 transition-colors"
                  style={showCog
                    ? { borderColor: '#009a9b', color: '#009a9b', background: '#eef7f7' }
                    : { borderColor: '#d0d0d0', color: '#787878', background: '#fafafa' }}>
            <Brain size={15} />
          </button>
        </div>
      </div>

      {/* 认知观察抽屉：标准 pt-glass（与 Fascinator 面板同语言） */}
      {showCog && (
        <div className="absolute top-3 right-3 bottom-3 w-[min(430px,44%)] z-20 overflow-y-auto
                        pt-glass p-4 text-[12.5px] text-[#3a3a3a]">
          <div className="pt-module-header -mx-4 -mt-4 mb-3" style={{ paddingLeft: 14 }}>
            <span>认知观察 · COGNITION</span>
            <button onClick={() => setShowCog(false)} className="ml-auto text-[#a0a0a0] hover:text-[#3a3a3a]"><X size={13} /></button>
          </div>

          <div className="mb-4">
            <div className="pt-mono text-[10px] tracking-[.2em] uppercase text-[#888] border-b border-[#e0e0e0] pb-1 mb-2">
              当前意图 · 内部状态</div>
            {intents.length === 0 && <div className="text-[#b0b0b0] py-2">当前没有活跃意图（她在放空——这是合法状态）</div>}
            {intents.map((i, k) => (
              <div key={k} className="my-1.5 leading-snug">
                <b className="text-[#1a1a1a]">{esc(i.kind || '?')}</b>
                <span className="pt-mono text-[11px] text-[#888]"> act={(+(i.activation ?? 0)).toFixed(2)} · {esc(i.goal || '-')}</span>
                <div className="text-[11px] text-[#989898]">依据: {esc((i.basis || []).slice(0, 3).join(' · ') || '-')}</div>
              </div>
            ))}
            <div className="flex justify-between text-[11.5px] text-[#686868] mt-2 pt-mono">
              <span>field_change</span><span className="text-[#1a1a1a]">{(+(cog?.field_change ?? 0)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[11.5px] text-[#686868] pt-mono">
              <span>reflection_pressure</span><span className="text-[#1a1a1a]">{(+(cog?.reflection_pressure ?? 0)).toFixed(2)}</span>
            </div>
          </div>

          <div className="mb-4">
            <div className="pt-mono text-[10px] tracking-[.2em] uppercase text-[#888] border-b border-[#e0e0e0] pb-1 mb-2">
              活跃概念 · 观测</div>
            {hot.length === 0 && <div className="text-[#b0b0b0] py-2">图谱暂无可观测节点</div>}
            {hot.map(n => (
              <div key={n.id} onClick={() => setNodeSel(n)}
                   className="my-0.5 rounded px-1.5 py-0.5 hover:bg-[#f0f0f0] cursor-pointer">
                <b className="text-[#1a1a1a]">{esc(n.id)}</b>
                <span className="pt-mono text-[11px] text-[#888]"> act={+(n.activation ?? 0).toFixed(2)} · {esc(n.label || '')}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="pt-mono text-[10px] tracking-[.2em] uppercase text-[#888] border-b border-[#e0e0e0] pb-1 mb-2">
              活动账本 · 事实记录</div>
            {(living?.activities || []).length === 0 && <div className="text-[#b0b0b0] py-2">账本为空</div>}
            {(living?.activities || []).slice(-5).reverse().map((a: any) => (
              <div key={a.id} className="my-1 leading-snug">
                <b className="text-[#1a1a1a]">{esc(String(a.topic || a.concept || '?').slice(0, 24))}</b>
                <span className="pt-mono text-[11px] text-[#888]"> {esc(a.state || '')}{a.findings ? ` · 发现${a.findings}` : ''}</span>
              </div>
            ))}
            <div className="flex justify-between text-[11.5px] text-[#686868] mt-2 pt-mono">
              <span>web_budget_left</span><span className="text-[#1a1a1a]">{living?.budget_left ?? '-'}</span>
            </div>
          </div>

          {nodeSel && (
            <div className="mt-4 pt-glass-2 p-3">
              <div className="flex justify-between items-center">
                <b className="text-[#1a1a1a]">{esc(nodeSel.id)}</b>
                <button onClick={() => setNodeSel(null)} className="text-[#a0a0a0]"><X size={12} /></button>
              </div>
              <div className="pt-mono text-[11px] text-[#888] mt-1">
                {esc(nodeSel.label || '-')} · since {esc(String(nodeSel.created || '-').slice(0, 19))}</div>
              {nodeSel.extra_attrs?.text &&
                <div className="mt-1.5 leading-relaxed text-[11.5px] text-[#686868]">{esc(String(nodeSel.extra_attrs.text).slice(0, 200))}</div>}
              <div className="text-[10.5px] text-[#b0b0b0] mt-2">（详情来自图谱缓存快照；深度操作请用 Fascinator 面板）</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
