const path = require('path');
const http = require('http');
const express = require('express');
const app = express();

// socket.io
const port = 8000;
const server = http.createServer(app).listen(port, () => {
  console.log('server start. port=' + port);
});
const io = require('socket.io')(server);

// PostgreSQL
const { Pool } = require('pg')
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'password',
  port: 5432
})


io.on('connection', socket => {
  console.log('socket.id:' + socket.id);
  console.log('接続できました！')

  // 切断時に発生します.
  socket.on('disconnect', reason => {
    console.log(`disconnect: %s, %s`, reason, socket.id);
  });

  socket.on('connect-to-server', (data, callback) => {
    const tmp_pool = new Pool({
      user: 'postgres',
      host: data.ip,
      database: 'postgres',
      password: 'password',
      port: data.port
    })
    tmp_pool.connect().then(client => {
      pool.query(`
        select usrt.id as id, usrt.name as name, pict.path as image from user_table as usrt
        join picture_table as pict on pict.id = usrt.image
        where usrt.id = '${data.userId}'
        and pgp_sym_decrypt(usrt.password, 'password') = '${data.password}';
      `, (err, res) => {
        if(res && 0 < res.rows.length){
          switch(data.method){
            case 'login':
              callback(res.rows[0])
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
    pool.query(`insert into tweet(tweet,room_id,user_id) values('${data.text}',${data.room},'${data.user}') returning *;`, (err, res) => {
      socket.emit('update-room',{rows: res.rows})
      // pool.end()
    })
  })

  socket.on('first-login-room', (data, callback) => {
    pool.query(`
      select * from chatroom
      left join user_chatroom_unit as usrroom on usrroom.chatroom_id = id
      where usrroom.user_id = '${data.id}';
    `, (err, res) => {
      callback({rows: res.rows})
    })
  })

  socket.on('check-in-room', (data, callback) => {
    pool.query(`
      select tweet.id,tweet,tweet.time, user_table.name as user,user_table.path as user_icon from tweet
      join (
          select user_table.id,user_table.name,picture_table.path from user_table
          join picture_table on user_table.image = picture_table.id
      ) as user_table on tweet.user_id = user_table.id
      where room_id = '${data.id}'
      order by tweet.id desc;
    `, (err, res) => {
        callback({rows: res.rows})
    })
  });

  socket.on('new-message', (data, callback) => {
    pool.query(`
      select tweet.id,tweet,tweet.time, user_table.name as user,user_table.path as user_icon from tweet
      join (
          select user_table.id,user_table.name,picture_table.path from user_table
          join picture_table on user_table.image = picture_table.id
      ) as user_table on tweet.user_id = user_table.id
      where tweet.id=${data.id};
    `, (err, res) => {
      callback({rows: res.rows})
    })
  });

  socket.on('call-room-list', (data, callback) => {
    pool.query(`
      select chatroom.id,chatroom.name,picture_table.path,user_chatroom_unit.user_id from chatroom
      join picture_table on chatroom.icon = picture_table.id
      join user_chatroom_unit on chatroom.id = user_chatroom_unit.chatroom_id
      where user_chatroom_unit.user_id = '${data.user_id}';
    `, (err, res) => {
        callback({rows: res.rows})
        // pool.end()
    })
  })
});

// expressで静的ページにアクセスする.
app.use(express.static(path.join(__dirname, 'static')));