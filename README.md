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

## 動作の大まかな方針（実装戦略）

1. **content script** を Mastodon のウェブ UI に注入する。
2. 各投稿要素から「投稿のパーマリンク（URL）」または投稿 ID を抽出し、そのインスタンス（同一オリジン）の Mastodon API `GET /api/v1/statuses/:id` を呼んで正確なメタデータ（`replies_count`, `reblogs_count`, `favourites_count`）を取得する。

   * ページと同一オリジンに対する fetch であれば CORS の問題は発生しにくい（content script はページと同じオリジンで実行されるため）。
3. 取得した正確な数値で、画面上の省略表記（`1.2k` 等）を差し替える。
4. ポップアップで ON/OFF 切り替えを実装し、`chrome.storage`（または `chrome.storage.sync`）に状態を保存する。content script はこの状態を読んで何もしない/行うを決める。

> 注意：Mastodon は分散サービス（インスタンスごとにドメインが異なる）なので、**どのインスタンスで動作させるか（manifest の `matches` / `host_permissions`）は開発時に指定**する必要があります。開発では `*://*/*` や特定のインスタンスを使って試すことができますが、公開する場合はホストを絞るのがベターです。

---

## プロジェクト構成（推奨）

```
my-mastodon-counts/               # リポジトリルート
├─ manifest.json                  # 拡張の manifest（MV3）
├─ vite.config.ts                 # Vite + CRXJS 設定
├─ package.json
├─ src/
│  ├─ content.ts                  # content script（DOM 操作・API fetch）
│  ├─ background.ts               # （必要なら）サービスワーカー / バックグラウンド処理
│  ├─ popup/                      # React + TS で作る popup
│  │  ├─ index.html
│  │  ├─ main.tsx
│  │  └─ Popup.tsx
│  └─ utils/
│     └─ numbers.ts               # 省略表記の解析や数値フォーマット
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

### `manifest.json`（例）

> **要調整**：`matches` は開発環境・対象インスタンスに合わせて変更してください。

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
        "https://mastodon.social/*",
        "https://*.example-instance.tld/*"
        // 開発時は必要に応じて追加
      ],
      "js": ["src/content.ts"],
      "run_at": "document_idle"
    }
  ],

  "permissions": ["storage"],
  "host_permissions": [
    "https://mastodon.social/*",
    "https://*.example-instance.tld/*"
  ]
}
```

---

## content script の実装要点（例：`src/content.ts`）

* ページ内の「投稿 DOM」を監視（`MutationObserver`）して、新しい投稿が出現したら処理する。
* 各投稿要素から **投稿のパーマリンク（permalink）** を探して投稿 ID を抽出する。

  * 例：`https://instance.tld/@username/123456789012345678` の末尾 `123456789012345678` が status ID
* 抽出できたら同一オリジンの Mastodon API（`/api/v1/statuses/:id`）を fetch する。
* API の JSON から `replies_count`, `reblogs_count`, `favourites_count` を取り、投稿 DOM 内の該当数値要素を上書きする。
* ON/OFF 機能：`chrome.storage` のフラグを読み、OFF の場合は何もしない。

#### 数値反映の実装サンプル（TypeScript — 擬似コード）

```ts
// src/content.ts (抜粋・簡略)
const ENABLE_KEY = 'md_show_exact_counts'

async function isEnabled() {
  const s = await chrome.storage.sync.get(ENABLE_KEY)
  return s[ENABLE_KEY] ?? true
}

function extractStatusIdFromAnchor(href: string): string | null {
  // 最後の / の後が数字のパターンを期待
  const m = href.match(/\/(\d+)(?:$|[/?#])/)
  return m ? m[1] : null
}

async function fetchStatusCounts(origin: string, id: string) {
  const api = `${origin}/api/v1/statuses/${id}`
  const res = await fetch(api, { credentials: 'same-origin' })
  if (!res.ok) throw new Error('fetch failed')
  return await res.json() // contains replies_count, reblogs_count, favourites_count
}

function replaceCountsInDOM(postEl: Element, counts: { replies: number, reblogs: number, favourites: number }) {
  // 投稿内の要素探索ロジック。
  // 実際は Mastodon の DOM 構成に合わせてセレクタを調整してください。
  const els = Array.from(postEl.querySelectorAll('button, a, span'))
  els.forEach(el => {
    const txt = el.textContent?.trim() ?? ''
    // 省略表記と思われるものを検出して置き換え
    if (/^\d+(?:\.\d+)?[kM]$/.test(txt)) {
      // ここは投稿内のどのカウントに相当するか判定して置き換えてください
      // 例: data-role 属性や aria-label などで判定できる場合が多い
      el.textContent = String(counts.reblogs) // 例: ブースト数を入れる
    }
  })
}

// MutationObserver を使って新しい投稿が来たら上の処理を実行
```

> **実装ヒント**：Mastodon の DOM はインスタンス・バージョンや UI テーマで変わる可能性があります。最初は開発者ツールで該当する投稿要素の**パーマリンクとなっているアンカー**や**数値が入る要素（aria-label や data 属性）**を探し、セレクタを調整してください。

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

* content script は対象ページのコンテキストで動くので、開発者ツールの「Elements / Console / Network」を使って selector や fetch の URL を追う。
* `chrome.storage` の変更は `chrome.storage.onChanged.addListener` で content script 側で監視し、即時 ON/OFF を切り替えられるようにする。
* API fetch が失敗する場合は、fetch の `origin` が正しく取れているか、manifest の `host_permissions` が足りているかを確認。

---

## 権限とプライバシー

* host_permissions を広く許すと（例：`<all_urls>`）拡張は多くのドメインで動きますが、公開時の審査やユーザーの信頼に影響します。対象インスタンスを明示的に絞るのが安全です。
* 取得する数値は公開 API（ステータス情報）から取るため、個人のパスワード等は扱いません。とはいえ利用者に対して拡張が何を取得するかは README 等で明示してください。

---

## 既知の制約 / 注意点

* Mastodon の UI やインスタンス実装によってはセレクタが変わることがあるため、content script のセレクタは定期的にメンテナンスが必要です。
* 非公開アカウントの投稿や一部の API は認証が必要な場合があります。公開投稿に関しては API で取得できることが多いですが、必ずしもすべての投稿で成功するとは限りません。

---

## 追加メンテナンス案（任意）

* キャッシュ層を入れて API コール数を削減（例：投稿 ID ごとの TTL キャッシュ）
* インスタンス一覧の UI を作り、ユーザーが対象インスタンスを追加できるようにする（ただし要 permissions の更新）

---

## 参考（実装・配布時に参照するドキュメント）

* @crxjs/vite-plugin (CRXJS) — npm / GitHub
* Chrome Extensions Manifest V3 ドキュメント
* Mastodon API ドキュメント（`GET /api/v1/statuses/:id`）

---

## ライセンス

* お好みのライセンスを選択してください（例：MIT）

---

### 最後に

この README は最小限の機能（投稿数を正確表示、popup の ON/OFF）に特化した開発手順と実装ガイドです。実際の DOM セレクタや対象インスタンスのドメインは環境によって変わるため、まずは**開発者ツールで投稿のパーマリンクと数表示の要素**を確認してから `src/content.ts` のセレクタを合わせる作業を行ってください。

必要ならば、**実際に使う Mastodon インスタンスの例（例：`https://mastodon.social`、あるいはあなたが使っているインスタンス）を教えて**ください。特定インスタンスを教えていただければ、README 内の manifest/match patterns と content script の具体的なセレクタ候補をさらに書き込んでお渡しします。
