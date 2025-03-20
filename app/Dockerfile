# ベースイメージ（Node.js 16）
FROM node:16

# グローバルに TypeScript をインストール
RUN npm install -g typescript

# 作業ディレクトリを設定
WORKDIR /usr/src/app

# package.json と package-lock.json をコピー
COPY package*.json ./

# 依存関係をインストール
RUN yarn install --frozen-lockfile --production=false

# アプリのソースコードをコピー
COPY . .

# ポートを指定（例えば 3000）
EXPOSE 8528

# アプリを起動
CMD ["yarn", "start"]
