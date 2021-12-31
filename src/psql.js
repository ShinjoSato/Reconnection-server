"use strict";
exports.__esModule = true;
exports.createUserRoom = exports.addUserWithPicture = exports.addUser = exports.removeUserFromRoom = exports.addUserIntoRoom = void 0;
// PostgreSQL
var type = require('express/lib/response').type;
var Pool = require('pg').Pool;
var pool_data = {
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'password',
    port: 5432
};
var pool = new Pool(pool_data);
/**
 * PostgreSQL上に部屋を作成して任意のユーザーを登録する関数。
 * @param chatroom_image テーブル名picture_tableのカラムid。
 * @param chatroom_name テーブル名chatroomのカラムname。
 * @param user_id テーブル名user_tableのカラムid。
 * @param callback 取得したデータを返すFuncstionまたはObject。
 */
function createUserRoom(chatroom_icon, chatroom_name, user_id, callback) {
    pool.query("INSERT INTO chatroom(icon,name) VALUES($1,$2) RETURNING *;", [chatroom_icon, chatroom_name])
        .then(function (re) {
        pool.query("INSERT INTO user_chatroom_unit VALUES($1,$2) RETURNING *;", [user_id, re.rows[0].id])
            .then(function (r) {
            if (typeof (callback) == "function") {
                callback(r);
            }
            else if (typeof (callback) == "object") {
                callback.json(r);
            }
        })["catch"](function (err) {
            console.log("err:\n", err);
            if (typeof (callback) == "function") {
                callback({ message: "err" });
            }
            else if (typeof (callback) == "object") {
                callback.json({ message: "err" });
            }
        });
    })["catch"](function (erro) {
        console.log("erro:\n", erro);
        if (typeof (callback) == "function") {
            callback({ message: "erro" });
        }
        else if (typeof (callback) == "function") {
            callback.json({ message: "erro" });
        }
    });
}
exports.createUserRoom = createUserRoom;
/**
 * ユーザーと部屋の結び付きを作る関数。
 * @param user_id ユーザーid。
 * @param room_id ルームid。
 * @param callback 結果を返信する関数。
 */
function addUserIntoRoom(user_id, room_id, callback) {
    console.log(user_id, room_id);
    pool.query("INSERT INTO user_chatroom_unit VALUES($1,$2);", [user_id, room_id])
        .then(function (res) {
        callback({ message: "SUCCESS: from add-user-into-room" });
    })["catch"](function (err) {
        console.log(err);
        callback({ message: "ERROR: from add-user-into-room" });
    });
}
exports.addUserIntoRoom = addUserIntoRoom;
/**
 * ユーザーと部屋の結び付きを外す関数。
 * @param user_id ユーザーid。
 * @param room_id ルームid。
 * @param callback 結果を返信する関数。
 */
function removeUserFromRoom(user_id, room_id, callback) {
    pool.query("DELETE FROM user_chatroom_unit WHERE (user_id, chatroom_id) = ($1,$2);", [user_id, room_id])
        .then(function (res) {
        callback({ message: "SUCCESS: remove-user-from-room" });
    })["catch"](function (err) {
        console.log(err);
        callback({ message: "ERROR: remove-user-from-room" });
    });
}
exports.removeUserFromRoom = removeUserFromRoom;
/**
 * ユーザー登録する関数。
 * @param id ユーザーid。
 * @param name ユーザーネーム。
 * @param password ユーザーパスワード。
 * @param picture_id 画像id。
 * @param response 結果を返信する関数。
 */
function addUser(id, name, password, picture_id, response) {
    pool.query("insert into user_table(id,name,password,image) values($1,$2,pgp_sym_encrypt($3,'password'),$4) returning *;", [id, name, password, picture_id])
        .then(function (res) {
        createUserRoom(res.rows[0].image, res.rows[0].name, res.rows[0].id, response);
    })["catch"](function (err) {
        response.json({ message: "画像なしでユーザーの登録に失敗しました。" });
    });
}
exports.addUser = addUser;
/**
 * 画像付きでユーザー登録する関数。
 * @param user_id ユーザーid。
 * @param user_name ユーザーネーム。
 * @param user_password ユーザーパスワード。
 * @param picture_label 画像のラベル。
 * @param picture_path 画像までのディレクトリーパス。
 * @param response 結果を返信する関数。
 */
function addUserWithPicture(user_id, user_name, user_password, picture_label, picture_path, response) {
    pool.query("insert into picture_table(label,path) values($1,$2) returning *;", [picture_label, picture_path])
        .then(function (res) {
        addUser(user_id, user_name, user_password, res.rows[0].id, response);
    })["catch"](function (err) {
        response.json({ message: "ユーザーの画像の登録に失敗しました。" });
    });
}
exports.addUserWithPicture = addUserWithPicture;
