const path = require('path');
const http = require('http');
const express = require('express');
const app = express();
const fs = require('fs')
const {randomBytes} = require('crypto')

import { 
  addUser, 
  addUserIntoRoom, 
  addUserWithPicture, 
  createUserRoom, 
  createUserRoomWithPicture, 
  removeUserFromRoom, 
  deleteRoom, 
  selectAllUser,
  selectUsersInRoom,
  updateUser,
  deleteUser,
  selectAllRoom,
  updateRoom,
  getSingleRoom,
} from "./src/psql";

import { getImage, setImage, isExisted } from "./src/system";

// socket.io
const host = 'localhost'; //'172.31.44.151';
const port = 8528; //8528, 8000
const server = http.createServer(app).listen(port, host, () => {
  console.log('server start. port=' + port);
});
const io = require('socket.io')(server);

// PostgreSQL
const { Pool } = require('pg');
// const pool_data = {
//   user: 'postgres',
//   host: '192.168.0.7',
//   database: 'postgres',
//   password: 'password',
//   port: 15432
// }
const pool_data = {
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'password',
  port: 5432 //15432
}
const pool = new Pool(pool_data)

// Picture Directory
// const picture_directory = '/tmp_images'
const picture_directory = 'images'

let CHATROOMS = [];

io.on('connection', socket => {
  console.log('socket.id:' + socket.id);
  console.log('接続できました！')

  // 切断時に発生します.
  socket.on('disconnect', reason => {
    console.log(`disconnect: %s, %s`, reason, socket.id);
  });

  socket.on('connect-to-server', (data, callback) => {
    const tmp_pool = new Pool(pool_data)
    tmp_pool.connect().then(client => {
      pool.query("select A.id as id, A.name as name, A.mail AS mail, A.authority AS authority, B.path as image from user_table as A join picture_table as B on B.id = A.image where A.id = $1 and pgp_sym_decrypt(A.password, 'password') = $2;", [data.userId, data.password], (err, res) => {
        var user = (res.rows).map(function(row){
          var r = row
          r.image = getImage(r.image)
          return r
        })
        if(res && 0 < res.rows.length){
          switch(data.method){
            case 'login':
              callback(user[0])
              break
            case 'register':
              delete data.method
              callback(data)
              break
          }
        }
      })
    })
    .catch(err => {
      console.log(err)
    })
  })

  socket.on('chat', (data, callback) => {
    if(data.picture){
      // With picture
      var path = `${ picture_directory }/${generateRandomString(12)}.png`
      while(isExisted(path)){
        path = `${ picture_directory }/${generateRandomString(12)}.png`
      }
      fs.writeFile(path, setImage(data.picture), 'base64', function(err) {
        pool.query(`
          insert into picture_table(label,path)
          values($1,$2) returning *;
        `, ['練習用のラベル', path], (error, res) => {
          pool.query(`
            insert into tweet(tweet,room_id,user_id,picture_id,head)
            values($1,$2,$3,$4,$5) RETURNING *;
          `, [data.text, data.room, data.user, res.rows[0].id, data.head], (error, res) => {
            pool.query(`
              select tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name as user, user_table.id as user_id, user_table.path as user_icon, picture_table.path as picture from tweet
              join (
                  select user_table.id,user_table.name,picture_table.path from user_table
                  join picture_table on user_table.image = picture_table.id
              ) as user_table on tweet.user_id = user_table.id
              left join picture_table on tweet.picture_id = picture_table.id
              where tweet.id = $1
            `, [res.rows[0].id])
            .then((response) => {
              var tweet = (response.rows).map(function(row){
                var r = row;
                r.user_icon = getImage(r.user_icon);
                if(r.picture){
                  r.picture = getImage(r.picture);
                }
                return r;
              });
              console.log('* to の確認 with picture*:',{rows: res.rows});
              if(CHATROOMS.includes(data.room)){
                console.log('通知を送る');
                io.to(data.room).emit('receive-notification', tweet[0])
              }
            })
            .catch((error) => {
              console.log(error);
              callback({message: "エラーが発声しました。"});
            })
            // pool.end()
          })
        })
      })
    }else{
      // Without pictures
      pool.query(`
        insert into tweet(tweet,room_id,user_id,head)
        values($1,$2,$3,$4) RETURNING *;
      `, [data.text, data.room, data.user, data.head], (error, res) => {
        pool.query(`
          select tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name as user, user_table.id as user_id, user_table.path as user_icon, picture_table.path as picture from tweet
          join (
              select user_table.id,user_table.name,picture_table.path from user_table
              join picture_table on user_table.image = picture_table.id
          ) as user_table on tweet.user_id = user_table.id
          left join picture_table on tweet.picture_id = picture_table.id
          where tweet.id = $1
        `, [res.rows[0].id])
        .then((response) => {
          var tweet = (response.rows).map(function(row){
            var r = row;
            r.user_icon = getImage(r.user_icon);
            if(r.picture){
              r.picture = getImage(r.picture);
            }
            return r;
          });
          if(CHATROOMS.includes(data.room)){
            console.log('通知を送る')
            io.to(data.room).emit('receive-notification', tweet[0])
          }
        })
        .catch((error) => {
          console.log(error);
          callback({message: "エラー"});
        })
        // pool.end()
      })
    }
  })

  socket.on('first-login-room', (data, callback) => {
    pool.query(`
      select * from chatroom
      left join user_chatroom_unit as usrroom on usrroom.chatroom_id = id
      where usrroom.user_id = $1;
    `, [data.id], (err, res) => {
      for(const val of res.rows){
        CHATROOMS.push(val.chatroom_id);
        socket.join(val.chatroom_id);
      }
      socket.join(`@${data.id}`);//@user id.
      callback({rows: res.rows});
    })
  })

  function divideByRoom (objects: Array<Object>, key: string){
    let rooms = {};
    for(const obj of objects){
      if(obj[key] in rooms){
        rooms[obj[key]].push(obj);
      }else{
        rooms[obj[key]] = [obj];
      }
    }
    return rooms;
  }

  socket.on('get-entire-login-set', (data, callback) => {
    const sqls = {
      entire_tweet: `
        SELECT tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name AS user, user_table.id AS user_id, user_table.path AS user_icon, picture_table.path AS picture FROM tweet
        JOIN (
            SELECT user_table.id,user_table.name,picture_table.path FROM user_table
            JOIN picture_table ON user_table.image = picture_table.id
        ) AS user_table ON tweet.user_id = user_table.id
        LEFT JOIN picture_table ON tweet.picture_id = picture_table.id
        JOIN(
          SELECT * FROM user_chatroom_unit
          WHERE user_id = $1
        ) AS user_chatroom_unit ON user_chatroom_unit.chatroom_id = tweet.room_id
        ORDER BY tweet.room_id, tweet.id DESC;`,
      entire_pictweet: `
        SELECT tweet.id, tweet.room_id, tweet.tweet, tweet.head, tweet.time, user_table.name AS user, user_table.id AS user_id, user_table.path AS user_icon, picture_table.path AS picture FROM tweet
        JOIN (
            SELECT user_table.id,user_table.name,picture_table.path FROM user_table
            JOIN picture_table ON user_table.image = picture_table.id
        ) AS user_table ON tweet.user_id = user_table.id
        LEFT JOIN picture_table ON tweet.picture_id = picture_table.id
        JOIN(
          SELECT * FROM user_chatroom_unit
          WHERE user_id = $1
        ) AS user_chatroom_unit ON user_chatroom_unit.chatroom_id = tweet.room_id
        WHERE tweet.picture_id IS NOT NULL
        ORDER BY tweet.id DESC;`,
      entire_room: `
        SELECT A.id AS id, A.name AS name, A.openLevel AS open_level, A.postLevel AS post_level, C.authority AS authority, C.opening AS opening, C.posting AS posting, B.path AS picture from chatroom AS A
        JOIN picture_table AS B ON A.icon = B.id
        JOIN user_chatroom_unit AS C ON C.chatroom_id = A.id
        WHERE C.user_id = $1
        ORDER BY A.id;
        `,
      entire_user: `
        SELECT user_table.id AS user_id, D.room_id, user_table.name AS user_name, picture_table.path AS picture, user_chatroom_unit.authority AS authority FROM user_table
        JOIN user_chatroom_unit ON user_chatroom_unit.user_id = user_table.id
        JOIN picture_table ON picture_table.id = user_table.image
        JOIN (
          SELECT chatroom_id AS room_id 
          FROM user_chatroom_unit
          WHERE user_id = $1
        ) AS D ON user_chatroom_unit.chatroom_id = D.room_id
        order by user_chatroom_unit.chatroom_id;
      `,
    };
    let sets = { et_tweet: null, et_pictweet: null, init_room: null, entire_room: null, entire_user: null };
    
    pool.query(sqls.entire_tweet, [data.user_id])
    .then((response) => {
      let tweets = (response.rows).map(function(row){
        var r = row;
        r.user_icon = getImage(r.user_icon);
        if(r.picture){
          r.picture = getImage(r.picture);
        }
        return r;
      });
      sets.et_tweet = divideByRoom(tweets, 'room_id');

      pool.query(sqls.entire_pictweet, [data.user_id])
      .then((response2) => {
        var tweets = (response2.rows).map(function(row){
          var r = row;
          r.user_icon = getImage(r.user_icon);
          r.picture = getImage(r.picture);
          return r;
        });
        sets.et_pictweet = divideByRoom(tweets, 'room_id');

        pool.query(`
          SELECT A.*, B.*, C.path AS picture from chatroom AS A
          LEFT JOIN user_chatroom_unit AS B ON B.chatroom_id = A.id
          JOIN picture_table AS C ON C.id = A.icon
          WHERE B.user_id = $1;
        `, [data.user_id])
        .then((res) => {
          var rooms = (res.rows).map(function(row){
            var r = row;
            r.picture = getImage(r.picture);
            return r;
          });
          sets.init_room = rooms;

          pool.query(sqls.entire_room, [data.user_id])
          .then((response4) => {
            var rows = (response4.rows).map(function(row){
              var r = row;
              r.picture = getImage(r.picture);
              return r;
            });
            sets.entire_room = divideByRoom(rows, 'id');

            pool.query(sqls.entire_user, [data.user_id])
            .then((response5) => {
              var users = (response5.rows).map(function(row){
                var r = row;
                r.picture = getImage(r.picture);
                return r;
              });
              sets.entire_user = divideByRoom(users, 'room_id');
              callback(sets);
            })
            .catch((error5) => {
              console.log(error5);
              callback({message: "エラー5"});
            })
          })
          .catch((error4) => {
            console.log(error4);
            callback({message: "エラー4"});
          })
        }).catch((error3) => {
          console.log(error3);
          callback({message: "エラー3"});
        })
      }).catch((error2) => {
        console.log(error2);
        callback({ message: "エラー2" });
      })
    })
    .catch((error) => {
      console.log(error);
      callback({ message: "エラー1" });
    })
  })

  socket.on('new-message', (data, callback) => {
    pool.query(`
      select tweet.id, tweet, tweet.head, tweet.time, user_table.name as user, user_table.path as user_icon from tweet
      join (
          select user_table.id,user_table.name,picture_table.path from user_table
          join picture_table on user_table.image = picture_table.id
      ) as user_table on tweet.user_id = user_table.id
      where tweet.id=$1;
    `, [data.id], (err, res) => {
      var tweet = (res.rows).map(function(row){
        var r = row
        r.user_icon = getImage(r.user_icon)
        return r
      })
      callback({rows: tweet})
    })
  });

  socket.on('call-room-list', (data, callback) => {
    pool.query(`
      select chatroom.id,chatroom.name,picture_table.path AS picture,user_chatroom_unit.user_id from chatroom
      join picture_table on chatroom.icon = picture_table.id
      join user_chatroom_unit on chatroom.id = user_chatroom_unit.chatroom_id
      where user_chatroom_unit.user_id = $1;
    `, [data.user_id], (err, res) => {
        var room = (res.rows).map(function(row){
          var r = row
          r.picture = getImage(r.picture)
          return r
        })
        callback({rows: room})
        // pool.end()
    })
  })

  socket.on('receive-room-member', (data, callback) => {
    console.log("receive room member.");
    selectUsersInRoom(data.id, callback);
  })

  socket.on("receive-not-room-member-but-friend", (data,callback) => {
    pool.query(`
      SELECT user_table.id AS user_id, user_table.name AS user_name, picture_table.path AS picture FROM user_table
      JOIN picture_table ON user_table.image = picture_table.id
      JOIN user_friend_unit AS C ON C.friend_id = user_table.id
      WHERE user_table.id NOT IN (
        SELECT user_table.id FROM user_table
        JOIN user_chatroom_unit ON user_id = user_table.id
        WHERE chatroom_id = $1
      )
      AND C.user_id = $2;
    `, [data.room_id, data.user_id])
    .then((res) => {
      var rows = (res.rows).map((row) => { return { ...row, picture: getImage(row.picture) }; });
      callback(rows);
    })
    .catch((err) => {
      callback({message: "エラーが発生しました。"});
    });
  });

  socket.on("receive-chatroom-with-picture", (data, callback) => {
    pool.query("SELECT A.id AS id, A.name AS name, A.openLevel AS open_level, A.postLevel AS post_level, B.path AS picture FROM chatroom AS A, picture_table AS B WHERE A.icon=B.id AND A.id=$1;", [data.room_id])
    .then((res) => {
      var rows = (res.rows).map(function(row){
        var r = row;
        r.picture = getImage(r.picture);
        return r;
      });
      callback(rows);
    })
    .catch((err) => {
      console.log(err);
      callback({message: "エラーが発生しました。"});
    })
  });

  socket.on("add-user-into-room", (data, callback) => {
    console.log(data);
    addUserIntoRoom(data.user_id, data.room_id, callback, io);
  })

  socket.on("remove-user-from-room", (data, callback) => {
    console.log(data);
    removeUserFromRoom(data.user_id, data.room_id, callback, io);

  })

  socket.on('create-room', (data,callback) => {
    console.log('部屋を作ります。')
    console.log(data);
    if(data.picture){
      var path = `./${ picture_directory }/${generateRandomString(12)}.png`
      while(isExisted(path)){
        path = `./${ picture_directory }/${generateRandomString(12)}.png`
      }
      fs.writeFileSync(path, setImage(data.picture), 'base64');
      createUserRoomWithPicture(data.roomName, data.userId, data.open_level, data.post_level, '部屋の画像ラベル', path, callback);
    }else{
      createUserRoom(1, './images/default.png', data.roomName, data.userId, data.open_level, data.post_level, callback);
    }
  });

  socket.on('select-all-room', (data, callback) => {
    console.log('select all room.\n', data);
    selectAllRoom(callback);
  });

  socket.on('update-room', (data, callback) => {
    console.log('update room.');
    updateRoom(data.id, data.name, data.open_level, data.post_level, data.picture, callback);
  })

  socket.on('delete-room', (data, callback) => {
    console.log('delete room.\n', data);
    deleteRoom(data.room_id, callback);
  });

  socket.on('select-all-user', (data, callback) => {
    console.log('select all user.');
    selectAllUser(callback);
  });

  socket.on('select-users-in-room', (data, callback) => {
    console.log('select users in room.');
    selectUsersInRoom(data.room_id, callback);
  });

  socket.on('update-user', (data, callback) => {
    console.log('update user.');
    updateUser(data.id, data.name, data.picture, data.password, data.mail, data.authority, callback);
  });

  socket.on('delete-user', (data, callback) => {
    console.log('delete user.\n', data);
    deleteUser(data.user_id, callback);
  })

  socket.on('log-out', (data, callback) => {
    console.log('log out.');
    for(const room of CHATROOMS){
      socket.leave(room);
    }
    CHATROOMS = [];
    socket.disconnect();
  })

  /**
   * 新しい部屋に追加された時に取得するデータ.
   */
  socket.on('get-single-room', (data, callback) => {
    getSingleRoom(data.user_id, data.room_id, callback);
  })

  socket.on('enter-new-room', (data, callback) => {
    CHATROOMS.push(data.room_id);
    socket.join(data.room_id);
    callback({message: "新しい部屋に登録されました。"});
  });

  socket.on('get-invited-room', (data, callback) => {
    pool.query(`SELECT A.id AS id, A.name AS NAME, A.openlevel AS open_level, A.postlevel AS post_level, B.path AS picture FROM chatroom AS A
    JOIN picture_table AS B ON A.icon = B.id
    WHERE A.id = $1;`, [data.room_id])
    .then((response) => {
      let room = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
      callback(room);
    })
    .catch((error) => {
      console.log(error);
      callback({message: 'Error occurs!'});
    })
  })

  socket.on('get-friend-list', (data, callback) => {
    pool.query(`SELECT A.id AS id, A.name AS name, B.path AS picture, A.mail AS mail, A.authority AS authority
    FROM user_table AS A
    JOIN picture_table AS B ON B.id = A.image
    JOIN (
      SELECT *
      FROM user_friend_unit AS A
      WHERE A.user_id = $1
    ) AS C ON A.id = C.friend_id;`, [data.user_id])
    .then(response => {
      let friends = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
      callback(friends);
    })
    .catch(error => {
      console.log(error);
      callback({message: error.message});
    })
  })

  socket.on('search-user', (data, callback) => {
    pool.query(`SELECT A.id AS id, A.name AS name, B.path AS picture, A.mail AS mail, A.authority AS authority
    FROM user_table AS A
    JOIN picture_table AS B ON B.id = A.image
    WHERE A.id like $1;`, [data.user_id])
    .then((response) => {
      let user = (response.rows).map((row) => { return {...row, picture: getImage(row.picture)} });
      callback(user);
    })
    .catch((error) => {
      console.log(error);
      callback({message:error.message});
    })
  })

  socket.on('connect-to-friend', (data, callback) => {
    pool.query(`INSERT INTO user_friend_unit(user_id, friend_id) VALUES($1, $2);`, [data.user_id, data.friend_id])
    .then((response) => {
      callback({ message: '追加しました。', status: true });
    })
    .catch((error) => {
      console.log(error);
      callback({ message: error.message, status: false });
    })
  })

  function generateRandomString(length) {
    return randomBytes(length).reduce((p, i) => p + (i % 36).toString(36), '')
  }
});

function generateRandomString(length) {
  return randomBytes(length).reduce((p, i) => p + (i % 36).toString(36), '');
}

// expressで静的ページにアクセスする.
app.use(express.urlencoded({extended: true, limit: '10mb'}));
app.use(express.static(path.join(__dirname, 'static')));

app.get("/disconnected", function (request, response) {
  console.log('request:')
  console.log(request)
  
  console.log('response:')
  console.log(response)
  response.set({ 'Access-Control-Allow-Origin': '*' })
  response.json({message: "OK!"});
});

/**
 * ユーザーを作成するのと同時にそのユーザー専用のRoomを作成する。
 */
app.post("/sign-on/check", function (request, response) {
  response.set({ 'Access-Control-Allow-Origin': '*' });
  const data = request.body;
  if(data.picture!='null'){
    var path = `./${ picture_directory }/${generateRandomString(12)}.png`
    while(isExisted(path)){
      path = `./${ picture_directory }/${generateRandomString(12)}.png`
    }
    fs.writeFileSync(path, setImage(data.picture), 'base64');
    addUserWithPicture(data.user_id, data.user_name, data.password1, data.mail, data.authority, '練習用のラベル', path, response);
    
  }else{
    addUser(data.user_id, data.user_name, data.password1, 1, './images/default.png', data.mail, data.authority, response);
  }
});
