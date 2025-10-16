// src/content.ts - HTML属性版（API不要）
const ENABLE_KEY = 'md_show_exact_counts'
const PROCESSED_ATTR = 'data-exact-count-processed'

// chrome.storage が利用可能かチェック
function isChromeStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.sync
}

async function isEnabled(): Promise<boolean> {
  if (!isChromeStorageAvailable()) {
    console.warn('chrome.storage is not available')
    return true
  }

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
        // strong要素の構造を保持するため、最も内側のテキストノードを持つspan要素を探す
        // 構造: <strong><span><span>1.3</span>K</span></strong>
        // 最初の子spanを取得
        const outerSpan = strongEl.querySelector('span')
        if (outerSpan) {
          // その中の最初の子spanを取得（数値部分）
          const innerSpan = outerSpan.querySelector('span')
          if (innerSpan) {
            // 元の省略形の数値部分と正確な数値の両方を保存
            const abbreviatedNumber = innerSpan.textContent?.trim() ?? '' // 例: "1.3"
            const unit = text.slice(abbreviatedNumber.length) // 例: "K"

            // outerSpanに属性を保存（構造が変わっても見つけられるように）
            outerSpan.setAttribute('data-abbreviated', abbreviatedNumber)
            outerSpan.setAttribute('data-exact', exactNumber) // 例: "1,262"
            outerSpan.setAttribute('data-unit', unit) // 例: "K"

            // 親要素に処理済みマークを付ける
            el.setAttribute(PROCESSED_ATTR, 'true')
          }
        }
      }
    })
  })
}

function updateDisplayedCounts(showExact: boolean) {
  // 保存された値を使って表示を切り替える
  const processedLinks = document.querySelectorAll(`[${PROCESSED_ATTR}]`)

  processedLinks.forEach((el) => {
    // outerSpanを探す（data属性がついている要素）
    const outerSpans = el.querySelectorAll('span[data-abbreviated][data-exact]')

    outerSpans.forEach((outerSpan) => {
      const abbreviated = outerSpan.getAttribute('data-abbreviated')
      const exact = outerSpan.getAttribute('data-exact')
      const unit = outerSpan.getAttribute('data-unit')

      if (!abbreviated || !exact) return

      const currentText = outerSpan.textContent?.trim()
      const targetText = showExact ? exact : `${abbreviated}${unit ?? ''}`

      if (currentText === targetText) {
        return // 変更不要
      }

      if (showExact) {
        // 正確な値を表示する場合
        // span全体のテキストを正確な値に置き換え
        outerSpan.textContent = exact
      } else {
        // 省略形に戻す場合
        // 元の構造を復元: <span><span>1.3</span>K</span>
        outerSpan.innerHTML = `<span>${abbreviated}</span>${unit ?? ''}`
      }
    })
  })
}

// ページ読み込み時とDOM変更時に実行
async function init() {
  if (!isChromeStorageAvailable()) {
    console.error('chrome.storage is not available, extension cannot function')
    return
  }

  const enabled = await isEnabled()

  // 初回は両方の値を保存
  storeBothValues()

  // 現在の設定に応じて表示を更新
  updateDisplayedCounts(enabled)

  let observerPaused = false

  // MutationObserver で動的に追加される要素も監視
  const observer = new MutationObserver((mutations) => {
    // 自分の変更による呼び出しを無視
    if (observerPaused) return

    // パフォーマンスのため、実際にノードが追加された場合のみ処理
    const hasAddedNodes = mutations.some(
      (mutation) => mutation.addedNodes.length > 0
    )
    if (hasAddedNodes) {
      // 新しい要素の値を保存
      storeBothValues()
      // 現在の設定に応じて表示を更新
      isEnabled().then((enabled) => {
        // Observer を一時停止
        observerPaused = true
        updateDisplayedCounts(enabled)
        // 次のイベントループで再開
        setTimeout(() => {
          observerPaused = false
        }, 0)
      })
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  // storage変更の監視（ポップアップでON/OFFされたとき）
  // init内に移動してMastodonページでのみ登録
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[ENABLE_KEY]) {
      // Observer を一時停止
      observerPaused = true
      // リロードせずに表示を切り替え
      updateDisplayedCounts(changes[ENABLE_KEY].newValue)
      // 次のイベントループで再開
      setTimeout(() => {
        observerPaused = false
      }, 0)
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
