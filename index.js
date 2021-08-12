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

  socket.on('chat', (data) => {
    console.log('data:',data)
    pool.query(`insert into tweet(tweet,room_id,user_id) values('${data.text}',${data.room},'${data.user}') returning *;`, (err, res) => {
      console.log(err, res)
      socket.emit('update-room',{rows: res.rows})
      // pool.end()
    })
  })

  socket.on('check-in-room', (data) => {
    console.log('data:',data)
    console.log(`RECEIVE: room id: ${data.id}`);
    pool.query(`
      select tweet.id,tweet,tweet.time, user_table.name as user,user_table.path as user_icon from tweet
      join (
          select user_table.id,user_table.name,picture_table.path from user_table
          join picture_table on user_table.image = picture_table.id
      ) as user_table on tweet.user_id = user_table.id
      where room_id = '${data.id}'
      order by tweet.id desc;
    `, (err, res) => {
        console.log('ERROR: ',err)
        socket.emit('receive-talk-in-room',{rows: res.rows})
        console.log('receive successfully!\nrow length:', res.rows.length)
    })
  });

  socket.on('new-message', (data) => {
    console.log('取得したデータは',data)
    pool.query(`
      select tweet.id,tweet,tweet.time, user_table.name as user,user_table.path as user_icon from tweet
      join (
          select user_table.id,user_table.name,picture_table.path from user_table
          join picture_table on user_table.image = picture_table.id
      ) as user_table on tweet.user_id = user_table.id
      where tweet.id=${data.id};
    `, (err, res) => {
      console.log(err,res)
      socket.emit('send-new-message',{rows: res.rows})
      console.log('send new message successfully!', res.rows.length)
    })
  });

  socket.on('call-room-list', (data) => {
    console.log('data:',data)
    pool.query(`
      select chatroom.id,chatroom.name,picture_table.path,user_chatroom_unit.user_id from chatroom
      join picture_table on chatroom.icon = picture_table.id
      join user_chatroom_unit on chatroom.id = user_chatroom_unit.chatroom_id
      where user_chatroom_unit.user_id = '${data.user_id}';
    `, (err, res) => {
        // console.log(err, res)
        for (var row of res.rows) {
          console.log(row)
        }
        socket.emit('send-room-list',{rows: res.rows})
        // pool.end()
    })
  })
});

// expressで静的ページにアクセスする.
app.use(express.static(path.join(__dirname, 'static')));