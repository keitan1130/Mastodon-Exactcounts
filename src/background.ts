// src/background.ts - サービスワーカー（最小限）
// 拡張機能のインストール時にデフォルト設定を保存
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ md_show_exact_counts: true })
  console.log('Mastodon Exact Counts: Extension installed')
})

// 必要に応じて他のバックグラウンド処理をここに追加
export {}
