// PostgreSQL
const { type } = require('express/lib/response');
const { Pool } = require('pg')
const pool_data = {
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'password',
  port: 5432 //15432
}
const pool = new Pool(pool_data);

import { getImage, saveImage } from "./system";

/**
 * PostgreSQL上に部屋を作成して任意のユーザーを登録する関数。
 * @param chatroom_image テーブル名picture_tableのカラムid。
 * @param chatroom_name テーブル名chatroomのカラムname。
 * @param user_id テーブル名user_tableのカラムid。
 * @param callback 取得したデータを返すFuncstionまたはObject。
 */
function createUserRoom(chatroom_icon: number, chatroom_path: string, chatroom_name: string, user_id: string, open_level: number, post_level: number, callback: any){
  pool.query("INSERT INTO chatroom(icon,name,openLevel,postLevel) VALUES($1,$2,$3,$4) RETURNING *;",[chatroom_icon, chatroom_name, open_level, post_level])
  .then(re=>{
    pool.query("INSERT INTO user_chatroom_unit VALUES($1,$2) RETURNING *;",[user_id, re.rows[0].id])
    .then(r=>{
      if(typeof(callback)=="function"){
        callback({ id: re.rows[0].id, name: chatroom_name, open_level, post_level, picture: getImage(chatroom_path) });
      }else if(typeof(callback)=="object"){
        callback.json(r);
      }
    })
    .catch(err=>{
      console.log("err:\n",err);
      if(typeof(callback)=="function"){
        callback({message: "err"});
      }else if(typeof(callback)=="object"){
        callback.json({message: "err"});
      }
    })
  })
  .catch(erro=>{
    console.log("erro:\n",erro);
    if(typeof(callback)=="function"){
      callback({message: "erro"});
    }else if(typeof(callback)=="function"){
      callback.json({message: "erro"});
    }
  });
}

function createUserRoomWithPicture(chatroom_name: string, user_id: string, open_level: number, post_level: number, picture_label: string, picture_path: string, callback: Function){
  pool.query("insert into picture_table(label,path) values($1,$2) returning *;", [picture_label, picture_path])
  .then((res) => {
    createUserRoom(res.rows[0].id, res.rows[0].path, chatroom_name, user_id, open_level, post_level, callback);
  })
  .catch((err) => {
    callback({message: "部屋の画像の登録に失敗しました。"});
  });
}

/**
 * ユーザーと部屋の結び付きを作る関数。
 * @param user_id ユーザーid。
 * @param room_id ルームid。
 * @param callback 結果を返信する関数。
 */
function addUserIntoRoom(user_id: string, room_id: number, callback: Function, io: any){
    console.log(user_id, room_id);
    pool.query("INSERT INTO user_chatroom_unit(user_id, chatroom_id, authority) VALUES($1,$2,$3);", [user_id, room_id, false], (err, res) => {
      console.log(err);
      pool.query(`SELECT user_table.id AS user_id, user_chatroom_unit.chatroom_id AS room_id, user_table.name AS user_name, picture_table.path AS picture, user_chatroom_unit.authority AS authority FROM user_table
      JOIN user_chatroom_unit ON user_chatroom_unit.user_id = user_table.id
      JOIN picture_table ON picture_table.id = user_table.image
      WHERE (user_chatroom_unit.chatroom_id) = ($1);`, [room_id])
      .then((response) => {
        callback({message: `Update ROOM successfully!`, status: true});
        var rows = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
        io.to(room_id).emit('update-room-user', { rows, room_id });
        io.to(`@${user_id}`).emit('receive-invitation-from-room', { user_id, room_id });
      })
      .catch((error) => {
        console.log(error);
        callback({message: `Error from adding user into room.`, status: false});
      })
    });
}

/**
 * ユーザーと部屋の結び付きを外す関数。
 * @param user_id ユーザーid。
 * @param room_id ルームid。
 * @param callback 結果を返信する関数。
 */
function removeUserFromRoom(user_id: string, room_id: number, callback: Function, io: any){
  pool.query("DELETE FROM user_chatroom_unit WHERE (user_id, chatroom_id) = ($1,$2);", [user_id, room_id], (error, response) => {
    console.log(error);
    pool.query(`SELECT user_table.id AS user_id, user_chatroom_unit.chatroom_id AS room_id, user_table.name AS user_name, picture_table.path AS picture, user_chatroom_unit.authority AS authority FROM user_table
    JOIN user_chatroom_unit ON user_chatroom_unit.user_id = user_table.id
    JOIN picture_table ON picture_table.id = user_table.image
    WHERE (user_chatroom_unit.chatroom_id) = ($1);`, [room_id])
    .then((response) => {
      callback({message: `Remove from ROOM successfully!`, status: true});
      var rows = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
      io.to(room_id).emit('update-room-user', { rows, room_id });
      io.to(`@${user_id}`).emit('get-expelled-from-room', { user_id, room_id });
    })
    .catch((error) => {
      console.log(error);
      callback({message: `Error from removing user from room.`, status: false});
    })
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
function addUserWithPicture(user_id: string, user_name: string, user_password: string, user_mail: string, user_authority: boolean, picture_label: string, picture_path: string, response: any){
    pool.query("insert into picture_table(label,path) values($1,$2) returning *;", [picture_label, picture_path])
    .then((res) => {
        pool.query("insert into user_table(id,name,password,image,mail,authority) values($1,$2,pgp_sym_encrypt($3,'password'),$4,$5,$6) returning *;", [user_id, user_name, user_password, res.rows[0].id, user_mail, user_authority])
        .then((res) => {
          createUserRoom(res.rows[0].image, picture_path, res.rows[0].name, res.rows[0].id, 1, 1, response);
        })
        .catch((err) => {
          console.log(err);
          response.json({message: "ユーザーの登録に失敗しました。"});
        });
    })
    .catch((err) => {
      console.log(err);
      response.json({message: "ユーザーの画像の登録に失敗しました。"});
    });
}

function selectAllRoom(callback: Function){
  pool.query("SELECT A.id AS id, A.name AS name, B.path AS picture FROM chatroom AS A, picture_table AS B WHERE A.icon=B.id;")
  .then((res) => {
    var rows = (res.rows).map(function(row){
      var r = row;
      r.picture = getImage(r.picture);
      return r;
    });
    callback({data: rows});
  })
  .catch((err) => {
    callback({message: "roomを取得できませんでした。"});
  });
}

function updateRoom(id: number, name: string, open_level: number, post_level: number, picture: any, user_id: string, callback: Function){
  pool.query("UPDATE chatroom SET (name, openLevel, postLevel) = ($1, $2, $3) WHERE id = $4 RETURNING *;", [name, open_level, post_level, id])
  .then((res) => {
    if(res.rows.length==1){
        pool.query(`SELECT A.id AS id, A.name AS name, A.openLevel AS open_level, A.postLevel AS post_level, C.authority AS authority, C.opening AS opening, C.posting AS posting, B.path AS picture from chatroom AS A
        JOIN picture_table AS B ON A.icon = B.id
        JOIN user_chatroom_unit AS C ON C.chatroom_id = A.id
        WHERE A.id = $1
        AND C.user_id = $2;`, [id, user_id])
        .then((r) => {
          if(picture){
            saveImage(r.rows[0].picture, picture);
          }
          const data = r.rows.map(x => { return { ...x, picture: getImage(x.picture)}; });
          callback({message: 'update room success!', status: true, data, id });
        })
        .catch((e) => {
          console.log(e);
          callback({message: "update room error.", status: false});
        })
    }else{
      callback({message: "error update room", status: false});
    }
  })
  .catch((err) => {
    console.log(err);
    callback({message: "cannnot update room", status: false});
  })
}

function deleteRoom(room_id: number, callback: Function){
  pool.query("DELETE FROM user_chatroom_unit WHERE chatroom_id=$1;", [room_id])
  .then((res) => {
    pool.query("DELETE FROM chatroom WHERE (id)=($1);", [room_id])
    .then((re) => {
      pool.query("DELETE FROM tweet WHERE room_id=$1;", [room_id])
      .then((r) => {
        callback({message: "delete fromに成功しました"});
      })
      .catch((e) => {
        callback({message: "delete fromに失敗しました3"});
      })
    })
    .catch((er) => {
      callback({message: "delete from に失敗しました1"});
    })
  })
  .catch((err) => {
    callback({message: "delete from に失敗しました。2"});
  })
}

function selectAllUser(callback: Function){
  pool.query("SELECT A.id AS id, A.name AS name, B.path AS picture, A.mail AS mail, A.authority AS authority FROM user_table AS A, picture_table AS B WHERE A.image=B.id;")
  .then((res) => {
    var rows = (res.rows).map(function(row){
      var r = row;
      r.picture = getImage(r.picture);
      return r;
    });
    callback({data: rows});
  })
  .catch((err) => {
    callback({message: "取得に失敗しました。"});
  })
}

function selectUsersInRoom(room_id: string, callback: Function){
  pool.query(`
  SELECT user_table.id AS user_id, user_table.name AS user_name, picture_table.path AS picture, user_chatroom_unit.authority AS authority FROM user_table
  JOIN user_chatroom_unit ON user_chatroom_unit.user_id = user_table.id
  JOIN picture_table ON picture_table.id = user_table.image
  WHERE user_chatroom_unit.chatroom_id = $1;
  `, [room_id])
  .then((response) => {
    var users = (response.rows).map(function(row){
      var r = row;
      r.picture = getImage(r.picture);
      return r;
    });
    callback({rows: users});
  })
  .catch((error) => {
    console.log(error);
    callback({message: "エラーが発生しました。"});
  })
}

function updateUser(id: string, name: string, picture: any, password: string, mail: string, authority: boolean, callback: Function){
  pool.query("SELECT * FROM user_table WHERE id = $1 AND pgp_sym_decrypt(password, 'password') = $2;", [id, password])
  .then((res) => {
    if(res.rows.length==1){
      pool.query("UPDATE user_table SET (name,mail,authority) = ($1,$2,$3) WHERE id = $4 RETURNING *;", [name, mail, authority, id])
      .then((resp) => {
        pool.query("SELECT A.id AS id, A.name AS name, A.mail AS mail, A.authority AS authority, B.path AS image FROM user_table AS A JOIN picture_table AS B ON B.id = A.image WHERE A.id = $1", [id])
        .then((r) => {
          if(picture){
            saveImage(r.rows[0].image, picture);
          }
          const data = r.rows.map(x => { return {...x, image: getImage(x.image)}; })[0];
          callback({message: 'user update success!', status: true, data})
        })
        .catch((e) => {
          console.log(e);
          callback({message: 'user update error.', status: false})
        })
      })
      .catch((erro) => {
        console.log(erro);
        callback({message: "updateに失敗しました。", status: false})
      })
    }else{
      callback({message: "一致するユーザーがいません。", status: false})
    }
  })
  .catch((err) => {
    console.log(err);
    callback({message: "error from update user."});
  })
}

function deleteUser(user_id: string, callback: Function){
  pool.query("DELETE FROM user_chatroom_unit WHERE (user_id)=($1);", [user_id])
  .then((resp) =>{
    pool.query("DELETE FROM tweet WHERE (user_id)=($1);", [user_id])
    .then((response) => {
      pool.query("DELETE FROM user_table WHERE id=$1 RETURNING *;", [user_id])
      .then((res) => {
        callback({message: "ユーザーを削除しました。"});
        // pool.query("DELETE FROM picture_table WHERE id=$1 RETURNING *;", [res.rows[0].image])
        // .then((re) => {
        //   console.log('re:', re);
        //   console.log({message: "ユーザーを削除しました。"});
        // })
        // .catch((er) => {
        //   console.log(er);
        //   console.log('えらー１');
        // })
      })
      .catch((err) => {
        console.log(err);
        callback({message: 'えらー２'});
      })
    })
    .catch((errr) => {
      console.log(errr);
      callback({message: 'えらー４'})
    })
  })
  .catch((error) => {
    console.log(error);
    callback({message: 'えらー３'});
  })
}

/**
 * 一つ分の部屋のデータを送信する関数。
 * @param user_id User ID
 * @param room_id Room ID
 * @param callback 結果を返す関数
 */
function getSingleRoom(user_id: String, room_id: number, callback: Function){
  let result = { single_room:null, single_roommember:null, single_tweet:null, single_pictweet:null };
  pool.query(`SELECT A.id AS id, A.name AS name, A.openLevel AS open_level, A.postLevel AS post_level, C.authority AS authority, C.opening AS opening, C.posting AS posting, B.path AS picture from chatroom AS A
  JOIN picture_table AS B ON A.icon = B.id
  JOIN user_chatroom_unit AS C ON C.chatroom_id = A.id
  WHERE C.user_id = $1
  AND A.id = $2
  ORDER BY A.id;`, [user_id, room_id])
  .then(response => {
    result.single_room = (response.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
    pool.query(`SELECT user_table.id AS user_id, B.chatroom_id AS room_id, user_table.name AS user_name, picture_table.path AS picture, B.authority AS authority FROM user_table
    JOIN user_chatroom_unit AS B ON B.user_id = user_table.id
    JOIN picture_table ON picture_table.id = user_table.image
    WHERE B.chatroom_id = $1;`, [room_id])
    .then(response => {
      result.single_roommember = (response.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
      pool.query(`SELECT tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name AS user, user_table.id AS user_id, user_table.path AS user_icon, picture_table.path AS picture, C.count AS count, C.check AS check FROM tweet
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
      ORDER BY tweet.id DESC;`, [user_id, room_id])
      .then(response => {
        console.log(response.rows);
        result.single_tweet = (response.rows).map((row) => { return { ...row, picture: (row.picture)? getImage(row.picture): null, user_icon: getImage(row.user_icon) }; });
        pool.query(`SELECT tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name AS user, user_table.id AS user_id, user_table.path AS user_icon, picture_table.path AS picture, C.count AS count, C.check AS check FROM tweet
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
        ORDER BY tweet.id DESC;`, [user_id, room_id])
        .then(response => {
          result.single_pictweet = (response.rows).map((row) => { return { ...row, picture: getImage(row.picture), user_icon: getImage(row.user_icon) }; });
          callback(result);
        })
        .catch(error => {
          console.log(error);
          callback({message: '最後にエラーです。'});
        })
      })
      .catch(error => {
        console.log(error);
        callback({message: 'エラーです'});
      })
    })
    .catch(error => {
      console.log(error);
      callback({message: "エラーが発生しました。"});
    })
  })
  .catch(error => {
    console.log(error);
    callback({message: "エラーが生じました。"})
  })
}

export {
  addUserIntoRoom,
  removeUserFromRoom,
  addUserWithPicture,
  createUserRoom,
  createUserRoomWithPicture,
  deleteRoom,
  selectAllUser,
  selectUsersInRoom,
  updateUser,
  deleteUser,
  selectAllRoom,
  updateRoom,
  getSingleRoom,
}