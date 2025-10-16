// src/popup/Popup.tsx
import { useEffect, useState } from 'react'
import './Popup.css'

export default function Popup() {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // 現在の設定を読み込む
    chrome.storage.sync.get('md_show_exact_counts', (result) => {
      setEnabled(result.md_show_exact_counts ?? true)
      setLoading(false)
    })

    // ダークモードの検出
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDark(darkModeQuery.matches)

    // ダークモードの変更を監視
    const handleChange = (e: MediaQueryListEvent) => setIsDark(e.matches)
    darkModeQuery.addEventListener('change', handleChange)

    return () => darkModeQuery.removeEventListener('change', handleChange)
  }, [])

  function toggle() {
    const next = !enabled
    chrome.storage.sync.set({ md_show_exact_counts: next })
    setEnabled(next)
  }

  const themeClass = isDark ? 'dark' : 'light'

  if (loading) {
    return (
      <div className={`popup-container ${themeClass}`}>
        <p>読み込み中...</p>
      </div>
    )
  }

  return (
    <div className={`popup-container ${themeClass}`}>
      <h2 className="popup-title">
        Mastodon Exact Counts
      </h2>

      <div className={`popup-card ${themeClass}`}>
        <label className="popup-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={toggle}
            className="popup-checkbox"
          />
          <span className="popup-label-text">
            {enabled ? '有効' : '無効'}
          </span>
        </label>
      </div>

      <p className={`popup-description ${themeClass}`}>
        投稿数、FF数を省略せずに表示します。
      </p>
    </div>
  )
}
