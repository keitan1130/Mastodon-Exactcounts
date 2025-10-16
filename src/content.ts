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
  // プロフィールの投稿数・フォロー数・フォロワー数のみを対象にする
  // account__header__extra__links クラス内の要素のみを処理
  const profileLinks = document.querySelectorAll(`.account__header__extra__links a[title]:not([${PROCESSED_ATTR}])`)

  profileLinks.forEach((el) => {
    const title = el.getAttribute('title')
    if (!title) return

    // 数値部分を抽出（カンマ付き数値に対応）
    const match = title.match(/[\d,]+/)
    if (!match) return

    const exactNumber = match[0] // "1,262" のような形式

    // この要素内の直接の子孫にある strong 要素を探す
    // 例: <a title="1,262"><span><strong><span><span>1.3</span>K</span></strong> 投稿</span></a>
    const strongElements = el.querySelectorAll('strong')

    strongElements.forEach((strongEl) => {
      const text = strongEl.textContent?.trim() ?? ''

      // 省略形のパターンをチェック（1.3K、1.3k、1.3M等）
      // 完全一致する場合のみ置き換える
      if (/^\d+(?:\.\d+)?[kKmM]$/.test(text)) {
        // strongの中身を完全に置き換える
        strongEl.innerHTML = exactNumber

        // 親要素に処理済みマークを付ける
        el.setAttribute(PROCESSED_ATTR, 'true')
      }
    })
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
