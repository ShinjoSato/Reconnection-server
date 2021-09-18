const path = require('path');
const http = require('http');
const express = require('express');
const app = express();
const fs = require('fs')
const {randomBytes} = require('crypto')

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
      var path = `./images/${generateRandomString(12)}.png`
      while(isExisted(path)){
        path = `./images/${generateRandomString(12)}.png`
      }
      fs.writeFile(path, setImage(data.picture), 'base64', function(err) {
        pool.query(`
          insert into picture_table(label,path)
          values('${ '練習用のラベル' }','${ path }') returning *;
        `, (error, res) => {
          pool.query(`
            insert into tweet(tweet,room_id,user_id,picture_id)
            values('${data.text}',${data.room},'${data.user}',${ res.rows[0].id }) returning *;
          `, (error, res) => {
            socket.emit('update-room',{rows: res.rows})
            // pool.end()
          })
        })
      })
    }else{
      // Without pictures
      pool.query(`
        insert into tweet(tweet,room_id,user_id)
        values('${data.text}',${data.room},'${data.user}') returning *;
      `, (error, res) => {
        socket.emit('update-room',{rows: res.rows})
        // pool.end()
      })
    }
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
      select tweet.id,tweet,tweet.time, user_table.name as user,user_table.path as user_icon, picture_table.path as picture from tweet
      join (
          select user_table.id,user_table.name,picture_table.path from user_table
          join picture_table on user_table.image = picture_table.id
      ) as user_table on tweet.user_id = user_table.id
      left join picture_table on tweet.picture_id = picture_table.id
      where room_id = '${data.id}'
      order by tweet.id desc;
    `, (err, res) => {
      var tweet = (res.rows).map(function(row){
        var r = row
        r.user_icon = getImage(r.user_icon)
        if(r.picture){
          r.picture = getImage(r.picture)
        }
        return r
      })
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
      where tweet.id=${data.id};
    `, (err, res) => {
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
      select chatroom.id,chatroom.name,picture_table.path,user_chatroom_unit.user_id from chatroom
      join picture_table on chatroom.icon = picture_table.id
      join user_chatroom_unit on chatroom.id = user_chatroom_unit.chatroom_id
      where user_chatroom_unit.user_id = '${data.user_id}';
    `, (err, res) => {
        var room = (res.rows).map(function(row){
          var r = row
          r.path = getImage(r.path)
          return r
        })
        callback({rows: room})
        // pool.end()
    })
  })

  socket.on('receive-picture', (data, callback) => {
    var matches = String(data.binary).match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
    var response = {
      type: matches[1],
      data: Buffer.from(matches[2], 'base64')
    }
    fs.writeFile('./images/temporary.png', response.data, 'base64', function(err) {
      if(err){
        callback(`couldn't save the image.`)
      }else{
        callback('receive picture success!')
      }
    })
  })

  function getImage(path){
    const data = fs.readFileSync(path)
    return "data:image;base64,"+ data.toString("base64")
  }

  function setImage(binary){
    var matches = String(binary).match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
    var response = {
      type: matches[1],
      data: Buffer.from(matches[2], 'base64')
    }
    return response.data
  }

  function generateRandomString(length) {
    return randomBytes(length).reduce((p, i) => p + (i % 36).toString(36), '')
  }

  function isExisted(file) {
    return fs.existsSync(file)
  }
});

// expressで静的ページにアクセスする.
app.use(express.static(path.join(__dirname, 'static')));