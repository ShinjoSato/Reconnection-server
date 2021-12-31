"use strict";
exports.__esModule = true;
var path = require('path');
var http = require('http');
var express = require('express');
var app = express();
var fs = require('fs');
var randomBytes = require('crypto').randomBytes;
var psql_1 = require("./src/psql");
// socket.io
var host = 'localhost'; //'192.168.0.19';
var port = 8000;
var server = http.createServer(app).listen(port, host, function () {
    console.log('server start. port=' + port);
});
var io = require('socket.io')(server);
// PostgreSQL
var Pool = require('pg').Pool;
// const pool_data = {
//   user: 'postgres',
//   host: '192.168.0.7',
//   database: 'postgres',
//   password: 'password',
//   port: 15432
// }
var pool_data = {
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'password',
    port: 5432
};
var pool = new Pool(pool_data);
// Picture Directory
// const picture_directory = '/tmp_images'
var picture_directory = 'images';
var CHATROOM = null;
var ALLROOM = [];
// console.log(pool)
pool.query("select * from chatroom;", function (err, res) {
    console.log('err:', err);
    console.log('res:', res);
    console.log(res.rows);
    for (var _i = 0, _a = res.rows; _i < _a.length; _i++) {
        var room = _a[_i];
        ALLROOM.push(room.id);
    }
});
io.on('connection', function (socket) {
    console.log('socket.id:' + socket.id);
    console.log('接続できました！');
    // 切断時に発生します.
    socket.on('disconnect', function (reason) {
        console.log("disconnect: %s, %s", reason, socket.id);
    });
    socket.on('connect-to-server', function (data, callback) {
        var tmp_pool = new Pool(pool_data);
        tmp_pool.connect().then(function (client) {
            pool.query("\n        select usrt.id as id, usrt.name as name, pict.path as image from user_table as usrt\n        join picture_table as pict on pict.id = usrt.image\n        where usrt.id = $1\n        and pgp_sym_decrypt(usrt.password, 'password') = $2;\n      ", [data.userId, data.password], function (err, res) {
                var user = (res.rows).map(function (row) {
                    var r = row;
                    r.image = getImage(r.image);
                    return r;
                });
                if (res && 0 < res.rows.length) {
                    switch (data.method) {
                        case 'login':
                            callback(user[0]);
                            break;
                        case 'register':
                            delete data.method;
                            callback(data);
                            break;
                    }
                }
            });
        })["catch"](function (err) {
            console.log(err);
        });
    });
    socket.on('chat', function (data) {
        if (data.picture) {
            // With picture
            var path = "".concat(picture_directory, "/").concat(generateRandomString(12), ".png");
            while (isExisted(path)) {
                path = "".concat(picture_directory, "/").concat(generateRandomString(12), ".png");
            }
            fs.writeFile(path, setImage(data.picture), 'base64', function (err) {
                pool.query("\n          insert into picture_table(label,path)\n          values($1,$2) returning *;\n        ", ['練習用のラベル', path], function (error, res) {
                    pool.query("\n            insert into tweet(tweet,room_id,user_id,picture_id)\n            values($1,$2,$3,$4) returning *;\n          ", [data.text, data.room, data.user, res.rows[0].id], function (error, res) {
                        console.log('* to の確認 with picture*:', { rows: res.rows }, '\nCHATROOM:', CHATROOM);
                        for (var _i = 0, ALLROOM_1 = ALLROOM; _i < ALLROOM_1.length; _i++) {
                            var room = ALLROOM_1[_i];
                            if (room == CHATROOM) {
                                console.log('呟きを送る');
                                io.to(CHATROOM).emit('update-room', { rows: res.rows });
                            }
                            else {
                                console.log('通知を送る');
                                io.to(room).emit('receive-notification', { rows: res.rows });
                            }
                        }
                        // pool.end()
                    });
                });
            });
        }
        else {
            // Without pictures
            pool.query("\n        insert into tweet(tweet,room_id,user_id)\n        values($1,$2,$3) returning *;\n      ", [data.text, data.room, data.user], function (error, res) {
                for (var _i = 0, ALLROOM_2 = ALLROOM; _i < ALLROOM_2.length; _i++) {
                    var room = ALLROOM_2[_i];
                    if (room == CHATROOM) {
                        console.log('呟きを送る');
                        io.to(room).emit('update-room', { rows: res.rows });
                    }
                    else {
                        console.log('通知を送る');
                        io.to(room).emit('receive-notification', { rows: res.rows });
                    }
                }
                // pool.end()
            });
        }
    });
    socket.on('first-login-room', function (data, callback) {
        pool.query("\n      select * from chatroom\n      left join user_chatroom_unit as usrroom on usrroom.chatroom_id = id\n      where usrroom.user_id = $1;\n    ", [data.id], function (err, res) {
            CHATROOM = res.rows[0].chatroom_id;
            socket.join(CHATROOM);
            callback({ rows: res.rows });
        });
    });
    socket.on('check-in-room', function (data, callback) {
        pool.query("\n      select tweet.id, tweet, tweet.time, user_table.name as user, user_table.id as user_id, user_table.path as user_icon, picture_table.path as picture from tweet\n      join (\n          select user_table.id,user_table.name,picture_table.path from user_table\n          join picture_table on user_table.image = picture_table.id\n      ) as user_table on tweet.user_id = user_table.id\n      left join picture_table on tweet.picture_id = picture_table.id\n      where room_id = $1\n      order by tweet.id desc;\n    ", [data.id], function (err, res) {
            var tweet = (res.rows).map(function (row) {
                var r = row;
                r.user_icon = getImage(r.user_icon);
                if (r.picture) {
                    r.picture = getImage(r.picture);
                }
                return r;
            });
            socket.leave(CHATROOM);
            socket.join(data.id);
            CHATROOM = data.id;
            callback({ rows: tweet });
        });
    });
    socket.on('new-message', function (data, callback) {
        pool.query("\n      select tweet.id,tweet,tweet.time, user_table.name as user,user_table.path as user_icon from tweet\n      join (\n          select user_table.id,user_table.name,picture_table.path from user_table\n          join picture_table on user_table.image = picture_table.id\n      ) as user_table on tweet.user_id = user_table.id\n      where tweet.id=$1;\n    ", [data.id], function (err, res) {
            var tweet = (res.rows).map(function (row) {
                var r = row;
                r.user_icon = getImage(r.user_icon);
                return r;
            });
            callback({ rows: tweet });
        });
    });
    socket.on('call-room-list', function (data, callback) {
        pool.query("\n      select chatroom.id,chatroom.name,picture_table.path,user_chatroom_unit.user_id from chatroom\n      join picture_table on chatroom.icon = picture_table.id\n      join user_chatroom_unit on chatroom.id = user_chatroom_unit.chatroom_id\n      where user_chatroom_unit.user_id = $1;\n    ", [data.user_id], function (err, res) {
            var room = (res.rows).map(function (row) {
                var r = row;
                r.path = getImage(r.path);
                return r;
            });
            callback({ rows: room });
            // pool.end()
        });
    });
    socket.on('receive-room-member', function (data, callback) {
        pool.query("\n      select user_table.id, user_table.name, picture_table.path as picture from user_table\n      join user_chatroom_unit on user_table.id = user_chatroom_unit.user_id\n      join picture_table on user_table.image = picture_table.id\n      where user_chatroom_unit.chatroom_id = $1;\n    ", [data.id], function (err, res) {
            var rows = (res.rows).map(function (row) {
                var r = row;
                r.picture = getImage(r.picture);
                return r;
            });
            callback(rows);
        });
    });
    socket.on("receive-not-room-member", function (data, callback) {
        pool.query("\n      select user_table.id, user_table.name, picture_table.path as picture from user_table\n      join picture_table on user_table.image = picture_table.id\n      where user_table.id not in (\n        select user_table.id from user_table\n        join user_chatroom_unit on user_id = user_table.id\n        where chatroom_id = $1\n      );\n    ", [data.id])
            .then(function (res) {
            var rows = (res.rows).map(function (row) {
                var r = row;
                r.picture = getImage(r.picture);
                return r;
            });
            callback(rows);
        })["catch"](function (err) {
            callback({ message: "エラーが発生しました。" });
        });
    });
    socket.on("add-user-into-room", function (data, callback) {
        console.log(data);
        (0, psql_1.addUserIntoRoom)(data.user_id, data.room_id, callback);
    });
    socket.on("remove-user-from-room", function (data, callback) {
        console.log(data);
        (0, psql_1.removeUserFromRoom)(data.user_id, data.room_id, callback);
    });
    socket.on('create-room', function (data, callback) {
        (0, psql_1.createUserRoom)(1, data.roomName, data.userId, callback);
    });
    socket.on('receive-picture', function (data, callback) {
        var matches = String(data.binary).match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        var response = {
            type: matches[1],
            data: Buffer.from(matches[2], 'base64')
        };
        fs.writeFile("".concat(picture_directory, "/temporary.png"), response.data, 'base64', function (err) {
            if (err) {
                callback("couldn't save the image.");
            }
            else {
                callback('receive picture success!');
            }
        });
    });
    function getImage(path) {
        var data = fs.readFileSync(path);
        return "data:image;base64," + data.toString("base64");
    }
    function setImage(binary) {
        var matches = String(binary).match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        var response = {
            type: matches[1],
            data: Buffer.from(matches[2], 'base64')
        };
        return response.data;
    }
    function generateRandomString(length) {
        return randomBytes(length).reduce(function (p, i) { return p + (i % 36).toString(36); }, '');
    }
    function isExisted(file) {
        return fs.existsSync(file);
    }
});
function generateRandomString(length) {
    return randomBytes(length).reduce(function (p, i) { return p + (i % 36).toString(36); }, '');
}
function isExisted(file) {
    return fs.existsSync(file);
}
function setImage(binary) {
    var matches = String(binary).match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    var response = {
        type: matches[1],
        data: Buffer.from(matches[2], 'base64')
    };
    return response.data;
}
// expressで静的ページにアクセスする.
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'static')));
app.get("/disconnected", function (request, response) {
    console.log('request:');
    console.log(request);
    console.log('response:');
    console.log(response);
    response.set({ 'Access-Control-Allow-Origin': '*' });
    response.json({ message: "OK!" });
});
/**
 * ユーザーを作成するのと同時にそのユーザー専用のRoomを作成する。
 */
app.post("/sign-on/check", function (request, response) {
    response.set({ 'Access-Control-Allow-Origin': '*' });
    var data = request.body;
    if (data.picture != 'null') {
        var path = "./".concat(picture_directory, "/").concat(generateRandomString(12), ".png");
        while (isExisted(path)) {
            path = "./".concat(picture_directory, "/").concat(generateRandomString(12), ".png");
        }
        fs.writeFileSync(path, setImage(data.picture), 'base64');
        (0, psql_1.addUserWithPicture)(data.user_id, data.user_name, data.password1, '練習用のラベル', path, response);
    }
    else {
        (0, psql_1.addUser)(data.user_id, data.user_name, data.password1, 1, response);
    }
});
