import React, { useEffect, useState } from 'react'
import GlassPanel from '@/components/GlassPanel'
import { api } from '@/lib/api'
import { Plus, Trash2, FileText, FolderOpen, ExternalLink, Download } from 'lucide-react'

/* Papers — academic PDF reading queue: CRUD, folder scan + one-click
 * import, open/reveal the linked file. */

const STATUS: Record<string, string> = { todo: '待读', reading: '在读', done: '读完', cited: '已引用' }
const STATUS_KEYS = Object.keys(STATUS)

export const Papers: React.FC = () => {
  const [papers, setPapers] = useState<any[]>([])
  const [status, setStatus] = useState('')
  const [scanDir, setScanDir] = useState('')
  const [pdfs, setPdfs] = useState<any[]>([])
  const [form, setForm] = useState({ title: '', authors: '', venue: '', year: '' })

  const load = async () => setPapers(await api.papers.list(status) ?? [])
  useEffect(() => { load() }, [status])

  const scan = async () => setPdfs(await api.papers.scanPDFs(scanDir) ?? [])

  const save = async (p: any) => { await api.papers.save(p); load() }

  return (
    <div className="p-6 space-y-4">
      <GlassPanel title="PAPERS · 论文阅读队列" />

      <GlassPanel title="ADD · 手动录入" subtitle="或者从下方文件夹扫描直接导入">
        <div className="flex gap-2 mt-3 flex-wrap">
          <input className="pt-input pt-mono text-xs flex-1 min-w-[180px]" placeholder="标题 *"
            value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <input className="pt-input pt-mono text-xs w-32" placeholder="作者"
            value={form.authors} onChange={e => setForm({ ...form, authors: e.target.value })} />
          <input className="pt-input pt-mono text-xs w-32" placeholder="会议/期刊"
            value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} />
          <input className="pt-input pt-mono text-xs w-16" placeholder="年份"
            value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
          <button className="pt-btn pt-btn-primary" disabled={!form.title} onClick={async () => {
            await api.papers.save({ ...form, year: parseInt(form.year) || 0, status: 'todo' })
            setForm({ title: '', authors: '', venue: '', year: '' })
            load()
          }}><Plus size={13} /> 添加</button>
        </div>
      </GlassPanel>

      <GlassPanel title="SCAN · 从文件夹导入 PDF" subtitle="扫描目录中未被收录的 PDF,一键入队">
        <div className="flex gap-2 mt-3">
          <input className="pt-input flex-1 pt-mono text-xs" placeholder="文件夹绝对路径(如 C:\\Users\\…\\Downloads)"
            value={scanDir} onChange={e => setScanDir(e.target.value)} />
          <button className="pt-btn pt-btn-primary" disabled={!scanDir} onClick={scan}>
            <FolderOpen size={13} /> 扫描
          </button>
        </div>
        {pdfs.length > 0 && (
          <div className="mt-2 space-y-1 max-h-[200px] overflow-auto">
            {pdfs.map(f => (
              <div key={f.path} className="flex items-center gap-2 border border-edge px-3 py-1.5 text-xs">
                <FileText size={12} className="text-text-lo shrink-0" />
                <span className="flex-1 truncate" title={f.path}>{f.name}</span>
                <span className="pt-mono text-[10px] text-text-lo shrink-0">{(f.size / 1048576).toFixed(1)}MB</span>
                {f.imported
                  ? <span className="pt-mono text-[10px] text-text-lo shrink-0">已收录</span>
                  : <button className="pt-btn pt-btn-ghost text-xs shrink-0" onClick={async () => { await api.papers.importPDF(f.path); scan(); load() }}>
                      <Download size={11} /> 入队
                    </button>}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      <GlassPanel title={`QUEUE · ${papers.length} 篇`} subtitle="按收录时间倒序">
        <div className="flex gap-1.5 mt-3">
          <button className={`pt-btn text-xs ${status === '' ? 'pt-btn-primary' : ''}`} onClick={() => setStatus('')}>全部</button>
          {STATUS_KEYS.map(k => (
            <button key={k} className={`pt-btn text-xs ${status === k ? 'pt-btn-primary' : ''}`} onClick={() => setStatus(k)}>
              {STATUS[k]}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-1 max-h-[420px] overflow-auto">
          {papers.map(p => (
            <div key={p.id} className="border border-edge px-3 py-2 text-xs group">
              <div className="flex items-center gap-2">
                <select className="pt-input pt-mono text-[10px] w-16 shrink-0" value={p.status}
                  onChange={e => save({ ...p, status: e.target.value })}>
                  {STATUS_KEYS.map(k => <option key={k} value={k}>{STATUS[k]}</option>)}
                </select>
                <span className="flex-1 truncate text-sm">{p.title}</span>
                {p.pdf_path && <>
                  <button className="text-accent opacity-0 group-hover:opacity-100 shrink-0" title="打开 PDF"
                    onClick={() => api.papers.open(p.id)}><ExternalLink size={12} /></button>
                  <button className="text-text-lo hover:text-accent opacity-0 group-hover:opacity-100 shrink-0" title="所在位置"
                    onClick={() => api.papers.open(p.id, 'reveal')}><FolderOpen size={12} /></button>
                </>}
                <button className="text-sig-error shrink-0" onClick={async () => { await api.papers.delete(p.id); load() }}>
                  <Trash2 size={11} />
                </button>
              </div>
              <div className="text-text-lo pt-mono text-[10px] mt-1 flex gap-3">
                {p.authors && <span className="truncate max-w-[300px]">{p.authors}</span>}
                {p.venue && <span>{p.venue}</span>}
                {p.year > 0 && <span>{p.year}</span>}
              </div>
            </div>
          ))}
          {papers.length === 0 && <div className="text-xs text-text-lo py-2">队列为空</div>}
        </div>
      </GlassPanel>
    </div>
  )
}

export default Papers
