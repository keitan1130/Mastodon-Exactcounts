# Mastodon — 投稿数を1の位まで正確に表示するブラウザ拡張

**技術スタック**

* Vite
* React + TypeScript
* @crxjs/vite-plugin（CRXJS） — Vite プラグインで拡張をバンドル
* Manifest V3（Chromium 系）

**目的（シンプル）**

* Mastodon の UI で表示される投稿の投稿数（返信 / ブースト / いいね 等）を、`1.2k` のような省略表記から「正確な数値（例：1204）」に置き換え表示する。
* 拡張のポップアップは **ON / OFF の切り替え** のみ。これ以外の機能は不要。

---

## 動作の大まかな方針(実装戦略)

### HTML属性から取得（シンプル・軽量）

1. **content script** を Mastodon のウェブ UI に注入する。
2. Mastodonの標準UIでは、省略表記（`1.2k`）を表示している要素に、**`title` 属性や `aria-label` 属性などで完全な数値が含まれている**。マウスオーバー時にポップアップで表示される正確な数値がこれらの属性に格納されています。
3. 該当要素から `title` 属性や `aria-label` 属性を読み取り、その値を表示テキストとして置き換える。
4. この方法なら **API呼び出し不要** で、ページ読み込み時に即座に変換でき、軽量で高速。
5. ポップアップで ON/OFF 切り替えを実装し、`chrome.storage.sync` に状態を保存する。

**対象となる数値：**
- 投稿数（返信・ブースト・いいね）
- アカウント情報（フォロワー数・フォロー中の数）

**メリット：**
- ✅ API呼び出し不要で軽量・高速
- ✅ ネットワークトラフィック削減
- ✅ マストドンが既に持っている正確なデータを活用
- ✅ シンプルな実装

> 注意：この拡張は**すべてのマストドンインスタンス**で動作するように設計されています。manifest の `matches` と `host_permissions` は `https://*/*` と `http://*/*` を指定し、任意のインスタンス(mastodon.social、mstdn.jp、その他すべて)で利用可能です。

---

## プロジェクト構成（推奨）

```
my-mastodon-counts/               # リポジトリルート
├─ manifest.json                  # 拡張の manifest（MV3）
├─ vite.config.ts                 # Vite + CRXJS 設定
├─ package.json
├─ src/
│  ├─ content.ts                  # content script（DOM 操作）
│  ├─ background.ts               # （必要なら）サービスワーカー
│  ├─ popup/                      # React + TS で作る popup
│  │  ├─ index.html
│  │  ├─ main.tsx
│  │  └─ Popup.tsx
│  └─ utils/
│     └─ numbers.ts               # 数値フォーマット（必要なら）
├─ public/                        # static assets（必要なら）
└─ README.md
```

---

## 主要ファイル例（テンプレ）

### `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
})
```

### `manifest.json`(例)

> **全インスタンス対応**：`matches` と `host_permissions` は `https://*/*` と `http://*/*` を指定し、すべてのマストドンインスタンスで動作します。

```json
{
  "manifest_version": 3,
  "name": "Mastodon Exact Counts",
  "version": "0.1.0",
  "description": "Show Mastodon post counts (replies/reblogs/favourites) in full instead of abbreviated 1.2k",

  "action": {
    "default_popup": "popup/index.html"
  },

  "background": {
    "service_worker": "src/background.ts"
  },

  "content_scripts": [
    {
      "matches": [
        "https://*/*",
        "http://*/*"
      ],
      "js": ["src/content.ts"],
      "run_at": "document_idle"
    }
  ],

  "permissions": ["storage"],
  "host_permissions": [
    "https://*/*",
    "http://*/*"
  ]
}
```

---

## content script の実装要点（例：`src/content.ts`）

### HTML属性から取得（推奨実装）

```ts
// src/content.ts - HTML属性版（API不要）
const ENABLE_KEY = 'md_show_exact_counts'

async function isEnabled() {
  const s = await chrome.storage.sync.get(ENABLE_KEY)
  return s[ENABLE_KEY] ?? true
}

function replaceCountsFromAttributes() {
  // title属性やaria-label属性に完全な数値が含まれている要素を探す
  // Mastodonでは省略表記の要素に、マウスオーバー時のポップアップ用に正確な数値が格納されている
  const elements = document.querySelectorAll('[title], [aria-label]')

  elements.forEach(el => {
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
      const textNode = Array.from(el.childNodes).find(n => n.nodeType === Node.TEXT_NODE)
      if (textNode) {
        textNode.textContent = exactNumber
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
  const observer = new MutationObserver(() => {
    replaceCountsFromAttributes()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })

  // storage変更の監視（ポップアップでON/OFFされたとき）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[ENABLE_KEY]) {
      if (changes[ENABLE_KEY].newValue) {
        replaceCountsFromAttributes()
      } else {
        // OFFにされた場合はページをリロード（元に戻すため）
        location.reload()
      }
    }
  })
}

init()
```

> **実装ヒント**：開発者ツールで該当する数値要素（返信・ブースト・いいね・フォロワー・フォロー中）を調べ、`title` 属性や `aria-label` 属性に完全な数値が含まれているか確認してください。マストドンの標準UIでは、マウスオーバー時のポップアップに表示される完全な数値が、これらの属性に格納されています。

---

## ポップアップ（React + TS）

* ポップアップは **ON / OFF スイッチ** のみ。
* `chrome.storage.sync` に `md_show_exact_counts = true|false` を保存する。
* popup を開いたときに現在値を読み込み、トグルで更新する。

#### Popup の簡易コード（抜粋）

```tsx
// src/popup/Popup.tsx
import React, { useEffect, useState } from 'react'

export default function Popup() {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    chrome.storage.sync.get('md_show_exact_counts', (r) => {
      setEnabled(r.md_show_exact_counts ?? true)
    })
  }, [])

  function toggle() {
    const next = !enabled
    chrome.storage.sync.set({ md_show_exact_counts: next })
    setEnabled(next)
    // content script は storage の変更を監視して挙動を切り替える
  }

  return (
    <div style={{ padding: 12, width: 200 }}>
      <h3>Mastodon Exact Counts</h3>
      <label>
        <input type="checkbox" checked={enabled} onChange={toggle} /> Enabled
      </label>
    </div>
  )
}
```

---

## 開発手順（実際にやること）

### 1) プロジェクトを作る

```bash
# vite の React + TS テンプレで開始
npm create vite@latest my-mastodon-counts -- --template react-ts
cd my-mastodon-counts
npm install

# 必要パッケージを追加
npm install -D @crxjs/vite-plugin
# もし React の新しい JSX を使うなら @vitejs/plugin-react ではなく @vitejs/plugin-react-swc など選択可
npm install react react-dom
```

### 2) `vite.config.ts` と `manifest.json` を追加

* 上記の雛形をコピーしてプロジェクトルートに置く。
* `content.ts`, `popup/*`, `background.ts` を作成する。

### 3) content script を実装して動作確認

* ローカルの Mastodon インスタンス（または public インスタンス）でページを開きながら開発する。

### 4) Vite の dev server を起動（CRXJS は拡張のホットリロードをサポート）

```bash
npm run dev
# あるいは package.json に "dev": "vite" を追加して実行
```

* CRXJS は `vite` の HMR を活かして popup の UI を更新できます。content script の変更はビルドや reload を要するケースがあります。

### 5) ブラウザに unpacked として読み込む

* `npm run build`（後述）で出力 → 出力フォルダ（例：`dist`）をブラウザの拡張機能ページで読み込む。
* Chrome 系： `chrome://extensions/` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」→ `dist` を選択

### 6) ビルド & パッケージ

```bash
# package.json に "build": "vite build" を設定しておく
npm run build
```

* CRXJS は manifest をもとに適切にバンドルを出力します。

---

## デバッグのコツ

* content script は対象ページのコンテキストで動くので、開発者ツールの「Elements / Console」を使って selector や属性値を確認する。
* 開発者ツールで数値要素を選択し、`title` や `aria-label` 属性に正確な数値が含まれているか確認する。
* `chrome.storage` の変更は `chrome.storage.onChanged.addListener` で content script 側で監視し、即時 ON/OFF を切り替えられるようにする。

---

## 権限とプライバシー

* **host_permissions を広く許可**：この拡張は `https://*/*` と `http://*/*` を許可しており、すべてのウェブサイトにアクセスできます。これにより、mastodon.social、mstdn.jp、その他あらゆるマストドンインスタンスで動作します。
* **実際の動作範囲**：content script 内でマストドンのページかどうかを判定し、マストドン以外のサイトでは何も実行しないように実装することで、実質的な影響範囲を限定します。
* **データの取り扱い**：この拡張はページ内のHTML属性（`title`や`aria-label`）から数値を読み取るのみで、外部APIへの通信は行いません。個人のパスワードやプライベートな情報は扱いません。
* **注意**：広範な権限を要求するため、Chrome Web Store での公開時はレビューが厳しくなる可能性があります。ユーザーには「すべてのウェブサイトのデータの読み取りと変更」という警告が表示されます。

---

## 既知の制約 / 注意点

* Mastodon の UI やインスタンス実装によっては、HTML属性の構造が変わることがあるため、content script のセレクタは定期的にメンテナンスが必要になる可能性があります。
* 一部のカスタムテーマやインスタンス固有のUIでは、`title`属性や`aria-label`属性の形式が異なる場合があります。
* **広範な権限について**：この拡張はすべてのウェブサイトにアクセスする権限を持ちますが、実際にはマストドンのページでのみ動作するように実装することを強く推奨します。content script 内で `window.location.hostname` や DOM 構造をチェックし、マストドンインスタンスでない場合は早期リターンする処理を入れてください。

---

## 追加メンテナンス案(任意)

* 処理済み要素にマークを付けて、同じ要素を何度も処理しないようにする（パフォーマンス向上）
* content script 内でマストドンインスタンスを自動検出する仕組み（例：特徴的な DOM 要素の検出）を実装し、マストドン以外のサイトでは何もしないようにする
* より詳細なセレクタを使って、特定の数値要素のみをターゲットにする（誤検出の防止）

---

## 参考（実装・配布時に参照するドキュメント）

* @crxjs/vite-plugin (CRXJS) — npm / GitHub
* Chrome Extensions Manifest V3 ドキュメント
* MDN - MutationObserver API
* MDN - HTML title attribute / aria-label

---

## ライセンス

* お好みのライセンスを選択してください（例：MIT）

---

### 最後に

この README は最小限の機能(投稿数を正確表示、popup の ON/OFF)に特化した開発手順と実装ガイドです。

**全インスタンス対応について：**
この拡張はすべてのマストドンインスタンス(mastodon.social、mstdn.jp、misskey.io、その他あらゆるインスタンス)で動作するように設計されています。実際の DOM セレクタは環境によって変わる可能性があるため、まずは**開発者ツールで投稿のパーマリンクと数表示の要素**を確認してから `src/content.ts` のセレクタを調整してください。

**セキュリティとパフォーマンスのベストプラクティス：**
- content script の最初で、ページがマストドンインスタンスかどうかを判定する処理を入れることを強く推奨します
- 例：特定の DOM 要素（`[data-react-class*="Mastodon"]` や `#mastodon` など）の存在確認
- 処理済み要素にマークを付けて、重複処理を避ける（`data-processed` 属性など）
- MutationObserver のコールバックは頻繁に呼ばれるため、パフォーマンスに注意
