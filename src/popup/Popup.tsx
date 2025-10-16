// src/popup/Popup.tsx
import { useEffect, useState } from 'react'

export default function Popup() {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 現在の設定を読み込む
    chrome.storage.sync.get('md_show_exact_counts', (result) => {
      setEnabled(result.md_show_exact_counts ?? true)
      setLoading(false)
    })
  }, [])

  function toggle() {
    const next = !enabled
    chrome.storage.sync.set({ md_show_exact_counts: next })
    setEnabled(next)
  }

  if (loading) {
    return (
      <div style={{ padding: 20, width: 250, fontFamily: 'system-ui, sans-serif' }}>
        <p>読み込み中...</p>
      </div>
    )
  }

  return (
    <div style={{
      padding: 20,
      width: 250,
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#f5f5f5'
    }}>
      <h2 style={{
        margin: '0 0 16px 0',
        fontSize: '18px',
        color: '#333'
      }}>
        Mastodon Exact Counts
      </h2>

      <div style={{
        marginBottom: 16,
        padding: 12,
        backgroundColor: 'white',
        borderRadius: 8,
        border: '1px solid #ddd'
      }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          fontSize: '14px'
        }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={toggle}
            style={{
              marginRight: 8,
              width: 18,
              height: 18,
              cursor: 'pointer'
            }}
          />
          <span style={{ fontWeight: 500 }}>
            {enabled ? '有効' : '無効'}
          </span>
        </label>
      </div>

      <p style={{
        margin: 0,
        fontSize: '12px',
        color: '#666',
        lineHeight: 1.4
      }}>
        投稿の数値（返信・ブースト・いいね・フォロワー等）を省略せずに表示します。
      </p>
    </div>
  )
}
