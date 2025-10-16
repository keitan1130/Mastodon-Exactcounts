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

function storeBothValues() {
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
      // 完全一致する場合のみ保存する
      if (/^\d+(?:\.\d+)?[kKmM]$/.test(text)) {
        // 元の省略形と正確な数値の両方を保存
        strongEl.setAttribute('data-abbreviated', text) // 例: "1.3K"
        strongEl.setAttribute('data-exact', exactNumber) // 例: "1,262"

        // 親要素に処理済みマークを付ける
        el.setAttribute(PROCESSED_ATTR, 'true')
      }
    })
  })
}

function updateDisplayedCounts(showExact: boolean) {
  // 保存された値を使って表示を切り替える
  const processedLinks = document.querySelectorAll(`[${PROCESSED_ATTR}]`)

  processedLinks.forEach((el) => {
    const strongElements = el.querySelectorAll('strong[data-abbreviated][data-exact]')

    strongElements.forEach((strongEl) => {
      const abbreviated = strongEl.getAttribute('data-abbreviated')
      const exact = strongEl.getAttribute('data-exact')

      if (showExact && exact) {
        strongEl.innerHTML = exact
      } else if (!showExact && abbreviated) {
        strongEl.innerHTML = abbreviated
      }
    })
  })
}

// ページ読み込み時とDOM変更時に実行
async function init() {
  const enabled = await isEnabled()

  // 初回は両方の値を保存
  storeBothValues()

  // 現在の設定に応じて表示を更新
  updateDisplayedCounts(enabled)

  // MutationObserver で動的に追加される要素も監視
  const observer = new MutationObserver((mutations) => {
    // パフォーマンスのため、実際にノードが追加された場合のみ処理
    const hasAddedNodes = mutations.some(
      (mutation) => mutation.addedNodes.length > 0
    )
    if (hasAddedNodes) {
      // 新しい要素の値を保存
      storeBothValues()
      // 現在の設定に応じて表示を更新
      isEnabled().then((enabled) => {
        updateDisplayedCounts(enabled)
      })
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

// storage変更の監視（ポップアップでON/OFFされたとき）
// 有効/無効に関係なく常にリスナーを登録
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[ENABLE_KEY]) {
    // リロードせずに表示を切り替え
    updateDisplayedCounts(changes[ENABLE_KEY].newValue)
  }
})

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
