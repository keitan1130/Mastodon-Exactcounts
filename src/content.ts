// src/content.ts - HTML属性版（API不要）
const ENABLE_KEY = 'md_show_exact_counts'
const PROCESSED_ATTR = 'data-exact-count-processed'

async function isEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(ENABLE_KEY, (result) => {
      resolve(result[ENABLE_KEY] ?? true)
    })
  })
}

function replaceCountsFromAttributes() {
  // title属性やaria-label属性に完全な数値が含まれている要素を探す
  // Mastodonでは省略表記の要素に、マウスオーバー時のポップアップ用に正確な数値が格納されている
  const elements = document.querySelectorAll(`[title]:not([${PROCESSED_ATTR}]), [aria-label]:not([${PROCESSED_ATTR}])`)

  elements.forEach((el) => {
    const title = el.getAttribute('title')
    const ariaLabel = el.getAttribute('aria-label')

    // title や aria-label から数値を抽出
    // 例: "1,234 replies" → "1,234"
    // 例: "フォロワー: 5,678" → "5,678"
    const fullText = title || ariaLabel
    if (!fullText) return

    // 数値部分を抽出（カンマ付き数値に対応）
    const match = fullText.match(/[\d,]+/)
    if (!match) return

    const exactNumber = match[0] // "1,234" のような形式

    // 表示テキストが省略形（1.2k, 1.2K, 1.2m, 1.2M等）なら置き換え
    const displayText = el.textContent?.trim() ?? ''
    if (/^\d+(?:\.\d+)?[kKmM]$/.test(displayText)) {
      // テキストノードを探して置き換え
      const textNode = Array.from(el.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && /^\d+(?:\.\d+)?[kKmM]$/.test(n.textContent?.trim() ?? '')
      )
      if (textNode) {
        textNode.textContent = exactNumber
        // 処理済みマークを付ける
        el.setAttribute(PROCESSED_ATTR, 'true')
      }
    }
  })
}

// ページ読み込み時とDOM変更時に実行
async function init() {
  if (!(await isEnabled())) return

  // 初回実行
  replaceCountsFromAttributes()

  // MutationObserver で動的に追加される要素も監視
  const observer = new MutationObserver((mutations) => {
    // パフォーマンスのため、実際にノードが追加された場合のみ処理
    const hasAddedNodes = mutations.some(
      (mutation) => mutation.addedNodes.length > 0
    )
    if (hasAddedNodes) {
      replaceCountsFromAttributes()
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  // storage変更の監視（ポップアップでON/OFFされたとき）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[ENABLE_KEY]) {
      if (changes[ENABLE_KEY].newValue) {
        // ONにされた場合、処理済みマークをクリアして再実行
        document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((el) => {
          el.removeAttribute(PROCESSED_ATTR)
        })
        replaceCountsFromAttributes()
      } else {
        // OFFにされた場合はページをリロード（元に戻すため）
        location.reload()
      }
    }
  })
}

// Mastodonページかどうかを簡易チェック
function isMastodonPage(): boolean {
  // Mastodonの特徴的な要素をチェック
  const hasMastodonMeta = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.includes('Mastodon')
  const hasMastodonElements = document.querySelector('[class*="mastodon"]') !== null
  return hasMastodonMeta || hasMastodonElements
}

// マストドンページの場合のみ実行
if (isMastodonPage()) {
  init()
}

console.log('Mastodon Exact Counts: Content script loaded')
