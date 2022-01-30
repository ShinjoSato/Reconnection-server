// PostgreSQL
const { type } = require('express/lib/response');
const { Pool } = require('pg')
const pool_data = {
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'password',
  port: 5432
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
function createUserRoom(chatroom_icon: number, chatroom_name: string, user_id: string, open_level: number, post_level: number, callback: any){
  pool.query("INSERT INTO chatroom(icon,name,openLevel,postLevel) VALUES($1,$2,$3,$4) RETURNING *;",[chatroom_icon, chatroom_name, open_level, post_level])
  .then(re=>{
    pool.query("INSERT INTO user_chatroom_unit VALUES($1,$2) RETURNING *;",[user_id, re.rows[0].id])
    .then(r=>{
      if(typeof(callback)=="function"){
        callback(r);
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

function createUserRoomWithPicture(chatroom_name: string, user_id: string, open_level: number, post_level: number, picture_label: string, picture_path: string, callback: any){
  pool.query("insert into picture_table(label,path) values($1,$2) returning *;", [picture_label, picture_path])
  .then((res) => {
    createUserRoom(res.rows[0].id, chatroom_name, user_id, open_level, post_level, callback);
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
function addUserIntoRoom(user_id: string, room_id: number, callback: Function){
    console.log(user_id, room_id);
    pool.query("INSERT INTO user_chatroom_unit VALUES($1,$2);", [user_id, room_id])
    .then((res) => {
      callback({message: "SUCCESS: from add-user-into-room"});
    })
    .catch((err) => {
      console.log(err);
      callback({message: "ERROR: from add-user-into-room"});
    });
}

/**
 * ユーザーと部屋の結び付きを外す関数。
 * @param user_id ユーザーid。
 * @param room_id ルームid。
 * @param callback 結果を返信する関数。
 */
function removeUserFromRoom(user_id: string, room_id: number, callback: Function){
    pool.query("DELETE FROM user_chatroom_unit WHERE (user_id, chatroom_id) = ($1,$2);", [user_id, room_id])
    .then((res) => {
      callback({message: "SUCCESS: remove-user-from-room"});
    })
    .catch((err) => {
      console.log(err);
      callback({message: "ERROR: remove-user-from-room"});
    });
}

/**
 * ユーザー登録する関数。
 * @param id ユーザーid。
 * @param name ユーザーネーム。
 * @param password ユーザーパスワード。
 * @param picture_id 画像id。
 * @param response 結果を返信する関数。
 */
function addUser(id: string, name: string, password: string, picture_id: number, mail: string, authority: boolean, response: any){
    pool.query("insert into user_table(id,name,password,image,mail,authority) values($1,$2,pgp_sym_encrypt($3,'password'),$4,$5,$6) returning *;", [id, name, password, picture_id, mail, authority])
    .then((res) => {
      createUserRoom(res.rows[0].image, res.rows[0].name, res.rows[0].id, 1, 1, response);
    })
    .catch((err) => {
      response.json({message: "画像なしでユーザーの登録に失敗しました。"});
    });
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
        addUser(user_id, user_name, user_password, res.rows[0].id, user_mail, user_authority, response);
    })
    .catch((err) => {
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

function selectRoom(user_id: string, callback: Function){
  pool.query(`
  SELECT chatroom.id, chatroom.name, picture_table.path AS picture
  FROM chatroom
  JOIN user_chatroom_unit on user_chatroom_unit.chatroom_id = chatroom.id
  JOIN picture_table ON picture_table.id = chatroom.icon
  WHERE user_chatroom_unit.user_id = $1;
  `
  , [user_id])
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

function updateRoom(id: number, name: string, open_level: number, post_level: number, picture: any, callback: Function){
  pool.query("UPDATE chatroom SET (name, openLevel, postLevel) = ($1, $2, $3) WHERE id = $4 RETURNING *;", [name, open_level, post_level, id])
  .then((res) => {
    if(res.rows.length==1){
      callback({message: "update room success"})
      if(picture){
        pool.query("SELECT picture_table.path AS path FROM chatroom JOIN picture_table ON picture_table.id = chatroom.icon WHERE chatroom.icon = $1;", [res.rows[0].icon])
        .then((r) => {
          saveImage(r.rows[0].path, picture);
          callback({message: '画像も更新したupdate room.'});
        })
        .catch((e) => {
          console.log(e);
          callback({message: "画像を更新する時にエラーupdate room."});
        })
      }else{
        callback({message: "update room success"});
      }
    }else{
      callback({message: "error update room"});
    }
  })
  .catch((err) => {
    console.log(err);
    callback({message: "cannnot update room"});
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

function updateUser(id: string, name: string, picture: any, password: string, mail: string, authority: boolean, callback: Function){
  pool.query("SELECT * FROM user_table WHERE id = $1 AND pgp_sym_decrypt(password, 'password') = $2;", [id, password])
  .then((res) => {
    if(res.rows.length==1){
      pool.query("UPDATE user_table SET (name,mail,authority) = ($1,$2,$3) WHERE id = $4 RETURNING *;", [name, mail, authority, id])
      .then((resp) => {
        if(picture){
          pool.query("SELECT picture_table.path AS path FROM user_table JOIN picture_table ON picture_table.id = user_table.image WHERE user_table.id = $1;", [id])
          .then((r) => {
            saveImage(r.rows[0].path, picture);
            callback({message: '画像も更新させられましてuser update'})
          })
          .catch((e) => {
            console.log(e);
            callback({message: '画像を読み込ませるときにエラー'})
          })
        }else{
          callback({message: "画像なしupdateに成功しました"})
        }
      })
      .catch((erro) => {
        console.log(erro);
        callback({message: "updateに失敗しました。"})
      })
    }else{
      callback({message: "一致するユーザーがいません。"})
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

function selectTweetWithPic(room_id: number, callback: Function){
  console.log('select tweet with pic:', room_id);
  pool.query(`
  select tweet.id, tweet, tweet.head, tweet.time, user_table.name as user, user_table.id as user_id, user_table.path as user_icon, picture_table.path as picture from tweet
  join (
      select user_table.id,user_table.name,picture_table.path from user_table
      join picture_table on user_table.image = picture_table.id
  ) as user_table on tweet.user_id = user_table.id
  left join picture_table on tweet.picture_id = picture_table.id
  where room_id = $1
  AND tweet.picture_id is not null
  order by tweet.id desc;
`, [room_id])
  .then((response) => {
    var tweet = (response.rows).map(function(row){
      var r = row;
      r.user_icon = getImage(r.user_icon);
      r.picture = getImage(r.picture);
      return r;
    });
    callback({rows: tweet});
  })
  .catch((error) => {
    console.log(error);
    callback({message: "エラー"});
  })
}

export {
  addUserIntoRoom,
  removeUserFromRoom,
  addUser,
  addUserWithPicture,
  createUserRoom,
  createUserRoomWithPicture,
  deleteRoom,
  selectAllUser,
  updateUser,
  deleteUser,
  selectAllRoom,
  selectRoom,
  updateRoom,
  selectTweetWithPic
}