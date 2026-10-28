import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { MousePointerClick, ShieldAlert, Crosshair, Check, X, RefreshCw } from 'lucide-react'

/* 桌面控制批准卡 —— Haru 请求操作你电脑时的**人工确认**闸。
 *
 * 只读轮询 FAS /api/desktop/pending（安全/位置/敏感三层里，位置与敏感层动作
 * 会排队在这里，绝不自动执行）。你点"批准"才 POST /api/desktop/approve 真正
 * 执行；点"拒绝"POST /api/desktop/deny 移除。桌面控制总闸关时 pending 恒空
 * → 本组件完全隐形，零噪音、零存在感。
 */

type Pending = {
  id: string
  ts: number
  tier?: string
  action: {
    kind?: string; method?: string; target_app?: string
    element_name?: string; text?: string; x?: number; y?: number
  }
  reasons?: string[]
}

const TIER_META: Record<string, { label: string; cls: string; Icon: any }> = {
  positional: { label: '位置操作', cls: 'border-amber-500/60 text-amber-300', Icon: Crosshair },
  sensitive: { label: '敏感操作', cls: 'border-rose-500/60 text-rose-300', Icon: ShieldAlert },
  safe: { label: '安全操作', cls: 'border-lime-500/60 text-lime-300', Icon: MousePointerClick },
}

function describe(a: Pending['action']): string {
  const kind = a.kind || '操作'
  const app = a.target_app ? `『${a.target_app}』` : ''
  const el = a.element_name ? `的『${a.element_name}』` : ''
  const px = (a.x != null && a.y != null) ? ` @(${a.x},${a.y})` : ''
  const tx = a.text ? ` 内容『${a.text.slice(0, 24)}${a.text.length > 24 ? '…' : ''}』` : ''
  const map: Record<string, string> = {
    click: '点击', invoke: '触发控件', double_click: '双击',
    type: '输入文本', key: '按键', focus: '聚焦窗口', minimize: '最小化',
  }
  return `Haru 想${map[kind] || kind} ${app}${el}${px}${tx}`.trim()
}

export const DesktopApproval: React.FC = () => {
  const [items, setItems] = useState<Pending[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const mounted = useRef(true)

  const poll = useCallback(async () => {
    try {
      const r: any = await api.fascinator.call('GET', '/api/desktop/pending')
      if (!mounted.current) return
      setItems((r?.pending || []) as Pending[])
      setErr('')
    } catch {
      // FAS 未启动 / 桌面端点不可达：静默（不打扰，不报错横幅）
      if (mounted.current) setItems([])
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    poll()
    const id = setInterval(poll, 8000)
    return () => { mounted.current = false; clearInterval(id) }
  }, [poll])

  const act = useCallback(async (id: string, approve: boolean) => {
    setBusy(id)
    try {
      await api.fascinator.call('POST',
        approve ? '/api/desktop/approve' : '/api/desktop/deny', { id })
    } catch (e: any) {
      setErr(String(e?.message || e).slice(0, 60))
    } finally {
      setBusy(null)
      poll()
    }
  }, [poll])

  if (!items.length) return null   // 无待批（含桌面控制关）→ 完全隐形

  return (
    <div className="fixed bottom-4 left-4 z-50 space-y-2 w-[min(420px,90vw)]">
      <div className="pt-glass border border-amber-500/40 px-3 py-1.5 flex items-center gap-2">
        <MousePointerClick size={14} className="text-amber-400" />
        <span className="pt-section-label text-amber-300">
          Haru 请求操作你的电脑
        </span>
        <button onClick={poll} className="ml-auto text-text-lo hover:text-text-hi"
                title="刷新"><RefreshCw size={13} /></button>
      </div>
      {items.map(it => {
        const t = it.tier || (it.action.method === 'pixel' ? 'positional' : 'sensitive')
        const meta = TIER_META[t] || TIER_META.sensitive
        const Icon = meta.Icon
        return (
          <div key={it.id}
               className={`pt-glass border ${meta.cls} bg-[#20263c]/95 px-4 py-3 rounded`}>
            <div className="flex items-center gap-2 text-xs">
              <Icon size={14} className={meta.cls} />
              <span className="font-semibold">{meta.label}</span>
              <span className="text-text-lo ml-auto">
                {new Date((it.ts || 0) * 1000).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-sm text-text-hi mt-1.5 leading-snug">
              {describe(it.action)}
            </div>
            {it.reasons?.map((r, i) => (
              <div key={i} className="text-[11px] text-text-lo mt-1">· {r}</div>
            ))}
            <div className="flex gap-2 mt-2.5">
              <button
                disabled={busy === it.id}
                onClick={() => act(it.id, true)}
                className="flex-1 flex items-center justify-center gap-1 rounded border border-amber-500/50 bg-amber-500/15 text-amber-300 py-1.5 text-xs hover:bg-amber-500/25 disabled:opacity-50">
                <Check size={13} /> 批准执行
              </button>
              <button
                disabled={busy === it.id}
                onClick={() => act(it.id, false)}
                className="flex-1 flex items-center justify-center gap-1 rounded border border-rose-500/50 bg-rose-500/10 text-rose-300 py-1.5 text-xs hover:bg-rose-500/20 disabled:opacity-50">
                <X size={13} /> 拒绝
              </button>
            </div>
          </div>
        )
      })}
      {err && <div className="text-[11px] text-rose-300 px-1">操作失败：{err}</div>}
    </div>
  )
}

export default DesktopApproval
