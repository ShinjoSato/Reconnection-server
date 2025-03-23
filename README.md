# 💬 リアルタイムチャットアプリ - サーバーサイド（Backend）

<div style="display: flex; justify-content: center;">
    <video controls src="https://github.com/user-attachments/assets/4ec7491e-b545-4de3-8e94-cd3cd340c906" muted="true"></video>
</div>

このリポジトリは、Socket.io と PostgreSQL を活用したリアルタイムチャットアプリのサーバーサイド構成です。  
Docker によって環境構築が簡単で、テキストや画像の送受信を高速かつ安全に処理することができます。


## 📌 概要

- Socket.io によるリアルタイム通信を実現したチャットアプリケーションのバックエンド
- チャットデータや画像を PostgreSQL に保存し、ユーザーごとに管理
- Docker & docker-compose による簡単な環境構築
- 「自分なりのチャットアプリを開発したい」という動機からスタート


## 🎥 デモ動画

- 🔗 [YouTubeリンクはこちら](https://www.youtube.com/watch?v=uoTXuhqZPYE)


## ⚙️ 主な機能

- 🔄 Socket.io を使ったリアルタイムなメッセージ・画像通信
- 🖼️ クライアントと連携したチャットルーム機能（テキスト / 画像送受信）
- 🗃️ PostgreSQL によるデータベース管理
- 🐳 Docker / docker-compose によるローカル環境構築


## 🛠️ 技術スタック

| 分類             | 使用技術                     |
|------------------|------------------------------|
| 言語・環境        | Node.js v16, TypeScript      |
| 通信             | Socket.io                    |
| DB               | PostgreSQL 11.2              |
| パッケージ管理   | Yarn                         |
| 実行環境         | Docker, docker-compose       |


## 🚀 セットアップ手順

1. このリポジトリをクローン
   ```bash
   git clone https://github.com/ShinjoSato/Reconnection-server.git
   cd Reconnection-server
   ```

2. Docker ビルド（初回のみ）
   ```bash
   docker compose build
   ```

3. サーバー起動
   ```bash
   docker compose up
   ```

4. デフォルトポート
   ```bash
   http://localhost:8528
   ```


## 🛢️ データベース（PostgreSQL）

| 項目         | 値             |
|--------------|----------------|
| ホスト        | localhost      |
| ポート        | 25432          |
| DB名         | postgres       |
| ユーザー名     | postgres       |
| パスワード     | password       |

テスト時は上記設定で接続可能です。


## 🔗 クライアントとの連携

このサーバーは以下のクライアントアプリと連携して動作します：  
👉 [Reconnection - クライアントサイド](https://github.com/ShinjoSato/Reconnection-client)
