FROM node:16

# アプリケーションディレクトリを作成
WORKDIR /usr/src/app

# アプリケーションの依存関係をインストール
COPY package*.json ./

RUN npm install

# アプリケーションのソースをバンドル
COPY . .

# 画像ファイルを保存するディレクトリを作成
RUN mkdir -p tmp_images

EXPOSE 8000
CMD ["node", "index.js"]