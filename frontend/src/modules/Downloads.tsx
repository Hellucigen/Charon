import React, { useEffect, useState } from 'react'
import GlassPanel from '@/components/GlassPanel'
import { api } from '@/lib/api'
import { RefreshCw, FolderOpen, ExternalLink, Trash2, ArrowRightCircle, FileText } from 'lucide-react'

/* Downloads janitor — flat inventory of the Downloads folder with
 * open / reveal / move / trash actions for quick filing. */

const KIND_LABEL: Record<string, string> = {
  image: '图片', pdf: 'PDF', doc: '文档', archive: '压缩包',
  audio: '音频', video: '视频', text: '文本', other: '其他',
}

export const Downloads: React.FC = () => {
  const [dir, setDir] = useState('')
  const [dest, setDest] = useState('')
  const [items, setItems] = useState<any[]>([])
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState('')

  const load = async (d?: string) => {
    const target = d ?? dir
    setItems(await api.janitor.scan(target) ?? [])
  }
  useEffect(() => {
    (async () => {
      const def = await api.janitor.downloadsDir()
      setDir(def || '')
      setItems(await api.janitor.scan(def) ?? [])
    })()
  }, [])

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3000) }

  const kinds = Array.from(new Set(items.map(i => i.kind)))
  const shown = filter ? items.filter(i => i.kind === filter) : items

  return (
    <div className="p-6 space-y-4">
      <GlassPanel title="DOWNLOADS · 下载整理器" />

      <GlassPanel title="SCAN · 扫描目录" subtitle="默认用户 Downloads,可改任意文件夹">
        <div className="flex gap-2 mt-3">
          <input className="pt-input flex-1 pt-mono text-xs" placeholder="文件夹绝对路径"
            value={dir} onChange={e => setDir(e.target.value)} />
          <button className="pt-btn pt-btn-primary" onClick={() => load()}>
            <RefreshCw size={13} /> 扫描
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          <input className="pt-input flex-1 pt-mono text-xs" placeholder="归档目标文件夹(如 E:\\Archive\\2026)"
            value={dest} onChange={e => setDest(e.target.value)} />
        </div>
        {msg && <div className="text-xs text-accent mt-2 pt-mono">{msg}</div>}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          <button className={`pt-btn text-xs ${filter === '' ? 'pt-btn-primary' : ''}`} onClick={() => setFilter('')}>全部 {items.length}</button>
          {kinds.map(k => (
            <button key={k} className={`pt-btn text-xs ${filter === k ? 'pt-btn-primary' : ''}`} onClick={() => setFilter(k)}>
              {KIND_LABEL[k] ?? k} {items.filter(i => i.kind === k).length}
            </button>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel title={`FILES · ${shown.length} 个文件`}>
        <div className="space-y-1 max-h-[480px] overflow-auto">
          {shown.map(it => (
            <div key={it.path} className="flex items-center gap-2 border border-edge px-3 py-1.5 text-xs group hover:border-accent/50">
              <FileText size={12} className="text-text-lo shrink-0" />
              <span className="flex-1 truncate" title={it.path}>{it.name}</span>
              <span className="pt-mono text-[10px] text-text-lo shrink-0 w-16 text-right">{(it.size / 1048576).toFixed(2)}MB</span>
              <span className="pt-mono text-[10px] text-text-lo shrink-0 w-24 text-right">
                {new Date(it.mtime * 1000).toLocaleDateString()}
              </span>
              <span className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100">
                <button className="text-accent" title="打开" onClick={() => api.janitor.open(it.path)}><ExternalLink size={12} /></button>
                <button className="text-text-lo hover:text-accent" title="所在位置" onClick={() => api.janitor.reveal(it.path)}><FolderOpen size={12} /></button>
                <button className="text-text-lo hover:text-accent" title={dest ? `移动到 ${dest}` : '先填归档目标'}
                  onClick={async () => {
                    if (!dest) { flash('先填写归档目标文件夹'); return }
                    await api.janitor.move(it.path, dest)
                    flash(`已移动: ${it.name}`)
                    load()
                  }}><ArrowRightCircle size={12} /></button>
                <button className="text-sig-error" title="移入回收(可逆)" onClick={async () => {
                  await api.janitor.trash(it.path)
                  flash(`已移入回收: ${it.name}`)
                  load()
                }}><Trash2 size={12} /></button>
              </span>
            </div>
          ))}
          {shown.length === 0 && <div className="text-xs text-text-lo py-3">目录为空</div>}
        </div>
        <div className="text-[10px] pt-mono text-text-lo mt-2">
          回收 = 移动到 ~/.personal-terminal/trash/ · 不会真删
        </div>
      </GlassPanel>
    </div>
  )
}

export default Downloads
