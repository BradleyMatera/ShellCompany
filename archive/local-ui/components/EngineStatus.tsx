"use client"
import React, { useEffect, useState } from 'react'

export default function EngineStatus() {
  const [status, setStatus] = useState<any>(null)
  const [models, setModels] = useState<string[]>([])
  const [statusError, setStatusError] = useState<string | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)

  useEffect(() => {
    fetch('http://localhost:3001/api/engine/status')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => { setStatus(data); setStatusError(null) })
      .catch((err) => { setStatus(null); setStatusError(err.message || 'Failed to fetch') })

    fetch('http://localhost:3001/api/ollama/models')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => { setModels(Array.isArray(d.models) ? d.models : []); setModelsError(null) })
      .catch((err) => { setModels([]); setModelsError(err.message || 'Failed to fetch') })
  }, [])

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="p-6 rounded-lg bg-slate-700/50">
        <h2 className="text-2xl font-semibold">Engine Status</h2>
        {!status && <p className="text-slate-400">Unable to load status.</p>}
        {statusError && <p className="text-red-400">Error: {statusError}</p>}
        {status && (
          <div className="mt-4">
            <div className="text-slate-300">Active: <span className="font-mono">{status.active || 'n/a'}</span></div>
            <div className="text-slate-300">Queue: <span className="font-mono">{status.queue || 0}</span></div>
            <div className="text-slate-300 mt-2">Providers:</div>
            <ul className="mt-2 list-disc list-inside text-slate-200">
              {Object.entries(status.providers || {}).map(([k, v]: any) => (
                <li key={k}>{k}: {v.reachable ? 'online' : 'offline'}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="p-6 rounded-lg bg-slate-700/50">
        <h2 className="text-2xl font-semibold">Ollama Models</h2>
        {models.length === 0 && <p className="text-slate-400">No models found (check Ollama server).</p>}
        {modelsError && <p className="text-red-400">Error: {modelsError}</p>}
        {models.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-2">
            {models.map(m => (
              <div key={m} className="p-3 rounded bg-slate-800/60 flex items-center justify-between">
                <div>{m}</div>
                <div className="text-xs text-slate-400">select</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
