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

// responseをそのままの形で返すパターン（insert,deleteはほとんどここに分類）
function runGeneralSQL(sql: string, data: any[], message: object) {
  const pool = new Pool(pool_data);
  return pool.query(sql, data).then(async (response) => {
    pool.end().then(() => 
      console.log('pool has ended')
    );
    return { data: response, status: true, message: message['true'] };
  }).catch((error) => {
    logger.error(error);
    return { status: false, message: error.detail };
  })
}

function insertIntoPicture(label: String, path: String) {
  console.log("insert into picture.")
  const sql = `insert into picture_table(label,path) values($1,$2) returning *;`
  const message = { 'true': 'insert into pictureに成功しました。', 'false': 'insert into pictureに失敗しました。' }
  return runGeneralSQL(sql, [label, path], message);
}

function deleteFromPicture(id: String) {
  console.log("delete from picture.")
  const sql = "DELETE FROM picture_table WHERE id = $1;";
  const message = { 'true': 'delete from pictureに成功しました。', 'false': 'delete from pictureに失敗しました。' }
  return runGeneralSQL(sql, [id], message);
}

function insertIntoTweet(text: String, room_id: String, user_id: String, head: String) {
  console.log("insert into tweet.")
  const sql = `insert into tweet(tweet,room_id,user_id,head) values($1,$2,$3,$4) RETURNING *;`
  const message = { 'true': 'insert into tweetに成功しました。', 'false': 'insert into tweetに失敗しました。' }
  return runGeneralSQL(sql, [text, room_id, user_id, head], message);
}

function deleteFromTweetInRoom(room_id: number) {
  console.log("delete from tweet in room.")
  const sql = "DELETE FROM tweet WHERE room_id=$1;";
  const message = { 'true': 'delete from tweet in roomに成功しました。', 'false': 'delete from tweet in room に失敗しました。' }
  return runGeneralSQL(sql, [room_id], message);
}

function deleteFromTweetByUser(user_id: String) {
  // これでは他のユーザーもいるルームの呟きも削除されてしまうので、「削除されましたユーザー」も作成しときたい。
  console.log("delete from tweet by user.")
  const sql = "DELETE FROM tweet WHERE (user_id)=($1);";
  const message = { 'true': 'delete from tweet by userに成功しました。', 'false': 'delete from tweet by userに失敗しました。' }
  return runGeneralSQL(sql, [user_id], message);
}

function insertIntoPicTweet(text: String, room_id: String, user_id: String, picture_id: String, head: String) {
  console.log("insert into pic-tweet.")
  const sql = `insert into tweet(tweet,room_id,user_id,picture_id,head) values($1,$2,$3,$4,$5) RETURNING *;`
  const message = { 'true': 'insert into pic-tweetに成功しました。', 'false': 'insert into pic-tweetに失敗しました。' }
  return runGeneralSQL(sql, [text, room_id, user_id, picture_id, head], message);
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
    return { message: "サクセス", status: true, data: tweet };
  })
  .catch((error) => {
    logger.error(error);
    return {message: "エラー", status: false};
  })
}

// getTweetInPublicのSQLと一行しか変わらないのでまとめたい！
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
    return { message: "サクセス", status: true, data: tweet };
  })
  .catch((error) => {
    logger.error(error);
    return {message: "エラー", status: false};
  })
}


function getTweetCount(tweet_id: String) {
  console.log("get tweet-count.");
  const sql = `SELECT tweet.id, tweet.room_id, A.count AS count FROM tweet
  JOIN(-- 呟きに対する既読数
      SELECT tweet.id, COUNT(A.tweet_id)::int
      FROM tweet
      LEFT JOIN (
          SELECT tweet_id
          FROM user_tweet_unit
      ) AS A ON tweet.id = A.tweet_id
      GROUP BY tweet.id
  ) AS A ON A.id = tweet.id
  WHERE tweet.id = $1;`
  const pool = new Pool(pool_data);
  const message = { 'true': 'get tweet countに成功しました。', 'false': 'get tweet countに失敗しました。' }
  return runGeneralSQL(sql, [tweet_id], message);
}

function insertIntoUser(id: String, name: String, pass: String, image_id: String, mail: String, authority: Boolean) {
  console.log("insert into user.")
  const sql = "insert into user_table(id,name,password,image,mail,authority,publicity) values($1,$2,pgp_sym_encrypt($3,'password'),$4,$5,$6,$7) returning *;";
  const message = { 'true': 'insert into userに成功しました。', 'false': 'insert into userに失敗しました。' }
  return runGeneralSQL(sql, [id, name, pass, image_id, mail, authority, 1], message);
}


function deleteFromUser(id: String) {
  console.log("delete from user.")
  const sql = "DELETE FROM user_table WHERE id=$1 RETURNING *;";
  const message = { 'true': 'delete from userに成功しました。', 'false': 'delete from userに失敗しました。' }
  return runGeneralSQL(sql, [id], message);
}

function insertIntoUserTweetUnit(user_id: string, tweet_id: number) {
  console.log("insert into user tweet unit.");
  const sql = `INSERT INTO user_tweet_unit(user_id, tweet_id) VALUES($1, $2);`
  const message = { 'true': 'insert into user tweet unitに成功しました。', 'false': 'insert into user tweet unitに失敗しました。' }
  return runGeneralSQL(sql, [user_id, tweet_id], message);
}

function insertIntoUserFriendUnit(user_id: string, friend_id: string) {
  console.log("insert into user friend unit.");
  const sql = `INSERT INTO user_friend_unit(user_id, friend_id) VALUES($1, $2);`
  const message = { 'true': 'insert into user friend unitに成功しました。', 'false': 'insert into user friend unitに失敗しました。' }
  return runGeneralSQL(sql, [user_id, friend_id], message);
}


function insertIntoUserRoomUnit(user_id: string, room_id: number, authority: boolean, opening: boolean, posting: boolean) {
  console.log("insert into user-room unit.")
  const sql = "INSERT INTO user_chatroom_unit(user_id, chatroom_id, authority, opening, posting) VALUES($1,$2,$3,$4,$5) RETURNING *;"
  const message = { 'true': 'insert into user-room unitに成功しました。', 'false': 'insert into user-room unitに失敗しました。' }
  return runGeneralSQL(sql, [user_id, room_id, authority, opening, posting], message);
}


function deleteFromUserRoomUnitByRoom(room_id: number) {
  console.log("delete from user-room unit by room.")
  const sql = "DELETE FROM user_chatroom_unit WHERE chatroom_id=$1;";
  const message = { 'true': 'delete from user-room unit by roomに成功しました。', 'false': 'delete from user-room unit by roomに失敗しました。' }
  return runGeneralSQL(sql, [room_id], message);
}


function deleteFromUserRoomUnitByUserm(user_id: String) {
  console.log("delete from user-room unit by user.")
  const sql = "DELETE FROM user_chatroom_unit WHERE (user_id)=($1);";
  const message = { 'true': 'delete from user-room unit by userに成功しました。', 'false': 'delete from user-room unit by userに失敗しました。' }
  return runGeneralSQL(sql, [user_id], message);
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
    const userRoomUnit = await insertIntoUserRoomUnit(user_id, re.rows[0].id, true, true, true);
    pool.end().then(() => console.log('pool has ended'));
    return userRoomUnit;
  })
  .catch(erro=>{
    console.log("erro:\n",erro);
    return {message: "erro", status: false};
  });
}

async function createUserRoomWithPicture(chatroom_name: string, user_id: string, open_level: number, post_level: number, picture_label: string, picture_path: string, callback: Function){
  console.log("create user-room with picture.")
  const result = await insertIntoPicture(picture_label, picture_path);
  if(result.status){
    // 修正予定
    return await createUserRoom(result.data.rows[0].id, result.data.rows[0].path, chatroom_name, user_id, open_level, post_level);
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
  const insert = await insertIntoUserRoomUnit(user_id, room_id, false, opening, posting);
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
async function addUserWithPicture(user_id: string, user_name: string, user_password: string, user_mail: string, user_authority: boolean, picture_label: string, picture_path: string, response: any){
    console.log("add user with picture.");
    const pool = new Pool(pool_data);
    const pict = await insertIntoPicture(picture_label, picture_path);
    if(!pict.status)
      return pict;
    const insert = await insertIntoUser(user_id, user_name, user_password, pict.data.rows[0].id, user_mail, user_authority);
    if(!insert.status){
      console.log(deleteFromPicture(pict.data.rows[0].id));
      return insert
    }
    //修正予定
    const room = await createUserRoom(insert.data.rows[0].image, picture_path, insert.data.rows[0].name, insert.data.rows[0].id, 1, 1);
    if(!room.status)
      console.log(deleteFromPicture(pict.data.rows[0].id));
    return room;
}



function deleteFromRoom(room_id: number) {
  console.log("delete from room.")
  const sql = "DELETE FROM chatroom WHERE (id)=($1);";
  const message = { 'true': 'delete from roomに成功しました。', 'false': 'delete from roomに失敗しました。' }
  return runGeneralSQL(sql, [room_id], message);
}

function selectRoom(room_id: number) {
  console.log("select room.")
  const pool = new Pool(pool_data);
  return pool.query("SELECT A.id AS id, A.name AS name, A.openLevel AS openlevel, A.postLevel AS postlevel, A.latest AS latest, B.path AS picture FROM chatroom AS A, picture_table AS B WHERE A.icon=B.id AND (A.id) = ($1);", [room_id])
  .then(async (res) => {
    var rows = (res.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    return { data: rows, status: true };
  })
  .catch((err) => {
    logger.error(err);
    return { status: false, message: "エラーが生じました。" };
  });
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

function updateRoom(id: number, name: string, open_level: number, post_level: number, picture: any, user_id: string, callback: Function){
  console.log("update room.");
  const pool = new Pool(pool_data);
  pool.query("UPDATE chatroom SET (name, openLevel, postLevel) = ($1, $2, $3) WHERE id = $4 RETURNING *;", [name, open_level, post_level, id])
  .then(async (res) => {
    if(res.rows.length==1){
        const room = await getRoomStatusForUser(id, user_id);
        if(!room.status)
          callback(room);
        console.log(room);
        console.log(room.data);
        if(picture)
          saveImage(room.data[0].picture_path, picture);
        pool.end().then(() => console.log('pool has ended'));
        callback({message: 'update room success!', status: true, data: room.data, id })
    }else{
      callback({message: "error update room", status: false});
    }
  })
  .catch((err) => {
    logger.error(err);
    callback({message: "cannnot update room", status: false});
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

function getRoomStatusForUser(room_id: number, user_id: string) {
  console.log("get room status for user.");
  const pool = new Pool(pool_data);
  const sql = `SELECT A.id AS id, A.name AS name, A.openLevel AS open_level, A.postLevel AS post_level, A.latest AS latest, C.authority AS authority, C.opening AS opening, C.posting AS posting, B.path AS picture_path, B.path AS picture from chatroom AS A
  JOIN picture_table AS B ON A.icon = B.id
  JOIN user_chatroom_unit AS C ON C.chatroom_id = A.id
  WHERE A.id = $1
  AND C.user_id = $2
  ORDER BY A.id;`;
  return pool.query(sql, [room_id, user_id]).then(async (response) => {
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
  const pool = new Pool(pool_data);
  const del_unit = await deleteFromUserRoomUnitByRoom(room_id); 
  if(!del_unit.status)
    return del_unit;
  const del_room = await deleteFromRoom(room_id);
  if(!del_room.status)
    return del_room;
  const del_tweet = await deleteFromTweetInRoom(room_id);
  return del_tweet;
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

function selectUsersInRoom(room_id: string){
  console.log("select users in room.")
  const pool = new Pool(pool_data);
  return pool.query(`
  SELECT user_table.id AS user_id, user_table.name AS user_name, user_table.publicity AS publicity, picture_table.path AS picture, user_chatroom_unit.authority AS authority, user_chatroom_unit.opening AS opening, user_chatroom_unit.posting AS posting FROM user_table
  JOIN user_chatroom_unit ON user_chatroom_unit.user_id = user_table.id
  JOIN picture_table ON picture_table.id = user_table.image
  WHERE user_chatroom_unit.chatroom_id = $1;
  `, [room_id])
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

function selectUsersFriends(user_id: string) {
  console.log("select users friends.");
  const pool = new Pool(pool_data);
  const sql = `SELECT A.id AS id, A.name AS name, B.path AS picture, A.mail AS mail, A.authority AS authority, A.publicity AS publicity
  FROM user_table AS A
  JOIN picture_table AS B ON B.id = A.image
  JOIN (
    SELECT *
    FROM user_friend_unit AS A
    WHERE A.user_id = $1
  ) AS C ON A.id = C.friend_id;`
  return pool.query(sql, [user_id])
  .then(async (response) => {
    let friends = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
    pool.end().then(() => console.log('pool has ended'));
    return { status: true, data: friends };
  })
  .catch(error => {
    logger.error(error);
    return { status: false, message: error.detail };
  })
}

// selectUsersFriendsとほぼ変わらないからまとめたい！
function selectUsersFollowers(user_id: string) {
  console.log("select users followers.");
  const pool = new Pool(pool_data);
  const sql = `SELECT A.id AS id, A.name AS name, B.path AS picture, A.mail AS mail, A.authority AS authority, A.publicity AS publicity
  FROM user_table AS A
  JOIN picture_table AS B ON B.id = A.image
  JOIN (
    SELECT *
    FROM user_friend_unit AS A
    WHERE A.friend_id = $1
  ) AS C ON A.id = C.user_id;`
  return pool.query(sql, [user_id])
  .then(async (response) => {
    let friends = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
    pool.end().then(() => console.log('pool has ended'));
    return { status: true, data: friends };
  })
  .catch(error => {
    logger.error(error);
    return { status: false, message: error.detail };
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

function selectUserWithPass(id: string, password: string) {
  logger.info("select user with pass.");
  const sql = "SELECT * FROM user_table WHERE id = $1 AND pgp_sym_decrypt(password, 'password') = $2;";
  const message = { 'true': 'select user with passに成功しました。', 'false': 'select user with passに失敗しました。' }
  return runGeneralSQL(sql, [id, password], message)
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
  const select = await selectUserWithPass(id, password);
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
  const del_unit = await deleteFromUserRoomUnitByUserm(user_id);
  if(!del_unit.status)
    return del_unit;
  const del_tweet = await deleteFromTweetByUser(user_id); //「削除されたユーザー用ユーザー」を作成して代替えしたい。
  if(!del_tweet.status)
    return del_tweet;
  const del_user = await deleteFromUser(user_id); 
  return del_user;
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
  let result = { single_room:null, single_roommember:null, single_tweet:null, single_pictweet:null };

  const room = await getRoomStatusForUser(room_id, user_id);
  if(!room.status)
    return room;
  result.single_room = room.data;

  const member = await getMemberInRoom(room_id);
  if(!member.status)
    return member;
  result.single_roommember = member.data;

  const tweet = await getTweetInSingleRoom(user_id, room_id);
  if(!tweet.status)
    return tweet;
  result.single_tweet = tweet.data;

  const pictweet = await getPicTweetInSingleRoom(user_id, room_id);
  if(!pictweet.status)
    return pictweet;
  result.single_pictweet = pictweet.data;

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
    return { status: true, data: tweets };
  }).catch((error) => {
    logger.error(error);
    return { status: false, message: "エラー1" };
  })
}

/**
 * ユーザーが属する部屋毎の呟きを取得。
 * @param user_id 
 * @returns 
 */
function getTweetInEachRoom(user_id: String) {
  console.log("get tweet in each room.")
  const pool = new Pool(pool_data);
  const sql = `
  SELECT tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name AS user, user_table.id AS user_id, user_table.path AS user_icon, picture_table.path AS picture, C.count AS count, C.check AS check FROM tweet
  JOIN (
      SELECT user_table.id,user_table.name,picture_table.path FROM user_table
      JOIN picture_table ON user_table.image = picture_table.id
  ) AS user_table ON tweet.user_id = user_table.id
  LEFT JOIN picture_table ON tweet.picture_id = picture_table.id
  JOIN(
    SELECT * FROM user_chatroom_unit
    WHERE user_id = $1
  ) AS user_chatroom_unit ON user_chatroom_unit.chatroom_id = tweet.room_id
  JOIN (
    -- ツイートの既読数と既読or未読を表すSELECT文
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
            WHERE user_id = $2
        ) AS A ON tweet.id = A.tweet_id
        GROUP BY tweet.id
    ) AS B ON B.id = tweet.id
  ) AS C ON tweet.id = C.id
  ORDER BY tweet.room_id, tweet.id DESC;`;
  return pool.query(sql, [user_id, user_id])
  .then(async (response) => {
    var tweets = (response.rows).map((row) => {
      let tmp = { ...row, user_icon: getImage(row.user_icon) };
      if(tmp.picture){
        tmp.picture = getImage(tmp.picture);
      }
      return tmp;
    });
    pool.end().then(() => console.log('pool has ended'));
    return tweets;
  }).catch((error) => {
    logger.error(error);
    return { message: "エラー1" };
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
    return { status: true, data: tweets };
  }).catch((error2) => {
    logger.error(error2);
    return { status: false, message: "エラー2" };
  })
}


/**
 * ユーザーが属する部屋毎の画像付き呟きを取得。
 * @param user_id 
 * @returns 
 */
function getPicTweetInEachRoom(user_id: String) {
  console.log("get pic-tweet in each room.")
  const pool = new Pool(pool_data);
  const sql = `
  SELECT tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name AS user, user_table.id AS user_id, user_table.path AS user_icon, picture_table.path AS picture, C.count AS count, C.check AS check FROM tweet
  JOIN (
      SELECT user_table.id,user_table.name,picture_table.path FROM user_table
      JOIN picture_table ON user_table.image = picture_table.id
  ) AS user_table ON tweet.user_id = user_table.id
  LEFT JOIN picture_table ON tweet.picture_id = picture_table.id
  JOIN(
    SELECT * FROM user_chatroom_unit
    WHERE user_id = $1
  ) AS user_chatroom_unit ON user_chatroom_unit.chatroom_id = tweet.room_id
  JOIN (
    -- ツイートの既読数と既読or未読を表すSELECT文
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
            WHERE user_id = $2
        ) AS A ON tweet.id = A.tweet_id
        GROUP BY tweet.id
    ) AS B ON B.id = tweet.id
  ) AS C ON tweet.id = C.id
  WHERE tweet.picture_id IS NOT NULL
  ORDER BY tweet.id DESC;`
  return pool.query(sql, [user_id, user_id])
  .then(async (response) => {
    var tweets = (response.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    return tweets;
  }).catch((error2) => {
    logger.error(error2);
    return { message: "エラー2" };
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
    var rooms = (response.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    return rooms;
  })
  .catch((error) => {
    logger.error(error);
    return { message: "エラー4" };
  })
}


function getMemberInRoom(room_id: number) {
  console.log("get member in room.")
  const pool = new Pool(pool_data);
  const sql = `SELECT user_table.id AS user_id, B.chatroom_id AS room_id, user_table.name AS user_name, user_table.publicity AS publicity, picture_table.path AS picture, B.authority AS authority, B.opening AS opening, B.posting AS posting FROM user_table
  JOIN user_chatroom_unit AS B ON B.user_id = user_table.id
  JOIN picture_table ON picture_table.id = user_table.image
  WHERE B.chatroom_id = $1;`;
  return pool.query(sql, [room_id])
  .then((response) => {
    var users = (response.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.end().then(() => console.log('pool has ended'));
    return { status: true, data: users };
  })
  .catch((error) => {
    logger.error(error);
    return { status: false, message: "エラー5" };
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
  insertIntoPicture,
  insertIntoTweet,
  insertIntoPicTweet,
  getSingleTweet,
  getCommonTweetsInRoom,
  getTweetInPublic,
  getTweetInPublicBefore,
  getTweetCount,
  addUserIntoRoom,
  updateUserInRoom,
  removeUserFromRoom,
  addUserWithPicture,
  insertIntoUserTweetUnit,
  insertIntoUserFriendUnit,
  createUserRoomWithPicture,
  getRoomStatus,
  getRoomStatusForUser,
  deleteRoom,
  selectUser,
  selectUsersByPublicity,
  selectAllUser,
  selectUsersInRoom,
  selectUsersFriends,
  selectUsersFollowers,
  selectFriendNotInRoom,
  getUserProfileWithPass,
  selectUserWithId,
  checkAndUpdateUser,
  deleteUser,
  selectRoom,
  selectAllRoom,
  selectCommonRoom,
  selectRoomPublication,
  updateRoom,
  updateRoomlatest,
  getSingleRoom,
  getTweetInSingleRoom,
  getTweetInEachRoom,
  getPicTweetInEachRoom,
  getInitialRoom,
  getRoomsUserBelong,
  getMemberInEachRoom,
}