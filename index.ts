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
  updateUser,
  deleteUser,
  selectAllRoom,
  selectRoom,
  updateRoom
} from "./src/psql";

import { getImage, setImage, isExisted } from "./src/system";

// socket.io
const host = 'localhost'; //'192.168.0.19';
const port = 8000;
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
  port: 5432
}
const pool = new Pool(pool_data)

// Picture Directory
// const picture_directory = '/tmp_images'
const picture_directory = 'images'

let CHATROOM = null
let ALLROOM = []

// console.log(pool)
pool.query(`select * from chatroom;`, (err, res) => {
  console.log('err:', err)
  console.log('res:', res)
  console.log(res.rows)
  for(const room of res.rows){
    ALLROOM.push(room.id)
  }
})


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
      pool.query(`
        select usrt.id as id, usrt.name as name, pict.path as image from user_table as usrt
        join picture_table as pict on pict.id = usrt.image
        where usrt.id = $1
        and pgp_sym_decrypt(usrt.password, 'password') = $2;
      `, [data.userId, data.password], (err, res) => {
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

  socket.on('chat', (data) => {
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
            insert into tweet(tweet,room_id,user_id,picture_id)
            values($1,$2,$3,$4) returning *;
          `, [data.text, data.room, data.user, res.rows[0].id], (error, res) => {
            console.log('* to の確認 with picture*:',{rows: res.rows}, '\nCHATROOM:',CHATROOM)
            for(const room of ALLROOM){
              if(room == CHATROOM){
                console.log('呟きを送る')
                io.to(CHATROOM).emit('update-room',{rows: res.rows})
              }else{
                console.log('通知を送る')
                io.to(room).emit('receive-notification', {rows:res.rows})
              }
            }
            // pool.end()
          })
        })
      })
    }else{
      // Without pictures
      pool.query(`
        insert into tweet(tweet,room_id,user_id)
        values($1,$2,$3) returning *;
      `, [data.text, data.room, data.user], (error, res) => {
        for(const room of ALLROOM){
          if(room == CHATROOM){
            console.log('呟きを送る')
            io.to(room).emit('update-room',{rows: res.rows})
          }else{
            console.log('通知を送る')
            io.to(room).emit('receive-notification', {rows:res.rows})
          }
        }
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
      CHATROOM = res.rows[0].chatroom_id
      socket.join(CHATROOM)
      callback({rows: res.rows})
    })
  })

  socket.on('check-in-room', (data, callback) => {
    pool.query(`
      select tweet.id, tweet, tweet.time, user_table.name as user, user_table.id as user_id, user_table.path as user_icon, picture_table.path as picture from tweet
      join (
          select user_table.id,user_table.name,picture_table.path from user_table
          join picture_table on user_table.image = picture_table.id
      ) as user_table on tweet.user_id = user_table.id
      left join picture_table on tweet.picture_id = picture_table.id
      where room_id = $1
      order by tweet.id desc;
    `, [data.id], (err, res) => {
      var tweet = (res.rows).map(function(row){
        var r = row
        r.user_icon = getImage(r.user_icon)
        if(r.picture){
          r.picture = getImage(r.picture)
        }
        return r
      })
      socket.leave(CHATROOM)
      socket.join(data.id)
      CHATROOM = data.id
      callback({rows: tweet})
    })
  });

  socket.on('new-message', (data, callback) => {
    pool.query(`
      select tweet.id,tweet,tweet.time, user_table.name as user,user_table.path as user_icon from tweet
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

  socket.on('receive-room-member', (data,callback) => {
    pool.query(`
      select user_table.id, user_table.name, picture_table.path as picture from user_table
      join user_chatroom_unit on user_table.id = user_chatroom_unit.user_id
      join picture_table on user_table.image = picture_table.id
      where user_chatroom_unit.chatroom_id = $1;
    `, [data.id], (err, res) => {
      var rows = (res.rows).map(function(row){
        var r = row
        r.picture = getImage(r.picture)
        return r
      })
      callback(rows)
    })
  })

  socket.on("receive-not-room-member", (data,callback) => {
    pool.query(`
      select user_table.id, user_table.name, picture_table.path as picture from user_table
      join picture_table on user_table.image = picture_table.id
      where user_table.id not in (
        select user_table.id from user_table
        join user_chatroom_unit on user_id = user_table.id
        where chatroom_id = $1
      );
    `, [data.id])
    .then((res) => {
      var rows = (res.rows).map(function(row){
        var r = row;
        r.picture = getImage(r.picture);
        return r;
      });
      callback(rows);
    })
    .catch((err) => {
      callback({message: "エラーが発生しました。"});
    });
  });

  socket.on("receive-chatroom-with-picture", (data, callback) => {
    pool.query("SELECT A.id AS id, A.name AS name, B.path AS picture FROM chatroom AS A, picture_table AS B WHERE A.icon=B.id AND A.id=$1;", [data.room_id])
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
    addUserIntoRoom(data.user_id, data.room_id, callback);
  })

  socket.on("remove-user-from-room", (data, callback) => {
    console.log(data);
    removeUserFromRoom(data.user_id, data.room_id, callback);
  })

  socket.on('create-room', (data,callback) => {
    console.log(data);
    if(data.picture.data){
      var path = `./${ picture_directory }/${generateRandomString(12)}.png`
      while(isExisted(path)){
        path = `./${ picture_directory }/${generateRandomString(12)}.png`
      }
      fs.writeFileSync(path, setImage(data.picture), 'base64');
      // addUserWithPicture(data.user_id, data.user_name, data.password1, '練習用のラベル', path, response);
      createUserRoomWithPicture(data.roomName, data.userId, '部屋の画像ラベル', path, callback);
    }else{
      // addUser(data.user_id, data.user_name, data.password1, 1, response);
      createUserRoom(1, data.roomName, data.userId, callback);
    }
  });

  socket.on('select-all-room', (data, callback) => {
    console.log('select all room.\n', data);
    selectAllRoom(callback);
  });

  socket.on('select-room', (data, callback) => {
    console.log('select room.\n', data);
    selectRoom(data.user_id, callback);
  })

  socket.on('update-room', (data, callback) => {
    console.log('update room.');
    updateRoom(data.id, data.name, data.picture, callback);
  })

  socket.on('delete-room', (data, callback) => {
    console.log('delete room.\n', data);
    deleteRoom(data.room_id, callback);
  });

  socket.on('select-all-user', (data, callback) => {
    console.log('select all user.');
    selectAllUser(callback);
  });

  socket.on('update-user', (data, callback) => {
    console.log('update user.');
    updateUser(data.id, data.name, data.picture, data.password, data.email, callback);
  });

  socket.on('delete-user', (data, callback) => {
    console.log('delete user.\n', data);
    deleteUser(data.user_id, callback);
  })

  socket.on('receive-picture', (data, callback) => {
    var matches = String(data.binary).match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
    var response = {
      type: matches[1],
      data: Buffer.from(matches[2], 'base64')
    }
    fs.writeFile(`${ picture_directory }/temporary.png`, response.data, 'base64', function(err) {
      if(err){
        callback(`couldn't save the image.`)
      }else{
        callback('receive picture success!')
      }
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
    addUserWithPicture(data.user_id, data.user_name, data.password1, '練習用のラベル', path, response);
    
  }else{
    addUser(data.user_id, data.user_name, data.password1, 1, response);
  }
});
