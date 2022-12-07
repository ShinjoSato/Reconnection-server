// PostgreSQL
const { Pool } = require('pg')
const pool_data = {
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'password',
  port: 5432 //15432
}
import { configure, getLogger } from "log4js";
configure({
  appenders: {
    out: { type: 'stdout' },
    app: { type: 'dateFile', filename: './logs/disconnected', pattern: "yyyy-MM-dd.log", keepFileExt: false, alwaysIncludePattern: true, daysToKeep: 10, compress: true, numBackups: 1 }
  },
  categories: {
    default: { appenders: ['out', 'app'], level: 'info' }
  }
});
const logger = getLogger();

import { getImage, saveImage } from "./system";

const SQL = {
  'insert-into-picture': // 画像の追加
    `insert into picture_table(label,path) values($1,$2) returning *;`,

  'insert-tnto-pictweet': // 画像付き呟きの追加
    `insert into tweet(tweet,room_id,user_id,picture_id,head) values($1,$2,$3,$4,$5) RETURNING *;`,

  'select-room': // 部屋の取得
    `SELECT A.id AS id, A.name AS name, A.openLevel AS openlevel, A.postLevel AS postlevel, A.latest AS latest, B.path AS picture FROM chatroom AS A, picture_table AS B WHERE A.icon=B.id AND (A.id) = ($1);`,
  
  'select-users-followers': // ユーザーのフォロワーを取得
    `SELECT A.id AS id, A.name AS name, B.path AS picture, A.mail AS mail, A.authority AS authority, A.publicity AS publicity
    FROM user_table AS A
    JOIN picture_table AS B ON B.id = A.image
    JOIN (
      SELECT *
      FROM user_friend_unit AS A
      WHERE A.friend_id = $1
    ) AS C ON A.id = C.user_id;`,

  'select-users-friends': // ユーザーのフレンドを取得
    `SELECT A.id AS id, A.name AS name, B.path AS picture, A.mail AS mail, A.authority AS authority, A.publicity AS publicity
    FROM user_table AS A
    JOIN picture_table AS B ON B.id = A.image
    JOIN (
      SELECT *
      FROM user_friend_unit AS A
      WHERE A.user_id = $1
    ) AS C ON A.id = C.friend_id;`,

  'delete-from-picture': // 画像を削除
    "DELETE FROM picture_table WHERE id = $1;",

  'insert-into-tweet': // 呟きの追加
    `insert into tweet(tweet,room_id,user_id,head) values($1,$2,$3,$4) RETURNING *;`,

  'delete-from-tweet-in-room': // ルーム内の呟きを削除
    "DELETE FROM tweet WHERE room_id=$1;",

  'delete-from-tweet-by-user': // ユーザーを削除した時にツイート全てを削除
    "DELETE FROM tweet WHERE (user_id)=($1);",

  'get-tweet-count': // 呟きに対する既読数
    `SELECT tweet.id, tweet.room_id, A.count AS count FROM tweet
    JOIN(-- 呟きに対する既読数
        SELECT tweet.id, COUNT(A.tweet_id)::int
        FROM tweet
        LEFT JOIN (
            SELECT tweet_id
            FROM user_tweet_unit
        ) AS A ON tweet.id = A.tweet_id
        GROUP BY tweet.id
    ) AS A ON A.id = tweet.id
    WHERE tweet.id = $1;`,

  'insert-into-user':
    "insert into user_table(id,name,password,image,mail,authority,publicity) values($1,$2,pgp_sym_encrypt($3,'password'),$4,$5,$6,$7) returning *;",
  
  'delete-from-user':
    "DELETE FROM user_table WHERE id=$1 RETURNING *;",

  'insert-into-user-tweet-unit':
    `INSERT INTO user_tweet_unit(user_id, tweet_id) VALUES($1, $2);`,

  'insert-into-user-friend-unit':
    `INSERT INTO user_friend_unit(user_id, friend_id) VALUES($1, $2);`,

  'insert-into-user-room-unit':
    "INSERT INTO user_chatroom_unit(user_id, chatroom_id, authority, opening, posting) VALUES($1,$2,$3,$4,$5) RETURNING *;",

  'delete-from-user-room-unit-by-room':
    "DELETE FROM user_chatroom_unit WHERE chatroom_id=$1 RETURNING *;",

  'delete-from-room':
    "DELETE FROM chatroom WHERE (id)=($1) RETURNING *;",

  'delete-from-user-room-unit-by-user':
    "DELETE FROM user_chatroom_unit WHERE (user_id)=($1);",
  
  'select-user-with-pass':
    "SELECT * FROM user_table WHERE id = $1 AND pgp_sym_decrypt(password, 'password') = $2;",
  
  '/sql/user/room': // ユーザーが属する部屋のリスト取得
    `SELECT A.id AS id, A.name AS name, A.openLevel AS open_level, A.postLevel AS post_level, A.latest AS latest, C.authority AS authority, C.opening AS opening, C.posting AS posting, B.path AS picture from chatroom AS A
    JOIN picture_table AS B ON A.icon = B.id
    JOIN user_chatroom_unit AS C ON C.chatroom_id = A.id
    WHERE C.user_id = $1
    ORDER BY A.id;`,
  
  '/sql/user/room/status/single': // ユーザーが属する任意の部屋に対するステータスリスト取得
    `SELECT A.id AS id, A.name AS name, A.openLevel AS open_level, A.postLevel AS post_level, A.latest AS latest, C.authority AS authority, C.opening AS opening, C.posting AS posting, B.path AS picture_path, B.path AS picture from chatroom AS A
    JOIN picture_table AS B ON A.icon = B.id
    JOIN user_chatroom_unit AS C ON C.chatroom_id = A.id
    WHERE A.id = $1
    AND C.user_id = $2
    ORDER BY A.id;`,
  
  '/sql/room/user': // ルームに属するユーザーのリスト取得
    `SELECT user_table.id AS user_id, user_table.name AS user_name, user_table.publicity AS publicity, picture_table.path AS picture, user_chatroom_unit.authority AS authority, user_chatroom_unit.opening AS opening, user_chatroom_unit.posting AS posting FROM user_table
    JOIN user_chatroom_unit ON user_chatroom_unit.user_id = user_table.id
    JOIN picture_table ON picture_table.id = user_table.image
    WHERE user_chatroom_unit.chatroom_id = $1;`,
  
  '/api/appid/check': // 発行されているAPIであるかの確認
    `SELECT Authority.*, Option.rest FROM Authority
    JOIN Authority_Option AS Option ON Authority.id = Option.authority_id
    WHERE Authority.appid = $1 AND Option.rest = $2;`,
  
  '/sql/user/webhook':
    `SELECT * FROM RestAPI WHERE user_id = $1;`,
  
  '/sql/webhook/outgoing/id/option':
    `SELECT API.id AS restapi_id, API.method, Option.id AS option_id, Option.option AS option, Option.keyword, Option.replacekeyword, Option.value, Option.regexpvalue FROM RestAPI AS API
    JOIN RestAPI_Option AS Option ON API.id = Option.restapi_id
    WHERE API.id = $1;`,
  
  '/sql/webhook/outgoing/id/output':
    `SELECT API.id AS restapi_id, API.method, Output.id AS output_id, Output.room_id, Output.user_id AS user_id, Output.keyword, Output.value, Output.regexpvalue FROM RestAPI AS API
    JOIN RestAPI_Output AS Output ON API.id = Output.restapi_id
    WHERE API.id = $1;`,
  
  '/sql/webhook/outgoing/id/flag/update':
    `UPDATE OutgoingWebhook SET flag = ($1) WHERE id = $2 RETURNING *;`,
  
  '/webhook/outgoing/check': //該当する部屋 and 正規表現に当てはまるテキスト and flagがtrue
    `SELECT A.restapi_id, A.room_id, A.flag, A.regexp, B.method, B.url, B.user_id, substring($2, A.regexp) AS value FROM OutgoingWebhook AS A
    LEFT JOIN RestAPI AS B on A.restapi_id = B.id
    WHERE A.room_id = $1 AND $2 ~ A.regexp AND A.flag = TRUE;`,
  
  '/restapi/id/add':// RestAPIを登録
    `INSERT INTO RestAPI(method, url, user_id) VALUES($1, $2, $3) RETURNING *;`,

  '/restapi/id/option': // RestAPIデータに対応するOptionデータのリスト取得
    `SELECT * FROM RestAPI_Option WHERE restapi_id = $1;`,
  
  '/restapi/id/option/add': // RestAPI_Optionに追加
    `INSERT INTO RestAPI_Option(restapi_id, id, option, keyword, replacekeyword, regexpvalue, value) VALUES($1, $2, $3, $4, $5, $6, $7);`,

  '/restapi/id/output/get':
    `SELECT * FROM RestAPI_Output WHERE restapi_id = $1;`,
  
  '/restapi/id/outgoingwebhook':
    `SELECT * FROM OutgoingWebhook WHERE restapi_id = $1;`,
  
  '/restapi/id/scheduler':
    `SELECT * FROM Scheduler WHERE restapi_id = $1;`,
  
  '/sql/schedule/get': //スケジュール実行するRestAPIのidを取得
    `SELECT RestAPI.*, Scheduler.id AS schedule_id, Scheduler.text FROM Scheduler
    JOIN RestAPI ON Scheduler.restapi_id = RestAPI.id
    WHERE
    Scheduler.flag = TRUE
    AND (minute='*'
    OR (minute ~ '\\*\\/\\d+' AND date_part('minute', now() - executeTime)>= CAST(substring(minute, '\\*\\/(\\d+)') AS integer))
    OR (length(substring(minute, '\\d+'))>0 AND CAST(substring(minute, '\\d+') AS integer) = CAST(date_part('minute', now()) AS integer)))
    AND (hour='*'
    OR (hour ~ '\\*\\/\\d+' AND date_part('hour', now()-executeTime) >= CAST(substring(hour, '\\*\\/(\\d+)') AS integer))
    OR (length(substring(hour, '\\d+'))>0 AND CAST(substring(hour, '\\d+') AS integer) = CAST(date_part('hour', now()) AS integer)))
    AND (day='*'
    OR (day ~ '\\*\\/\\d+' AND date_part('day', now()-executeTime) >= CAST(substring(day, '\\*\\/(\\d+)') AS integer))
    OR (length(substring(day, '\\d+'))>0 AND CAST(substring(day, '\\d+') AS integer) = CAST(date_part('day', now()) AS integer)))
    AND (month='*'
    OR (month ~ '\\*\\/\\d+' AND date_part('month', now()-executeTime) >= CAST(substring(month, '\\*\\/(\\d+)') AS integer))
    OR (length(substring(month, '\\d+'))>0 AND CAST(substring(month, '\\d+') AS integer) = CAST(date_part('month', now()) AS integer)))
    AND (day='*'
    OR (day ~ '\\*\\/\\d+' AND date_part('dow', now()-executeTime) >= CAST(substring(date, '\\*\\/(\\d+)') AS integer))
    OR (length(substring(date, '\\d+'))>0 AND CAST(substring(date, '\\d+') AS integer) = CAST(date_part('dow', now()) AS integer)));`,

  '/sql/schedule/executetime/update':
    `UPDATE Scheduler SET executeTime = $1 WHERE restapi_id = $2 AND id = $3 RETURNING *;`,
  
  '/sql/scheduler/restapi/id/flag/update':
    `UPDATE Scheduler SET flag = ($1) WHERE restapi_id = $2 AND id = $3 RETURNING *;`,
}

const Message = {
  'insert-into-picture':
    { 'true': 'insert into pictureに成功しました。', 'false': 'insert into pictureに失敗しました。' },
  'insert-tnto-pictweet':
    { 'true': 'insert into pic-tweetに成功しました。', 'false': 'insert into pic-tweetに失敗しました。' },
  'select-room':
    { 'true': '成功', 'false': '失敗' },
  'select-users-followers':
    { 'true': '成功', 'false': '失敗' },
  'select-users-friends':
    { 'true': '成功', 'false': '失敗' },
  'delete-from-picture':
    { 'true': 'delete from roomに成功しました。', 'false': 'delete from roomに失敗しました。' },
  'insert-into-tweet':
    { 'true': 'insert into tweetに成功しました。', 'false': 'insert into tweetに失敗しました。' },
  'delete-from-tweet-in-room':
    { 'true': 'delete from tweet in roomに成功しました。', 'false': 'delete from tweet in room に失敗しました。' },
  'delete-from-tweet-by-user':
    { 'true': 'delete from tweet by userに成功しました。', 'false': 'delete from tweet by userに失敗しました。' },
  'get-tweet-count':
    { 'true': 'get tweet countに成功しました。', 'false': 'get tweet countに失敗しました。' },
  'insert-into-user':
    { 'true': 'insert into userに成功しました。', 'false': 'insert into userに失敗しました。' },
  'delete-from-user':
    { 'true': 'delete from userに成功しました。', 'false': 'delete from userに失敗しました。' },
  'insert-into-user-tweet-unit':
    { 'true': 'insert into user tweet unitに成功しました。', 'false': 'insert into user tweet unitに失敗しました。' },
  'insert-into-user-friend-unit':
    { 'true': 'insert into user friend unitに成功しました。', 'false': 'insert into user friend unitに失敗しました。' },
  'insert-into-user-room-unit':
  { 'true': 'insert into user-room unitに成功しました。', 'false': 'insert into user-room unitに失敗しました。' },
  'delete-from-user-room-unit-by-room':
    { 'true': 'delete from user-room unit by roomに成功しました。', 'false': 'delete from user-room unit by roomに失敗しました。' },
  'delete-from-room':
    { 'true': 'delete from roomに成功しました。', 'false': 'delete from roomに失敗しました。' },
  'delete-from-user-room-unit-by-user':
    { 'true': 'delete from user-room unit by userに成功しました。', 'false': 'delete from user-room unit by userに失敗しました。' },
  'select-user-with-pass':
    { 'true': 'select user with passに成功しました。', 'false': 'select user with passに失敗しました。' },
  '/sql/user/room': // ユーザーが属する部屋のリスト取得
    { 'true':'成功', 'false':'失敗' },
  '/sql/user/room/status/single':
    { 'true':'成功', 'false':'失敗' },
  '/sql/room/user':
    { 'true':'成功', 'false':'失敗' },
  '/api/appid/check':
    { 'true':'成功', 'false':'失敗' },
  '/sql/user/webhook':
    { 'true':'成功', 'false':'失敗' },
  '/sql/webhook/outgoing/id/option':
    { 'true':'成功', 'false':'失敗' },
  '/sql/webhook/outgoing/id/output':
    { 'true':'成功', 'false':'失敗' },
  '/sql/webhook/outgoing/id/flag/update':
    { 'true':'成功', 'false':'失敗' },
  '/webhook/outgoing/check':
    { 'true':'成功', 'false':'失敗' },
  '/restapi/id/add':
    { 'true':'成功', 'false':'失敗' },
  '/restapi/id/option':
    { 'true':'成功', 'false':'失敗' },
  '/restapi/id/option/add':
    { 'true':'成功', 'false':'失敗' },
  '/restapi/id/output/get':
    { 'true':'成功', 'false':'失敗' },
  '/restapi/id/outgoingwebhook':
    { 'true':'成功', 'false':'失敗' },
  '/restapi/id/scheduler':
    { 'true':'成功', 'false':'失敗' },
  '/sql/schedule/get':
    { 'true':'成功', 'false':'失敗' },
  '/sql/schedule/executetime/update':
    { 'true':'成功', 'false':'失敗' },
  '/sql/scheduler/restapi/id/flag/update':
    { 'true':'成功', 'false':'失敗' },
  }

// responseをそのままの形で返すパターン（insert,deleteはほとんどここに分類）
function runGeneralSQL(keyword: string, data: any[], toPicture: any) { // toPictures→画像化させるもの
  const sql = SQL[keyword]
  const message = Message[keyword]
  const pool = new Pool(pool_data);
  return pool.query(sql, data).then(async (response) => {
    pool.end().then(() => 
      console.log('pool has ended')
    );
    if(toPicture != null) {
      response.rows = response.rows.map(row => { return { ...row, [toPicture]:getImage(row[toPicture])}})
    }
    return { rows: response.rows, status: true, message: message['true'] };
  }).catch((error) => {
    logger.error(error);
    logger.error(error.detail);
    logger.error(sql)
    logger.error(data)
    return { status: false, message: error.detail };
  })
}

function getSingleTweet(tweet_id: String) {
  console.log("get single-tweet.")
  const pool = new Pool(pool_data);
  const sql = `
    select tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name as user, user_table.id as user_id, user_table.path as user_icon, picture_table.path as picture from tweet
    join (
        select user_table.id,user_table.name,picture_table.path from user_table
        join picture_table on user_table.image = picture_table.id
    ) as user_table on tweet.user_id = user_table.id
    left join picture_table on tweet.picture_id = picture_table.id
    where tweet.id = $1
  `;
  return pool.query(sql, [tweet_id]).then(async (response) => {
    var tweet = (response.rows).map((row) => {
      var tmp = { ...row, user_icon: getImage(row.user_icon) };
      if(tmp.picture){
        tmp.picture = getImage(tmp.picture);
      }
      return tmp;
    });
    pool.end().then(() => console.log('pool has ended'));
    return { message: "サクセス", status: true, data: tweet };
  })
  .catch((error) => {
    logger.error(error);
    return {message: "エラー", status: false};
  })
}

function getCommonTweetsInRoom(room_id: number) {
  // getSingleTweetとほとんど変わらないから共通化したい
  console.log("get commom tweets in room.")
  const pool = new Pool(pool_data);
  const sql = `
    select tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name as user, user_table.id as user_id, user_table.path as user_icon, picture_table.path as picture from tweet
    join (
        select user_table.id,user_table.name,picture_table.path from user_table
        join picture_table on user_table.image = picture_table.id
    ) as user_table on tweet.user_id = user_table.id
    left join picture_table on tweet.picture_id = picture_table.id
    where tweet.room_id = $1
  `;
  return pool.query(sql, [room_id]).then(async (response) => {
    var tweet = (response.rows).map((row) => {
      var tmp = { ...row, user_icon: getImage(row.user_icon) };
      if(tmp.picture){
        tmp.picture = getImage(tmp.picture);
      }
      return tmp;
    });
    pool.end().then(() => console.log('pool has ended'));
    return { message: "サクセス", status: true, data: tweet };
  })
  .catch((error) => {
    logger.error(error);
    return {message: "エラー", status: false};
  })
} 

function getTweetInPublic(user_id: String) {
  console.log("get tweet in public.")
  const pool = new Pool(pool_data);
  const sql = `SELECT A.id, A.tweet, A.user_id, C.name, A.room_id, A.head, B.openLevel, C.path AS user_icon, D.path AS picture, A.time FROM tweet AS A
  JOIN chatroom AS B ON A.room_id = B.id
  JOIN (
    select A.id, A.name, B.path from user_table AS A
    JOIN picture_table AS B on B.id = A.image
    where A.id = $1
    or A.id in (
      select friend_id from user_friend_unit
      where user_id = $1
    )
  ) AS C ON C.id = A.user_id
  LEFT OUTER JOIN picture_table AS D ON D.id = A.picture_id
  WHERE B.openLevel = $2
  ORDER BY A.time DESC
  LIMIT $3 OFFSET $4;`;
  return pool.query(sql, [user_id, '3', '20', '0']).then(async (response) => {
    var tweet = (response.rows).map((row) => {
      var tmp = { ...row, user_icon: getImage(row.user_icon) };
      if(tmp.picture){
        tmp.picture = getImage(tmp.picture);
      }
      return tmp;
    });
    pool.end().then(() => console.log('pool has ended'));
    return { message: "サクセス", status: true, rows: tweet };
  })
  .catch((error) => {
    logger.error(error);
    return {message: "エラー", status: false};
  })
}

// getTweetInPublicのSQLと一行しか変わらないのでまとめたい！
// 最新n件より前の公開ツイートを読み込む
function getTweetInPublicBefore(user_id: String, head_tweet_id: String) {
  console.log("get tweet in public before.")
  const pool = new Pool(pool_data);
  const sql = `SELECT A.id, A.tweet, A.user_id, C.name, A.room_id, A.head, B.openLevel, C.path AS user_icon, D.path AS picture, A.time FROM tweet AS A
  JOIN chatroom AS B ON A.room_id = B.id
  JOIN (
    select A.id, A.name, B.path from user_table AS A
    JOIN picture_table AS B on B.id = A.image
    where A.id = $1
    or A.id in (
      select friend_id from user_friend_unit
      where user_id = $1
    )
  ) AS C ON C.id = A.user_id
  LEFT OUTER JOIN picture_table AS D ON D.id = A.picture_id
  WHERE B.openLevel = $2
  AND A.id < $3
  ORDER BY A.time DESC
  LIMIT $4 OFFSET $5;`;
  return pool.query(sql, [user_id, '3', head_tweet_id, '20', '0']).then(async (response) => {
    var tweet = (response.rows).map((row) => {
      var tmp = { ...row, user_icon: getImage(row.user_icon) };
      if(tmp.picture){
        tmp.picture = getImage(tmp.picture);
      }
      return tmp;
    });
    pool.end().then(() => console.log('pool has ended'));
    return { message: "サクセス", status: true, rows: tweet };
  })
  .catch((error) => {
    logger.error(error);
    return {message: "エラー", status: false};
  })
}

/**
 * PostgreSQL上に部屋を作成して任意のユーザーを登録する関数。
 * @param chatroom_image テーブル名picture_tableのカラムid。
 * @param chatroom_name テーブル名chatroomのカラムname。
 * @param user_id テーブル名user_tableのカラムid。
 * @param callback 取得したデータを返すFuncstionまたはObject。
 */
function createUserRoom(chatroom_icon: number, chatroom_path: string, chatroom_name: string, user_id: string, open_level: number, post_level: number){
  console.log("create user-room.")
  const pool = new Pool(pool_data);
  return pool.query("INSERT INTO chatroom(icon,name,openLevel,postLevel,start,latest) VALUES($1,$2,$3,$4,$5,$6) RETURNING *;",[chatroom_icon, chatroom_name, open_level, post_level, 'now()', 'now()'])
  .then(async re=>{
    const insertRoom = re.rows.map(x => { return { ...x }; });
    const userRoomUnit = await runGeneralSQL('insert-into-user-room-unit', [ user_id, re.rows[0].id, true, true, true ], null)
    pool.end().then(() => console.log('pool has ended'));
    return userRoomUnit;
  })
  .catch(erro=>{
    console.log("erro:\n",erro);
    return {message: "erro", status: false};
  });
}

async function createUserRoomWithPicture(chatroom_name: string, user_id: string, open_level: number, post_level: number, picture_label: string, picture_path: string){
  console.log("create user-room with picture.")
  const  { rows, status } = await runGeneralSQL('insert-into-picture', [ picture_label, picture_path ], null)
  if(status){
    // 修正予定
    return await createUserRoom(rows[0].id, rows[0].path, chatroom_name, user_id, open_level, post_level);
  }else{
    return { message: "部屋の画像の登録に失敗しました", status: false };
  }
}

/**
 * ユーザーと部屋の結び付きを作る関数。
 * @param user_id ユーザーid。
 * @param room_id ルームid。
 * @param callback 結果を返信する関数。
 */
async function addUserIntoRoom(user_id: string, room_id: number, opening: boolean, posting: boolean, io: any){
  console.log("add user into room.")
  const insert = await runGeneralSQL('insert-into-user-room-unit', [ user_id, room_id, false, opening, posting ], null)
  if(!insert.status)
    return insert;
  return await sendUpdatedRoomUsers(user_id, room_id, io);
}

/**
 * ユーザーと部屋の結びつきの設定を変更する関数。
 * @param user_id {string} 指定するユーザーID。
 * @param room_id {number} 指定する部屋ID。
 * @param opening {boolean} 閲覧権限を示すBoolean。
 * @param posting {boolean} 呟き権限を示すBoolean。
 * @param callback {Function} 結果を返す関数。
 * @param io {any} ソケット接続されている端末に送信する為の変数。
 */
async function updateUserInRoom(user_id: string, room_id: number, opening: boolean, posting: boolean, io: any){
  console.log(user_id, room_id);
  const pool = new Pool(pool_data);
  return pool.query("UPDATE user_chatroom_unit SET (opening, posting) = ($1, $2) WHERE (user_id, chatroom_id) = ($3, $4);", [opening, posting, user_id, room_id])
  .then(async response => {
    pool.end().then(() => console.log('pool has ended'));
    return await sendUpdatedRoomUsers(user_id, room_id, io);
  })
  .catch(error => {
    logger.error(error);
    return {message: "失敗", status: false};
  })
}

/**
 * ユーザーと部屋の結び付きを外す関数。
 * @param user_id ユーザーid。
 * @param room_id ルームid。
 * @param callback 結果を返信する関数。
 */
async function removeUserFromRoom(user_id: string, room_id: number, io: any){
  console.log("remove user from room.")
  const pool = new Pool(pool_data);
  return pool.query("DELETE FROM user_chatroom_unit WHERE (user_id, chatroom_id) = ($1,$2);", [user_id, room_id])
  .then(async response => {
    pool.end().then(() => console.log('pool has ended'));
    return await sendUpdatedRoomUsers(user_id, room_id, io);
  })
  .catch(error => {
    logger.error(error);
    return {message: "失敗", status: false};
  })
}

/**
 * ユーザーと部屋の結び付きを取得する関数。
 * @param user_id {string} ユーザーIDを示すString。
 * @param room_id {number} 部屋IDを示すNumber。
 * @param io {any} ソケット接続されている端末に送信する為の変数。
 */
function sendUpdatedRoomUsers(user_id: string, room_id: number, io: any){
  const pool = new Pool(pool_data);
  return pool.query(`SELECT user_table.id AS user_id, user_chatroom_unit.chatroom_id AS room_id, user_table.name AS user_name, picture_table.path AS picture, user_chatroom_unit.authority AS authority, user_chatroom_unit.opening AS opening, user_chatroom_unit.posting AS posting FROM user_table
  JOIN user_chatroom_unit ON user_chatroom_unit.user_id = user_table.id
  JOIN picture_table ON picture_table.id = user_table.image
  WHERE (user_chatroom_unit.chatroom_id) = ($1);`, [room_id])
  .then((response) => {
    var rows = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
    io.to(room_id).emit('update-room-user', { rows, room_id });
    io.to(`@${user_id}`).emit('receive-invitation-from-room', { user_id, room_id });
    pool.end().then(() => console.log('pool has ended'));
    return {message: `Update ROOM successfully!`, status: true};
  })
  .catch((error) => {
    logger.error(error);
    return {message: `Error from adding user into room.`, status: false};
  })
}

/**
 * 画像付きでユーザー登録する関数。
 * @param user_id ユーザーid。
 * @param user_name ユーザーネーム。
 * @param user_password ユーザーパスワード。
 * @param picture_label 画像のラベル。
 * @param picture_path 画像までのディレクトリーパス。
 * @param response 結果を返信する関数。
 */
async function addUserWithPicture(user_id: string, user_name: string, user_password: string, user_mail: string, user_authority: boolean, user_publicity: number, picture_label: string, picture_path: string, response: any){
    console.log("add user with picture.");
    const pool = new Pool(pool_data);
    const { rows, status, message } = await runGeneralSQL('insert-into-picture', [ picture_label, picture_path ], null)
    if(!status)
      return { rows, status, message };
    const { rows:userRows, status:userStatus, message:userMessage } = await runGeneralSQL('insert-into-user', [ user_id, user_name, user_password, rows[0].id, user_mail, user_authority, user_publicity ], null)
    if(!userStatus){
      console.log(runGeneralSQL('delete-from-picture', [ rows[0].id ], null));
      return { 'rows':userRows, 'status':userStatus, 'message':userMessage }
    }
    //修正予定
    const room = await createUserRoom(userRows[0].image, picture_path, userRows[0].name, userRows[0].id, 1, 1);
    if(!room.status)
      console.log(runGeneralSQL('delete-from-picture', [ rows[0].id ], null));
    return room;
}

function selectAllRoom(callback: Function){
  console.log("select all room.");
  const pool = new Pool(pool_data);
  pool.query("SELECT A.id AS id, A.name AS name, A.latest AS latest, B.path AS picture FROM chatroom AS A, picture_table AS B WHERE A.icon=B.id;")
  .then((res) => {
    var rows = (res.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    callback({data: rows});
  })
  .catch((err) => {
    logger.error(err);
    callback({message: "roomを取得できませんでした。"});
  });
}

function selectCommonRoom(user_id: string, another_id: string) {
  console.log("get common room.")
  const pool = new Pool(pool_data);
  const sql = `SELECT A.id AS id, A.name AS NAME, A.openlevel AS open_level, A.postlevel AS post_level, A.latest AS latest, B.path AS picture FROM chatroom AS A
  JOIN picture_table AS B ON A.icon = B.id
  JOIN (
    SELECT chatroom_id AS ID
    FROM user_chatroom_unit
    WHERE user_id = $1 OR user_id = $2
    GROUP BY chatroom_id
    HAVING COUNT(user_id) = 2
  ) AS C ON C.id = A.id
  ORDER BY A.id;
  `;
  return pool.query(sql, [user_id, another_id]).then(async (response) => {
    const room = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
    pool.end().then(() => console.log('pool has ended'));
    return { data: room, status: true };
  }).catch((error) => {
    logger.error(error);
    return { message: "エラーが生じました。", status: false };
  })
}

function selectRoomPublication(id: string) {
  console.log("select room publication.")
  const pool = new Pool(pool_data);
  const sql = `SELECT room_id FROM chatroom_publication WHERE id = $1;`;
  return pool.query(sql, [id]).then(async (response) => {
    // const room = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
    pool.end().then(() => console.log('pool has ended'));
    return { data: response.rows, status: true };
  }).catch((error) => {
    logger.error(error);
    return { message: "エラーが生じました。", status: false };
  })
}

function updateRoom(id: number, name: string, open_level: number, post_level: number, picture: any, user_id: string){
  console.log("update room.");
  const pool = new Pool(pool_data);
  return pool.query("UPDATE chatroom SET (name, openLevel, postLevel) = ($1, $2, $3) WHERE id = $4 RETURNING *;", [name, open_level, post_level, id])
  .then(async (res) => {
    if(res.rows.length==1){
        const room = await runGeneralSQL('/sql/user/room/status/single', [ id, user_id ], 'picture')
        if(!room.status)
          return room;
        console.log(room);
        console.log(room.rows);
        if(picture)
          saveImage(room.rows[0].picture_path, picture);
        pool.end().then(() => console.log('pool has ended'));
        return {message: 'update room success!', status: true, data: room.rows, id }
    }else{
      return {message: "error update room", status: false};
    }
  })
  .catch((err) => {
    logger.error(err);
    return {message: "cannnot update room", status: false};
  })
}

function updateRoomlatest(id: string){
  console.log("update room latest");
  const pool = new Pool(pool_data);
  return pool.query("UPDATE chatroom SET latest = (SELECT now()) WHERE (id) = ($1) RETURNING *;", [id]).then(async (res) => {
    pool.end().then(() => console.log('pool has ended'));
    if(res.rows.length==1){
      return {message: 'update room latest success!', status: true };
    }else{
      return {message: "error update room latest", status: false};
    }
  })
  .catch((err) => {
    logger.error(err);
    return {message: "cannnot update room latest", status: false};
  })
}

function getRoomStatus(id: number) {
  console.log("get room status.")
  const pool = new Pool(pool_data);
  const sql = `SELECT A.id AS id, A.name AS NAME, A.openlevel AS open_level, A.postlevel AS post_level, A.latest AS latest, B.path AS picture_path, B.path AS picture FROM chatroom AS A
  JOIN picture_table AS B ON A.icon = B.id
  WHERE A.id = $1;`;
  return pool.query(sql, [id]).then(async (response) => {
    const room = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
    pool.end().then(() => console.log('pool has ended'));
    return { data: room, status: true };
  }).catch((error) => {
    logger.error(error);
    return { message: "エラーが生じました。", status: false };
  })
}

async function deleteRoom(room_id: number){
  console.log("delete room.")
  const del_unit = await runGeneralSQL('delete-from-user-room-unit-by-room', [ room_id ], null)
  if(!del_unit.status)
    return del_unit;
  const del_room = await runGeneralSQL('delete-from-room', [ room_id ], null)
  if(!del_room.status)
    return del_room;
  const { status, message } = await runGeneralSQL('delete-from-tweet-in-room', [ room_id ],  null)
  return { status, message };
  // pictureも消さなければいけないかも
}

function selectUser(user_id: string){
  console.log("select user.")
  const pool = new Pool(pool_data);
  return pool.query(`
  SELECT user_table.id AS id, user_chatroom_unit.chatroom_id AS room_id, user_table.name AS name, user_table.mail AS mail, user_table.authority AS authority, user_table.publicity AS publicity, picture_table.path AS picture, user_chatroom_unit.opening AS opening, user_chatroom_unit.posting AS posting FROM user_table
  JOIN user_chatroom_unit ON user_chatroom_unit.user_id = user_table.id
  JOIN picture_table ON picture_table.id = user_table.image
  WHERE user_table.id = $1;
  `, [user_id])
  .then(async (response) => {
    var users = (response.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    return { status: true, data: users };
  })
  .catch((error) => {
    logger.error(error);
    return { status: false, message: error.detail };
  })
}

function selectUsersByPublicity(publicity: number, callback: Function){
  console.log("select users by publicity.")
  const pool = new Pool(pool_data);
  const sql = "SELECT A.id AS id, A.name AS name, B.path AS picture, A.mail AS mail, A.authority AS authority, A.publicity AS publicity FROM user_table AS A, picture_table AS B WHERE A.image=B.id AND A.publicity = $1;";
  pool.query(sql, [publicity])
  .then((res) => {
    var rows = (res.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    callback({data: rows});
  })
  .catch((err) => {
    logger.error(err);
    callback({message: "取得に失敗しました。"});
  })
}

function selectAllUser(callback: Function){
  console.log("select all user.")
  const pool = new Pool(pool_data);
  pool.query("SELECT A.id AS id, A.name AS name, B.path AS picture, A.mail AS mail, A.authority AS authority, A.publicity AS publicity FROM user_table AS A, picture_table AS B WHERE A.image=B.id;")
  .then((res) => {
    var rows = (res.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    callback({data: rows});
  })
  .catch((err) => {
    logger.error(err);
    callback({message: "取得に失敗しました。"});
  })
}

function selectFriendNotInRoom(room_id: string, user_id: string) {
  console.log("select friend not in room.")
  const pool = new Pool(pool_data);
  const sql = `
  SELECT user_table.id AS user_id, user_table.name AS user_name, user_table.publicity AS publicity, picture_table.path AS picture FROM user_table
  JOIN picture_table ON user_table.image = picture_table.id
  JOIN user_friend_unit AS C ON C.friend_id = user_table.id
  WHERE user_table.id NOT IN (
    SELECT user_table.id FROM user_table
    JOIN user_chatroom_unit ON user_id = user_table.id
    WHERE chatroom_id = $1
  )
  AND C.user_id = $2;`
  return pool.query(sql, [room_id, user_id])
  .then(async (res) => {
    var rows = (res.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    return { status: true, data: rows };
  })
  .catch((err) => {
    logger.error(err);
    return { status: false, message: err.detail };
  });
}

function getUserProfile(user_id: string) {
  logger.info("get user-profile.");
  const pool = new Pool(pool_data);
  const sql = "SELECT A.id AS id, A.name AS name, A.mail AS mail, A.authority AS authority, A.publicity, B.path AS image FROM user_table AS A JOIN picture_table AS B ON B.id = A.image WHERE A.id = $1;";
  return pool.query(sql, [user_id]).then(async (response) => {
    pool.end().then(() => console.log('pool has ended'));
    return await { data: response, status: true };
  }).catch((error) => {
    logger.error(error);
    return { message: "エラーが発生しました。", status: false };
  })
}

function getUserProfileWithPass(user_id: string, password: string) {
  console.log("get user-profile with pass.")
  const pool = new Pool(pool_data);
  const sql = "SELECT A.id AS id, A.name AS name, A.mail AS mail, A.authority AS authority, A.publicity AS publicity, B.path AS image FROM user_table AS A JOIN picture_table AS B ON B.id = A.image WHERE A.id = $1 AND pgp_sym_decrypt(A.password, 'password') = $2;";
  return pool.query(sql, [user_id, password]).then(async (response) => {
    pool.end().then(() => console.log('pool has ended'));
    return await { data: response, status: true };
  }).catch((error) => {
    logger.error(error);
    return { message: "エラーが発生しました。", status: false };
  })
}

function updateUser(id: string, name: string, mail: string, authority: boolean, publicity: number) {
  logger.info("update user.");
  const pool = new Pool(pool_data);
  const sql = "UPDATE user_table SET (name,mail,authority,publicity) = ($1,$2,$3,$4) WHERE id = $5 RETURNING *;";
  return pool.query(sql, [name, mail, authority, publicity, id]).then(async (response) => {
    pool.end().then(() => console.log('pool has ended'));
    return await { data: response, status: true };
  }).catch((error) => {
    logger.error(error);
    return { message: "エラーが発生しました。", status: false };
  })
}

function selectUserWithId(keyword: string) {
  console.log("select user with id.")
  const pool = new Pool(pool_data);
  const sql = `SELECT A.id AS id, A.name AS name, B.path AS picture, A.mail AS mail, A.authority AS authority, A.publicity AS publicity
  FROM user_table AS A
  JOIN picture_table AS B ON B.id = A.image
  WHERE A.id like $1;`;
  return pool.query(sql, [keyword]).then(async (response) => {
    let user = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
    pool.end().then(() => console.log('pool has ended'));
    return await { data: user, status: true };
  }).catch((error) => {
    logger.error(error);
    return { message: "エラーが発生しました。", status: false };
  })
}

async function checkAndUpdateUser(id: string, name: string, picture: any, password: string, mail: string, authority: boolean, publicity: number){
  console.log("check and update user", id, name, mail, authority, publicity);
  const select = await runGeneralSQL('select-user-with-pass', [ id, password ], null)
  if(!select.status)
    return select;
  if(select.data.rows.length !== 1)
    return { message: "一致するユーザーがいません。", status: false };
  const update = await updateUser(id, name, mail, authority, publicity);
  if(!update.status)
    return update;
  const profile = await getUserProfile(id);
  if(!profile.status)
    return profile;
  if(picture)
    saveImage(profile.data.rows[0].image, picture);
  const data = profile.data.rows.map(x => { return {...x, image: getImage(x.image)}; })[0];
  return {message: 'user update success!', status: true, data};

}

async function deleteUser(user_id: string){
  console.log("delete user");
  const del_unit = await runGeneralSQL('delete-from-user-room-unit-by-user', [ user_id ], null)
  if(!del_unit.status)
    return del_unit;
  const { status, message } = await runGeneralSQL('delete-from-tweet-by-user', [ user_id ], null) //「削除されたユーザー用ユーザー」を作成して代替えしたい。
  if(!status)
    return { status, message };
  const { rows:userRows, status:userStatus, message:userMessage } = await runGeneralSQL('delete-from-user', [ user_id ], null)
  return { 'rows':userRows, 'status':userStatus, 'message':userMessage };
  // 画像も削除しなければならない！！
}

/**
 * 一つ分の部屋のデータを送信する関数。
 * @param user_id User ID
 * @param room_id Room ID
 * @param callback 結果を返す関数
 */
async function getSingleRoom(user_id: string, room_id: number){
  console.log("get single room")
  let result = { room_id:room_id, single_room:null, single_roommember:null, single_tweet:null, single_pictweet:null };

  const room = await runGeneralSQL('/sql/user/room/status/single', [ room_id, user_id ], 'picture')
  if(!room.status)
    return room;
  result.single_room = room.rows;

  const member = await runGeneralSQL('/sql/room/user', [ room_id ], 'picture')
  if(!member.status)
    return member;
  result.single_roommember = member.rows;

  const tweet = await getTweetInSingleRoom(user_id, room_id);
  if(!tweet.status)
    return tweet;
  result.single_tweet = tweet.rows;

  const pictweet = await getPicTweetInSingleRoom(user_id, room_id);
  if(!pictweet.status)
    return pictweet;
  result.single_pictweet = pictweet.rows;

  return result;
}




function getTweetInSingleRoom(user_id: String, room_id: number) {
  console.log("get tweet in single room.");
  const pool = new Pool(pool_data);
  const sql = `SELECT tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name AS user, user_table.id AS user_id, user_table.path AS user_icon, picture_table.path AS picture, C.count AS count, C.check AS check FROM tweet
  JOIN (
      SELECT user_table.id,user_table.name,picture_table.path FROM user_table
      JOIN picture_table ON user_table.image = picture_table.id
  ) AS user_table ON tweet.user_id = user_table.id
  LEFT JOIN picture_table ON tweet.picture_id = picture_table.id
  JOIN (
    SELECT tweet.id, A.count AS count, B.count AS check FROM tweet
    JOIN(-- 呟きに対する既読数
        SELECT tweet.id, COUNT(A.tweet_id)::int
        FROM tweet
        LEFT JOIN (
            SELECT tweet_id
            FROM user_tweet_unit
        ) AS A ON tweet.id = A.tweet_id
        GROUP BY tweet.id
    ) AS A ON A.id = tweet.id
    JOIN(-- 特定のユーザーが呟きを既に読んだ時に1, 読んでいない時に0を示す
        SELECT tweet.id, COUNT(A.tweet_id)::int
        FROM tweet
        LEFT JOIN (
            SELECT tweet_id
            FROM user_tweet_unit
            WHERE user_id = $1
        ) AS A ON tweet.id = A.tweet_id
        GROUP BY tweet.id
    ) AS B ON B.id = tweet.id
  ) AS C ON tweet.id = C.id
  WHERE room_id = $2
  ORDER BY tweet.id DESC;`;
  return pool.query(sql, [user_id, room_id])
  .then(async (response) => {
    var tweets = (response.rows).map((row) => {
      let tmp = { ...row, user_icon: getImage(row.user_icon) };
      if(tmp.picture){
        tmp.picture = getImage(tmp.picture);
      }
      return tmp;
    });
    pool.end().then(() => console.log('pool has ended'));
    return { status: true, rows: tweets, message: '成功' };
  }).catch((error) => {
    logger.error(error);
    return { status: false, rows: [], message: "エラー1" };
  })
}

function getPicTweetInSingleRoom(user_id: String, room_id: number) {
  console.log("get pic-tweet in single-room.")
  const pool = new Pool(pool_data);
  const sql = `SELECT tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name AS user, user_table.id AS user_id, user_table.path AS user_icon, picture_table.path AS picture, C.count AS count, C.check AS check FROM tweet
  JOIN (
      SELECT user_table.id,user_table.name,picture_table.path FROM user_table
      JOIN picture_table ON user_table.image = picture_table.id
  ) AS user_table ON tweet.user_id = user_table.id
  LEFT JOIN picture_table ON tweet.picture_id = picture_table.id
  JOIN (
    -- ツイートの既読数と既読or未読を表すSQL
    SELECT tweet.id, A.count AS count, B.count AS check FROM tweet
    JOIN(-- 呟きに対する既読数
        SELECT tweet.id, COUNT(A.tweet_id)::int
        FROM tweet
        LEFT JOIN (
            SELECT tweet_id
            FROM user_tweet_unit
        ) AS A ON tweet.id = A.tweet_id
        GROUP BY tweet.id
    ) AS A ON A.id = tweet.id
    JOIN(-- 特定のユーザーが呟きを既に読んだ時に1, 読んでいない時に0を示す
        SELECT tweet.id, COUNT(A.tweet_id)::int
        FROM tweet
        LEFT JOIN (
            SELECT tweet_id
            FROM user_tweet_unit
            WHERE user_id = $1
        ) AS A ON tweet.id = A.tweet_id
        GROUP BY tweet.id
    ) AS B ON B.id = tweet.id
  ) AS C ON tweet.id = C.id
  WHERE room_id = $2
  AND tweet.picture_id IS NOT NULL
  ORDER BY tweet.id DESC;`;
  return pool.query(sql, [user_id, room_id])
  .then(async (response) => {
    var tweets = (response.rows).map((row) => { return { ...row, picture: getImage(row.picture), user_icon: getImage(row.user_icon) }; });
    pool.end().then(() => console.log('pool has ended'));
    return { status: true, rows: tweets, message:'成功' };
  }).catch((error2) => {
    logger.error(error2);
    return { status: false, rows:[], message: "エラー2" };
  })
}

/**
 * ユーザーが
 * @param user_id 
 * @returns 
 */
function getInitialRoom(user_id: String) {
  console.log("get initial room")
  const pool = new Pool(pool_data);
  const sql = `
    SELECT A.*, B.*, C.path AS picture from chatroom AS A
    LEFT JOIN user_chatroom_unit AS B ON B.chatroom_id = A.id
    JOIN picture_table AS C ON C.id = A.icon
    WHERE B.user_id = $1;
  `
  return pool.query(sql, [user_id])
  .then(async (response) => {
    var rooms = (response.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    return { status: true, data: rooms };
    // return rooms;
  })
  .catch((error) => {
    logger.error(error);
    return { status: false, message: "エラー3" };
  })
}

/**
 * ユーザーが属する部屋のリストを取得。
 * @param user_id 
 * @returns 
 */
function getRoomsUserBelong(user_id: String) {
  console.log("get rooms user belong")
  const pool = new Pool(pool_data);
  const sql = `
  SELECT A.id AS id, A.name AS name, A.openLevel AS open_level, A.postLevel AS post_level, A.latest AS latest, C.authority AS authority, C.opening AS opening, C.posting AS posting, B.path AS picture from chatroom AS A
  JOIN picture_table AS B ON A.icon = B.id
  JOIN user_chatroom_unit AS C ON C.chatroom_id = A.id
  WHERE C.user_id = $1
  ORDER BY A.id;
  `
  return pool.query(sql, [user_id])
  .then((response) => {
    var rows = (response.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    return { status: true, rows, message: '成功' };
  })
  .catch((error) => {
    logger.error(error);
    return { status: false, rows: [], message: "エラー4" };
  })
}

/**
 * ユーザーが属する部屋毎のユーザーリストを取得。
 * @param user_id 
 * @returns 
 */
function getMemberInEachRoom(user_id: String) {
  console.log("get member in each room.")
  const pool = new Pool(pool_data);
  const sql = `
    SELECT user_table.id AS user_id, D.room_id, user_table.name AS user_name, user_table.publicity AS publicity, picture_table.path AS picture, user_chatroom_unit.authority AS authority, user_chatroom_unit.opening AS opening, user_chatroom_unit.posting AS posting FROM user_table
    JOIN user_chatroom_unit ON user_chatroom_unit.user_id = user_table.id
    JOIN picture_table ON picture_table.id = user_table.image
    JOIN (
      SELECT chatroom_id AS room_id 
      FROM user_chatroom_unit
      WHERE user_id = $1
    ) AS D ON user_chatroom_unit.chatroom_id = D.room_id
    order by user_chatroom_unit.chatroom_id;
  `
  return pool.query(sql, [user_id])
  .then((response) => {
    var users = (response.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    return users;
  })
  .catch((error) => {
    logger.error(error);
    return { message: "エラー5" };
  })
}

export {
  runGeneralSQL,
  getSingleTweet,
  getCommonTweetsInRoom,
  getTweetInPublic,
  getTweetInPublicBefore,
  addUserIntoRoom,
  updateUserInRoom,
  removeUserFromRoom,
  addUserWithPicture,
  createUserRoomWithPicture,
  getRoomStatus,
  deleteRoom,
  selectUser,
  selectUsersByPublicity,
  selectAllUser,
  selectFriendNotInRoom,
  getUserProfileWithPass,
  selectUserWithId,
  checkAndUpdateUser,
  deleteUser,
  selectAllRoom,
  selectCommonRoom,
  selectRoomPublication,
  updateRoom,
  updateRoomlatest,
  getSingleRoom,
  getTweetInSingleRoom,
  getPicTweetInSingleRoom,
  getInitialRoom,
  getRoomsUserBelong,
  getMemberInEachRoom,
}