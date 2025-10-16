# Mastodon Exact Counts

Mastodonの投稿数、フォロー・フォロワー数を省略せずに正確に表示するChrome拡張機能です。

## 概要

Mastodonでは、プロフィールページの投稿数やフォロー数が「1.3K」のように省略形で表示されますが、この拡張機能を使うと「1,262」のように正確な数値で表示できます。

## 機能

- 投稿数の正確な表示
- フォロー数の正確な表示
- フォロワー数の正確な表示
- ポップアップから簡単にON/OFF切り替え
- リアルタイム切り替え（ページリロード不要）
- ダークモード対応

## 開発者向け情報

### 技術スタック

- **TypeScript** - 型安全な開発
- **React 19** - ポップアップUI
- **Vite** - 高速ビルドツール
- **@crxjs/vite-plugin** - Chrome拡張機能のビルド
- **Chrome Extension Manifest V3** - 最新のマニフェスト仕様

### プロジェクト構造

```
Mastodon-Exactcounts/
├── manifest.json              # Chrome拡張機能のマニフェスト
├── src/
│   ├── background.ts          # サービスワーカー（バックグラウンド処理）
│   ├── content.ts             # コンテンツスクリプト（ページ操作）
│   └── popup/                 # 拡張機能のポップアップUI
│       ├── index.html
│       ├── main.tsx
│       ├── Popup.tsx
│       └── Popup.css
├── icons/                     # 拡張機能のアイコン
├── package.json
├── vite.config.ts            # Viteの設定
└── tsconfig.json             # TypeScriptの設定
```

### アーキテクチャ

#### 1. Content Script (`src/content.ts`)

Mastodonページに注入され、DOM操作を行うメインスクリプトです。

**主な処理フロー:**

1. **Mastodonページの検出**
   - `isMastodonPage()` でMastodonページかどうかを判定
   - メタタグやDOM要素の存在をチェック

2. **数値の保存と管理**
   - `storeBothValues()` で省略形と正確な数値の両方を保存
   - `title` 属性から正確な数値を取得（例: `title="1,262"`）
   - `data-abbreviated` と `data-exact` 属性に値を格納

3. **表示の切り替え**
   - `updateDisplayedCounts()` で表示形式を切り替え
   - `chrome.storage` の設定値に応じて表示を変更
   - ページリロード不要でリアルタイム更新

4. **動的コンテンツの監視**
   - `MutationObserver` で新しく追加される要素を監視
   - SPAの画面遷移にも対応

5. **設定変更の監視**
   - `chrome.storage.onChanged` でポップアップからの設定変更を検知
   - 即座に表示を更新

**技術的なポイント:**

- **セレクタ**: `.account__header__extra__links a[title]` でプロフィールの統計情報を特定
- **パターンマッチング**: `/^\d+(?:\.\d+)?[kKmM]$/` で省略形を検出
- **データ属性**: DOM要素に直接データを保存することでAPI呼び出しを削減
- **処理済みマーク**: `data-exact-count-processed` 属性で重複処理を防止

#### 2. Background Service Worker (`src/background.ts`)

拡張機能のバックグラウンド処理を担当するサービスワーカーです。

**主な処理:**

- 拡張機能インストール時のデフォルト設定
- `chrome.storage.sync.set({ md_show_exact_counts: true })` で初期値を設定

#### 3. Popup UI (`src/popup/Popup.tsx`)

拡張機能のON/OFF切り替えUIを提供するReactコンポーネントです。

**主な機能:**

- チェックボックスで機能のON/OFF切り替え
- `chrome.storage.sync` で設定を保存・読み込み
- システムのダークモード設定に自動対応
- リアルタイムで設定変更を反映

### 開発環境のセットアップ

```bash
# 依存関係のインストール
npm install

# 開発モード（ホットリロード対応）
npm run dev

# ビルド（本番用）
npm run build

# Lintチェック
npm run lint
```

### Chrome拡張機能の読み込み方

1. `npm run build` でビルド
2. Chromeで `chrome://extensions/` を開く
3. 「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `dist` フォルダを選択

開発モード（`npm run dev`）の場合、`dist` フォルダがリアルタイムで更新されるため、拡張機能ページで「更新」ボタンをクリックするだけで変更が反映されます。

### 主要な設定ファイル

#### `manifest.json`

- **manifest_version**: 3（最新のManifest V3を使用）
- **permissions**: `storage`（設定保存用）
- **host_permissions**: すべてのHTTP/HTTPSサイト（Mastodonインスタンスの多様性に対応）
- **content_scripts**: すべてのページで実行（Mastodonページのみ実際には動作）

#### `vite.config.ts`

- `@crxjs/vite-plugin` でChrome拡張機能のビルドを自動化
- HMR（Hot Module Replacement）に対応
- TypeScriptの型チェックとトランスパイル

### カスタマイズ方法

#### セレクタの変更

Mastodonのバージョンアップでクラス名が変わった場合は、`src/content.ts` の以下の部分を修正:

```typescript
const profileLinks = document.querySelectorAll(`.account__header__extra__links a[title]:not([${PROCESSED_ATTR}])`)
```

#### 省略形のパターン変更

異なる言語や数値表記に対応する場合は、正規表現を修正:

```typescript
if (/^\d+(?:\.\d+)?[kKmM]$/.test(text)) {
  // 処理
}
```

#### UIのカスタマイズ

`src/popup/Popup.tsx` と `src/popup/Popup.css` を編集してポップアップUIをカスタマイズできます。

### デバッグ方法

#### Content Scriptのデバッグ

1. Mastodonページを開く
2. DevTools（F12）のConsoleタブを開く
3. `Mastodon Exact Counts: Content script loaded` が表示されることを確認
4. Elements タブで `data-exact` 属性の値を確認

#### Background Scriptのデバッグ

1. `chrome://extensions/` を開く
2. 拡張機能の「Service Worker」をクリック
3. DevToolsでログを確認

#### Popupのデバッグ

1. 拡張機能アイコンを右クリック
2. 「ポップアップを検証」を選択
3. DevToolsが開く

### トラブルシューティング

**Q: 数値が切り替わらない**
- DevToolsでConsoleエラーを確認
- `chrome.storage` のパーミッションが有効か確認
- MutationObserverが正しく動作しているか確認

**Q: 特定のMastodonインスタンスで動作しない**
- そのインスタンスのHTML構造を確認
- セレクタが適切か確認（`account__header__extra__links` の存在）

**Q: ビルドエラー**
- `npm install` で依存関係を再インストール
- Node.jsのバージョンを確認（推奨: 18以上）

### パフォーマンス最適化

- **MutationObserver**: `addedNodes` がある場合のみ処理を実行
- **データ属性**: DOM要素に直接値を保存してAPI呼び出しを削減
- **処理済みマーク**: 同じ要素を複数回処理しないように制御
- **セレクタの絞り込み**: `.account__header__extra__links` 内の要素のみを対象

### セキュリティ考慮事項

- Content Scriptは必要最小限の権限で動作
- ユーザーデータは `chrome.storage.sync` にのみ保存
- 外部APIへの通信なし（完全にローカルで動作）
- XSS対策: `innerHTML` ではなく `textContent` を使用（数値のみの場合は安全）

### ライセンス

このプロジェクトのライセンスについては、リポジトリのLICENSEファイルを参照してください。

### 貢献

バグ報告や機能追加の提案は、GitHubのIssueまでお願いします。Pull Requestも歓迎します。
