# リアルタイムチャット (サーバーサイド)

## 情報

- Disconnected
    - Port: 8000, (ローカルでは8528)

## 起動

1. Dockerを起動

   ```sh
   sudo systemctl start docker
   ```

2. Dockerコンテナを起動

    コンテナ化してあるPostgreSQLを起動。

    ```sh
    sudo docker start コンテナID
    ```

3. NGINXを起動

    ```sh
    sudo nginx -c /home/ec2-user/nginx/nginx.conf

    # sudo nginx -c /home/ubuntu/disconnected/nginx/nginx.conf
    ```

4. Disconnectedを起動

    ```sh
    npm run start
    ```

## 確認

- 起動しているPostgreSQLに接続

  ```
  # パスワードは"password"
  psql -U postgres -d postgres -h localhost -p 15432
  ```

- Macで```tsc```コマンドを実行する際
    実行する前にパスを通す必要があるので以下のコマンドを実行させる。
    ```sh
    PATH=/Users/shinjo/.npm-global/bin:$PATH
    ```