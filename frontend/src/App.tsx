import React, { Suspense, lazy, useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import CommandPalette from '@/components/CommandPalette'
import FleetingDrawer from '@/components/FleetingDrawer'
import { useApp } from '@/store/app'
import Dashboard from '@/modules/Dashboard'
import { PluginPanel } from '@/components/PluginPanel'
import { EventsOn } from './wailsjs/runtime/runtime'
import { List, IsEnabled } from './wailsjs/go/modules/PluginsService'

const Fascinator = lazy(() => import('@/modules/Fascinator').then(m => ({ default: m.Fascinator })))
const Companion = lazy(() => import('@/modules/Companion').then(m => ({ default: m.Companion })))
const Notes      = lazy(() => import('@/modules/Notes').then(m => ({ default: m.Notes })))
const Todo       = lazy(() => import('@/modules/Todo').then(m => ({ default: m.Todo })))
const Fleeting   = lazy(() => import('@/modules/Fleeting').then(m => ({ default: m.Fleeting })))
const Shortcuts  = lazy(() => import('@/modules/Shortcuts').then(m => ({ default: m.Shortcuts })))
const Bookmarks  = lazy(() => import('@/modules/Bookmarks').then(m => ({ default: m.Bookmarks })))
const Plugins    = lazy(() => import('@/modules/Plugins').then(m => ({ default: m.Plugins })))
const Settings   = lazy(() => import('@/modules/Settings').then(m => ({ default: m.Settings })))

// v0.2 — real implementations
const Passwords  = lazy(() => import('@/modules/Passwords').then(m => ({ default: m.Passwords })))
const Detective  = lazy(() => import('@/modules/Detective').then(m => ({ default: m.Detective })))
const Travel     = lazy(() => import('@/modules/Travel').then(m => ({ default: m.Travel })))
const Institute  = lazy(() => import('@/modules/Institute').then(m => ({ default: m.Institute })))
const Learning   = lazy(() => import('@/modules/Learning').then(m => ({ default: m.Learning })))
const Music      = lazy(() => import('@/modules/Music').then(m => ({ default: m.Music })))
const Finance    = lazy(() => import('@/modules/Finance').then(m => ({ default: m.Finance })))
const Health     = lazy(() => import('@/modules/Health').then(m => ({ default: m.Health })))
const Creative   = lazy(() => import('@/modules/Creative').then(m => ({ default: m.Creative })))
const Network    = lazy(() => import('@/modules/Network').then(m => ({ default: m.Network })))
const Time       = lazy(() => import('@/modules/Time').then(m => ({ default: m.Time })))
const RPG        = lazy(() => import('@/modules/RPG').then(m => ({ default: m.RPG })))
const Data       = lazy(() => import('@/modules/Data').then(m => ({ default: m.Data })))
const Diary      = lazy(() => import('@/modules/Diary').then(m => ({ default: m.Diary })))
const Janitor    = lazy(() => import('@/modules/Downloads').then(m => ({ default: m.Downloads })))
const Toolkit    = lazy(() => import('@/modules/Toolkit').then(m => ({ default: m.Toolkit })))
const Academic   = lazy(() => import('@/modules/Academic').then(m => ({ default: m.Academic })))
const Games      = lazy(() => import('@/modules/Games').then(m => ({ default: m.Games })))
const Papers     = lazy(() => import('@/modules/Papers').then(m => ({ default: m.Papers })))

const Fallback: React.FC = () => (
    <div className="flex items-center justify-center h-full">
      <div className="pt-section-label text-text-lo">LOADING ······</div>
    </div>
)

export default function App() {
  const { active, enabledPlugins, setEnabledPlugins } = useApp()
  const [toasts, setToasts] = useState<{ id: number; title: string; message: string }[]>([])
  // FAS 陪伴层话语气泡（charon_bridge 下行，topic: fas.utterance）
  const [utterances, setUtterances] = useState<{ id: number; text: string; origin: string }[]>([])
  // Haru 存在感层状态（avatar_state 六态 + 屏幕采集可见指示）
  const [avatar, setAvatar] = useState<{ state: string; source: string } | null>(null)
  const [screenOn, setScreenOn] = useState<{ on: boolean; ts: number } | null>(null)

  // 启动时加载已启用的插件
  useEffect(() => {
    const loadEnabled = async () => {
      const plugins = await List()
      const enabled: Record<string, any> = {}
      for (const p of plugins) {
        if (await IsEnabled(p.id) && p.kind === 'panel') {
          enabled[p.id] = p
        }
      }
      setEnabledPlugins(enabled)
    }
    loadEnabled()
  }, [])

  // Bridge events — Fascinator (or any local tool) pushes notifications
  // and cross-module events through the reverse HTTP API.
  useEffect(() => {
    let n = 0
    const off = EventsOn('charon.notify', (data: any) => {
      const d = Array.isArray(data) ? data[0] : data
      const id = ++n
      setToasts(ts => [...ts, { id, title: d?.title ?? '通知', message: d?.message ?? '' }])
      setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 6000)
    })
    return () => { off?.() }
  }, [])

  // FAS 陪伴层话语下行（fas/companion/charon_bridge → Bridge /api/events）。
  // 全量写入 localStorage（含 reactive），Fascinator 面板 SPEAK 页据此翻历史；
  // 气泡只给 proactive / question 弹——reactive 回复聊天 UI 里已有，不重复。
  useEffect(() => {
    let n = 0
    const off = EventsOn('fas.utterance', (data: any) => {
      const u = Array.isArray(data) ? data[0] : data
      const text = String(u?.text ?? '').trim()
      const origin = String(u?.origin ?? 'reactive')
      if (!text) return
      try {
        const k = 'haru.speak.log'
        const arr = JSON.parse(localStorage.getItem(k) || '[]')
        // graph：调试用的"这条话所用图谱"（FAS refs.graph 随桥透传，缺省 null）
        arr.push({ id: Date.now() + Math.random(), role: 'haru', text, origin, ts: Date.now(),
                   graph: u?.refs?.graph ?? null })
        localStorage.setItem(k, JSON.stringify(arr.slice(-200)))
      } catch { /* 存储满/坏 → 放弃留档，不影响弹泡 */ }
      if (origin === 'reactive') return
      const id = ++n
      setUtterances(us => [...us, { id, text, origin }])
      setTimeout(() => setUtterances(us => us.filter(b => b.id !== id)), 8000)
    })
    return () => { off?.() }
  }, [])

  // 形象状态（Haru 在做什么：聆听/思考/说话/被打断…）——常驻徽标。
  useEffect(() => {
    const off = EventsOn('fas.avatar_state', (data: any) => {
      const d = Array.isArray(data) ? data[0] : data
      if (!d?.state) return
      setAvatar({ state: String(d.state), source: String(d.source ?? '') })
    })
    return () => { off?.() }
  }, [])

  // 屏幕观察可见指示：采集期间持续亮着，关闭后熄灭（隐私纪律的前端半边）。
  useEffect(() => {
    const off = EventsOn('fas.screen_state', (data: any) => {
      const d = Array.isArray(data) ? data[0] : data
      setScreenOn({ on: !!d?.on, ts: Date.now() })
    })
    return () => { off?.() }
  }, [])

// ───── 核心视图网关切换 ─────
  let content: React.ReactNode;

// 1. 优先拦截：如果当前激活项是启用的“非原生内置占位”的第三方动态插件
  if (enabledPlugins[active] && active !== "passwords") {
    content = <PluginPanel pluginId={active} />;
  } else {
    // 2. 走你原生的固定核心路由开关
    switch (active) {
      case 'dashboard':  content = <Dashboard />; break;
      case 'fascinator': content = <Fascinator />; break;
      case 'companion':   content = <Companion />; break;
      case 'notes':      content = <Notes />; break;
      case 'todo':       content = <Todo />; break;
      case 'fleeting':   content = <Fleeting />; break;
      case 'shortcuts':  content = <Shortcuts />; break;
      case 'bookmarks':  content = <Bookmarks />; break;

        // 💡 优雅无缝接管：当点击原生 Vault 菜单时进行识别检测
      case 'passwords':
        if (enabledPlugins["com.hellucigen.passwords"]) {
          // 如果系统后端识别到了该扩展，则原地接管，用 PluginPanel 刷出功能 UI
          content = <PluginPanel pluginId="com.hellucigen.passwords" />;
        } else {
          // 未加载或未启用时，仍然回退展示原汁原味的施工占位 Stub 界面
          content = <Passwords />;
        }
        break;

      case 'plugins':    content = <Plugins />; break;
      case 'settings':   content = <Settings />; break;
      case 'detective':  content = <Detective />; break;
      case 'travel':     content = <Travel />; break;
      case 'papers':     content = <Papers />; break;
      case 'institute':  content = <Institute />; break;
      case 'learning':   content = <Learning />; break;
      case 'academic':   content = <Academic />; break;
      case 'games':      content = <Games />; break;
      case 'music':      content = <Music />; break;
      case 'janitor':    content = <Janitor />; break;
      case 'toolkit':    content = <Toolkit />; break;
      case 'finance':    content = <Finance />; break;
      case 'health':     content = <Health />; break;
      case 'creative':   content = <Creative />; break;
      case 'network':    content = <Network />; break;
      case 'time':       content = <Time />; break;
      case 'rpg':        content = <RPG />; break;
      case 'data':       content = <Data />; break;
      case 'diary':      content = <Diary />; break;
      default:           content = <Dashboard />;
    }
  }

  return (
      <div className="flex h-screen w-screen overflow-hidden bg-bg text-text-hi">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto pt-stagger">
            <Suspense fallback={<Fallback />}>{content}</Suspense>
          </main>
        </div>
        <CommandPalette />
        <FleetingDrawer />
        {/* Haru 存在感徽标（右上常驻）：形象状态 + 采集指示 */}
        <div className="fixed top-3 right-4 z-50 flex items-center gap-2 pointer-events-none">
          {avatar && (() => {
            const M: Record<string, [string, string]> = {
              idle: ['待机', '#9ca3af'], listening: ['聆听中', '#22c55e'],
              thinking: ['思考中', '#f59e0b'], speaking: ['说话中', '#e8791b'],
              interrupted: ['被打断', '#a78bfa'], error: ['异常', '#ef4444'],
            }
            const [label, color] = M[avatar.state] ?? [avatar.state, '#9ca3af']
            return (
              <div className="pt-glass border border-edge px-3 py-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: color }} />
                <span className="pt-section-label" style={{ color }}>{label}</span>
              </div>
            )
          })()}
          {screenOn?.on && (
            <div className="pt-glass border border-sig-warn px-3 py-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sig-warn animate-pulse" />
              <span className="pt-section-label text-sig-warn">眼睛采集中</span>
            </div>
          )}
        </div>
        {/* FAS 陪伴话语气泡（proactive / question） */}
        <div className="fixed bottom-20 right-4 z-50 space-y-2 pointer-events-none">
          {utterances.map(u => (
            <div key={u.id} className="pt-glass border border-accent/40 px-4 py-3 max-w-sm animate-slide-up">
              <div className="pt-section-label text-accent text-[10px]">
                HARU · {u.origin === 'question' ? '提问' : '主动'}
              </div>
              <div className="text-sm text-text-hi mt-1 whitespace-pre-wrap">{u.text}</div>
            </div>
          ))}
        </div>
        {/* Bridge toast corner — messages pushed from Fascinator */}
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {toasts.map(t => (
            <div key={t.id} className="pt-glass border border-accent/50 px-4 py-3 max-w-sm">
              <div className="pt-section-label text-accent">{t.title}</div>
              <div className="text-xs text-text-mid mt-1">{t.message}</div>
            </div>
          ))}
        </div>
      </div>
  )
}