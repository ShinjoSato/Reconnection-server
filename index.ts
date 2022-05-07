const path = require('path');
const http = require('http');
const express = require('express');
const app = express();
const fs = require('fs')
const {randomBytes} = require('crypto')

import {
  insertIntoPicture,
  insertIntoTweet,
  insertIntoPicTweet,
  getSingleTweet,
  getTweetCount,
  addUserIntoRoom,
  updateUserInRoom,
  addUserWithPicture,
  insertIntoUserTweetUnit,
  insertIntoUserFriendUnit,
  createUserRoomWithPicture, 
  removeUserFromRoom,
  getRoomStatus,
  getRoomStatusForUser,
  deleteRoom, 
  selectAllUser,
  selectUsersInRoom,
  selectUsersFriends,
  selectFriendNotInRoom,
  getUserProfileWithPass,
  selectUserWithId,
  checkAndUpdateUser,
  deleteUser,
  selectAllRoom,
  updateRoom,
  getSingleRoom,
  getTweetInSingleRoom,
  getTweetInEachRoom,
  getPicTweetInEachRoom,
  getInitialRoom,
  getRoomsUserBelong,
  getMemberInEachRoom,
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
    tmp_pool.connect().then(async client => {

      const profile = await getUserProfileWithPass(data.userId, data.password);
      if(!profile.status)
        callback(profile);
      var user = (profile.data.rows).map(row => { return { ...row, image: getImage(row.image) }; })
      if(profile.data && 0 < profile.data.rows.length){
        switch(data.method){
          case 'login':
            callback(user[0])
            break
          case 'register':
            delete data.method
            const board = fs.readFileSync('./docs/board.txt', 'utf-8');
            callback({ ...data, board });
            break
        }
      }
      
    })
    .catch(err => {
      console.log(err)
    })
  })

  socket.on('chat', async (data, callback) => {
    console.log(`chat.`);
    if(data.picture){// With picture
      var path = `${ picture_directory }/${generateRandomString(12)}.png`
      while(isExisted(path)){
        path = `${ picture_directory }/${generateRandomString(12)}.png`
      }
      fs.writeFile(path, setImage(data.picture), 'base64', async function(err) {
        const pict = await insertIntoPicture('練習用のラベル', path);
        const insert = await insertIntoPicTweet(data.text, data.room, data.user, pict.data.rows[0].id, data.head);
        const result = await getSingleTweet(insert.data.rows[0].id);
        if(result.status && CHATROOMS.includes(data.room)){
          console.log('通知を送る test2')
          io.to(data.room).emit('receive-notification', result.data[0])
        }
        callback({ status: true, message: "success!" });
      })
    }else{// Without pictures
      const insert = await insertIntoTweet(data.text, data.room, data.user, data.head);
      const result = await getSingleTweet(insert.data.rows[0].id);
      if(result.status && CHATROOMS.includes(data.room)){
        console.log('通知を送る')
        io.to(data.room).emit('receive-notification', result.data[0])
      }
      callback({ status: true, message: "success!" });
    }
  })

  socket.on('first-login-room', async (data, callback) => {
    console.log(`first login room.`);
    const rooms = await getInitialRoom(data.id);
    if(!rooms.status)
      callback(rooms);
    for(const val of rooms.data){
      CHATROOMS.push(val.chatroom_id);
      socket.join(val.chatroom_id);
    }
    socket.join(`@${data.id}`);//@user id.
    callback({rows: rooms.data});
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

  socket.on('get-users-rooms', async (data, callback) => {// swift用に用意
    callback(divideByRoom(await getRoomsUserBelong(data.user_id), 'id'));
  })

  socket.on('get-users-friends', async (data, callback) => {// swift用に用意
    callback(divideByRoom(await getMemberInEachRoom(data.user_id), 'room_id'));
  })

  socket.on('get-tweets-in-room', async (data, callback) => {// swift用に用意
    callback(await getTweetInSingleRoom(data.user_id, data.room_id));
  })

  socket.on('get-entire-login-set', async (data, callback) => {
    console.log(`get entire login set.`)
    let sets = { et_tweet: null, et_pictweet: null, init_room: null, entire_room: null, entire_user: null };
    sets.et_tweet = divideByRoom(await getTweetInEachRoom(data.user_id), 'room_id');
    sets.et_pictweet = divideByRoom(await getPicTweetInEachRoom(data.user_id), 'room_id');
    const init_room = await getInitialRoom(data.user_id);
    sets.init_room = init_room.data;
    sets.entire_room = divideByRoom(await getRoomsUserBelong(data.user_id), 'id')
    sets.entire_user = divideByRoom(await getMemberInEachRoom(data.user_id), 'room_id');
    callback(sets);
  })

  socket.on('new-message', async (data, callback) => {
    const tweet = await getSingleTweet(data.id);
    if(!tweet.status)
      callback(tweet);
    callback({rows: tweet.data})
  });

  socket.on('receive-room-member', async (data, callback) => {
    console.log("receive room member.");
    const users = await selectUsersInRoom(data.id);
    if(!users.status)
      callback(users);
    callback({ rows: users.data });
  })

  socket.on("receive-not-room-member-but-friend", async (data,callback) => {
    const member = await selectFriendNotInRoom(data.room_id, data.user_id);
    if(!member.status)
      callback(member);
    callback(member.data);
  });

  socket.on("receive-chatroom-with-picture", async (data, callback) => {
    const room = await getRoomStatus(data.room_id);
    if(room.status)
      return room.data;
    else
      return room;
  });

  socket.on("add-user-into-room", async (data, callback) => {
    console.log("add user into room.");
    callback(await addUserIntoRoom(data.user_id, data.room_id, data.opening, data.posting, io));
  })

  socket.on("update-user-in-room", async (data, callback) => {
    console.log("update user in room.");
    callback(await updateUserInRoom(data.user_id, data.room_id, data.opening, data.posting, io));
  })

  socket.on("remove-user-from-room", async (data, callback) => {
    console.log("remove user from room.");
    callback(await removeUserFromRoom(data.user_id, data.room_id, io));
  })

  socket.on('create-room', async (data,callback) => {
    console.log('create room.');
    var path = `./${ picture_directory }/${generateRandomString(12)}.png`
    while(isExisted(path)){
      path = `./${ picture_directory }/${generateRandomString(12)}.png`
    }
    const image =(data.picture)? setImage(data.picture): fs.readFileSync(`./${ picture_directory }/default.jpg`);
    fs.writeFileSync(path, image, 'base64');
    const result = await createUserRoomWithPicture(data.roomName, data.userId, data.open_level, data.post_level, '部屋の画像ラベル0', path, callback);
    if(!result.status)
      callback(result)
    const room = await getRoomStatusForUser(result.data.rows[0].chatroom_id, result.data.rows[0].user_id);
    callback(room);
  });

  socket.on('select-all-room', (data, callback) => {
    console.log('select all room.');
    selectAllRoom(callback);
  });

  socket.on('update-room', (data, callback) => {
    console.log('update room.');
    updateRoom(data.id, data.name, data.open_level, data.post_level, data.picture, data.user_id, callback);
  })

  socket.on('delete-room', async (data, callback) => {
    console.log('delete room.');
    callback(await deleteRoom(data.room_id));
  });

  socket.on('select-all-user', (data, callback) => {
    console.log('select all user.');
    selectAllUser(callback);
  });

  socket.on('select-users-in-room', async (data, callback) => {
    console.log('select users in room.');
    const users = await selectUsersInRoom(data.room_id);
    if(!users.status)
      callback(users);
    callback({ rows: users.data });
  });

  socket.on('update-user', async (data, callback) => {
    console.log('update user.');
    const result = await checkAndUpdateUser(data.id, data.name, data.picture, data.password, data.mail, data.authority);
    callback(result);
  });

  socket.on('delete-user', async (data, callback) => {
    console.log('delete user.\n', data);
    callback(deleteUser(data.user_id));//欠陥あり
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
  socket.on('get-single-room', async (data, callback) => {
    callback(await getSingleRoom(data.user_id, data.room_id));
  })

  socket.on('enter-new-room', (data, callback) => {
    CHATROOMS.push(data.room_id);
    socket.join(data.room_id);
    callback({message: "新しい部屋に登録されました。"});
  });

  socket.on('get-invited-room', async (data, callback) => {
    const room = await getRoomStatus(data.room_id);
    if(room.status)
      callback(room.data);
    else
      callback(room);
  })

  socket.on('get-friend-list', async (data, callback) => {
    const friends = await selectUsersFriends(data.user_id);
    if(!friends.status)
      return friends;
    callback(friends.data);
  })

  socket.on('search-user', async (data, callback) => {
    const user = await selectUserWithId(data.user_id);
    if(!user.status)
      callback(user);
    callback(user.data);
  })

  socket.on('connect-to-friend', async (data, callback) => {
    const result = await insertIntoUserFriendUnit(data.user_id, data.friend_id);
    callback(result);
  })

  socket.on('notice-reading-tweet', async (data, callback) => {
    const insert = await insertIntoUserTweetUnit(data.user_id, data.tweet_id);
    if(!insert.status)
      callback(insert)
    const tweet = await getTweetCount(data.tweet_id);
    if(!tweet.status)
      callback(tweet);
    const room_id = tweet.data.rows[0].room_id;
    callback({message: '既読', status: true, data: { tweet_id: data.tweet_id, room_id, check: 1 }});
    io.to(room_id).emit('update-tweet-information', { data: tweet.data.rows[0] });

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
app.use(express.json())

app.post("/disconnected", function (request, response) {
  console.log('request:')
  console.log(request)
  console.log('response:')
  console.log(response)
  response.set({ 'Access-Control-Allow-Origin': '*' })
  response.json({message: "OK!", data: request.body});
});

/**
 * ユーザーを作成するのと同時にそのユーザー専用のRoomを作成する。
 */
app.post("/sign-on/check", async function (request, response) {
  response.set({ 'Access-Control-Allow-Origin': '*' });
  const data = request.body;
  var path = `./${ picture_directory }/${generateRandomString(12)}.png`
  while(isExisted(path)){
    path = `./${ picture_directory }/${generateRandomString(12)}.png`
  }
  const image =(data.picture!=='null')? setImage(data.picture): fs.readFileSync(`./${ picture_directory }/default.jpg`);
  fs.writeFileSync(path, image, 'base64');
  const result = await addUserWithPicture(data.user_id, data.user_name, data.password1, data.mail, data.authority, '練習用のラベル0', path, response);
  response.json(result);
});
