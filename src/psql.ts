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
function createUserRoom(chatroom_icon: number, chatroom_name: string, user_id: string, callback: any){
  pool.query("INSERT INTO chatroom(icon,name) VALUES($1,$2) RETURNING *;",[chatroom_icon, chatroom_name])
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

function createUserRoomWithPicture(chatroom_name: string, user_id: string, picture_label: string, picture_path: string, callback: any){
  pool.query("insert into picture_table(label,path) values($1,$2) returning *;", [picture_label, picture_path])
  .then((res) => {
    // createUserRoom(user_id, user_name, user_password, res.rows[0].id, response);
    createUserRoom(res.rows[0].id, chatroom_name, user_id, callback);
  })
  .catch((err) => {
    // response.json({message: "部屋の画像の登録に失敗しました。"});
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
function addUser(id: string, name: string, password: string, picture_id: number, response: any){
    pool.query("insert into user_table(id,name,password,image) values($1,$2,pgp_sym_encrypt($3,'password'),$4) returning *;", [id, name, password, picture_id])
    .then((res) => {
      createUserRoom(res.rows[0].image, res.rows[0].name, res.rows[0].id, response);
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
function addUserWithPicture(user_id: string, user_name: string, user_password: string, picture_label: string, picture_path: string, response: any){
    pool.query("insert into picture_table(label,path) values($1,$2) returning *;", [picture_label, picture_path])
    .then((res) => {
        addUser(user_id, user_name, user_password, res.rows[0].id, response);
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

function updateRoom(id: number, name: string, picture: any, callback: Function){
  pool.query("UPDATE chatroom SET name = $1 WHERE id = $2 RETURNING *;", [name, id])
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
  pool.query("SELECT A.id AS id, A.name AS name, B.path AS picture FROM user_table AS A, picture_table AS B WHERE A.image=B.id;")
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

function updateUser(id: string, name: string, picture: any, password: string, email: string, callback: Function){
  pool.query("SELECT * FROM user_table WHERE id = $1 AND pgp_sym_decrypt(password, 'password') = $2;", [id, password])
  .then((res) => {
    if(res.rows.length==1){
      pool.query("UPDATE user_table SET name = $1 WHERE id = $2 RETURNING *;", [name, id])
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
  .catch((error) => {
    console.log(error);
    callback({message: 'えらー３'});
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
  updateRoom
}