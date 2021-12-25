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


/**
 * PostgreSQL上に部屋を作成して任意のユーザーを登録する関数。
 * @param {number} chatroom_image テーブル名picture_tableのカラムid。
 * @param {string} chatroom_name テーブル名chatroomのカラムname。
 * @param {string} user_id テーブル名user_tableのカラムid。配列にできるならしたい
 * @param {*} callback 
 */
exports.createUserRoom=(chatroom_icon, chatroom_name, user_id, callback)=>{
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
