'use client'

import { useRef, useState } from 'react'

export default function TestPage() {
  const [status, setStatus] = useState('waiting…')
  const t4Ref = useRef<HTMLInputElement>(null)
  const t5CamRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', fontSize: 16 }}>
      <h2>File input test</h2>
      <p style={{ wordBreak: 'break-all', background: '#eee', padding: 8 }}>{status}</p>

      {/* Test 1: plain visible input with React onChange */}
      <p>Test 1 — plain input (React onChange):</p>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0]
          setStatus(f ? `T1 onChange: ${f.name} ${f.size}b` : 'T1 onChange: no file')
        }}
      />

      <br /><br />

      {/* Test 2: plain visible input with native listener */}
      <p>Test 2 — plain input (native addEventListener):</p>
      <input
        type="file"
        accept="image/*"
        ref={(el) => {
          if (!el) return
          el.onchange = function () {
            const f = (this as HTMLInputElement).files?.[0]
            setStatus(f ? `T2 onchange: ${f.name} ${f.size}b` : 'T2 onchange: no file')
          }
        }}
      />

      <br /><br />

      {/* Test 4: button triggers hidden input via ref.click() */}
      <p>Test 4 — button → ref.click() → hidden input:</p>
      <button
        onClick={() => t4Ref.current?.click()}
        style={{ padding: '8px 16px', background: 'green', color: 'white', borderRadius: 8 }}
      >
        Pick file
      </button>
      <input
        ref={t4Ref}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          setStatus(f ? `T4 onChange: ${f.name} ${f.size}b` : 'T4: no file')
        }}
      />
      <br /><br />

      {/* Test 6: appearance:none — file input styled directly as a button, fully visible */}
      <p>Test 6 — appearance:none styled as button:</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <input
          type="file" accept="image/*" capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0]
            setStatus(f ? `T6-cam: ${f.name} ${f.size}b` : 'T6-cam: no file')
          }}
          style={{ flex: 1, padding: '12px 0', background: '#000', color: '#fff', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 500, textAlign: 'center', cursor: 'pointer', WebkitAppearance: 'none', appearance: 'none' }}
        />
        <input
          type="file" accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0]
            setStatus(f ? `T6-gal: ${f.name} ${f.size}b` : 'T6-gal: no file')
          }}
          style={{ flex: 1, padding: '12px 0', background: '#fff', color: '#000', borderRadius: 12, border: '1px solid #ccc', fontSize: 14, fontWeight: 500, textAlign: 'center', cursor: 'pointer', WebkitAppearance: 'none', appearance: 'none' }}
        />
      </div>

      <br />

      {/* Test 5: opacity 0.001 full-size input directly on top of styled div (no label, no .click()) */}
      <p>Test 5 — opacity:0.001 full-size input over button:</p>
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Camera */}
        <div style={{ position: 'relative', flex: 1 }}>
          <div style={{ padding: '12px 0', background: '#000', color: '#fff', borderRadius: 12, textAlign: 'center', fontSize: 14, fontWeight: 500 }}>Camera</div>
          <input
            ref={t5CamRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0]
              setStatus(f ? `T5-cam: ${f.name} ${f.size}b` : 'T5-cam: no file')
            }}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.001, cursor: 'pointer' }}
          />
        </div>
        {/* Gallery */}
        <div style={{ position: 'relative', flex: 1 }}>
          <div style={{ padding: '12px 0', background: '#fff', color: '#000', borderRadius: 12, textAlign: 'center', fontSize: 14, fontWeight: 500, border: '1px solid #ccc' }}>Gallery</div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0]
              setStatus(f ? `T5-gal: ${f.name} ${f.size}b` : 'T5-gal: no file')
            }}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.001, cursor: 'pointer' }}
          />
        </div>
      </div>
    </div>
  )
}
