const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors')
const app = express();
const fs = require('fs')
const {randomBytes} = require('crypto')
const nodemailer = require('nodemailer');

import {
  SQL,
  Message,
  runGeneralSQL,
  getSingleTweet,
  getCommonTweetsInRoom,
  getTweetInPublic,
  getTweetInPublicBefore,
  addUserIntoRoom,
  updateUserInRoom,
  addUserWithPicture,
  createUserRoomWithPicture, 
  removeUserFromRoom,
  getRoomStatus,
  getRoomStatusForUser,
  deleteRoom,
  selectUser,
  selectUsersByPublicity,
  selectAllUser,
  selectUsersInRoom,
  selectFriendNotInRoom,
  getUserProfileWithPass,
  selectUserWithId,
  checkAndUpdateUser,
  deleteUser,
  selectAllRoom,
  selectCommonRoom,
  selectRoomPublication,
  updateRoom,
  updateRoomlatest,
  getSingleRoom,
  getTweetInSingleRoom,
  getTweetInEachRoom,
  getPicTweetInEachRoom,
  getInitialRoom,
  getRoomsUserBelong,
  getMemberInEachRoom,
} from "./psql";

import Response from "./Response";
import { getImage, setImage, isExisted } from "./system";
import { configure, getLogger } from "log4js";
configure({
  appenders: {
    out: { type: 'stdout' },
    app: { type: 'dateFile', filename: './logs/disconnected', pattern: "yyyy-MM-dd.log", keepFileExt: false, alwaysIncludePattern: true, daysToKeep: 10, compress: true, numBackups: 1 }
  },
  categories: {
    default: { appenders: ['out', 'app'], level: 'info' }
  }
});
const logger = getLogger();

// socket.io
const host = 'localhost'; //'172.31.44.151';
const port = 8528; //8528, 8000
const server = http.createServer(app).listen(port, host, () => {
  console.log('server start. port=' + port);
});
const io = require('socket.io')(server, {pingTimeout: 600000, pingInterval: 5000});// {pingTimeout: 10000, pingInterval: 30000}

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

// Picture Directory
// const picture_directory = '/tmp_images'
const picture_directory = 'images'

let CHATROOMS = [];
let UserID = '';

io.on('connection', socket => {
  console.log('socket.id:' + socket.id);
  console.log('接続できました！')
  console.log('この段階でのCHATROOMSの確認:')
  console.log(CHATROOMS)

  CHATROOMS.forEach(val => {
    socket.join(val);
  })
  if (UserID.length > 0) {
    socket.join(`@${UserID}`)
  }

  // 切断時に発生します.
  socket.on('disconnect', reason => {
    console.log(`disconnect: %s, %s`, reason, socket.id);
  });

  // 以下の関数で接続できなかった時にも値を返せる様にしたい（存在しないID, パスワードが一致しないなど）
  socket.on('connect-to-server', (data, callback) => {
    logger.info(`socket.on:${ "connect-to-server" },\tkeys:${ Object.keys(data) },\tuserId:${ data.userId }`);
    const tmp_pool = new Pool(pool_data)
    tmp_pool.connect().then(async client => {

      const profile = await getUserProfileWithPass(data.userId, data.password);
      if(!profile.status)
        callback(profile);
      var user = (profile.data.rows).map(row => { return { ...row, image: getImage(row.image) }; })
      if(profile.data && 0 < profile.data.rows.length){
        const title = fs.readFileSync('./bin/title.txt', 'utf-8');
        const board = fs.readFileSync('./bin/board.txt', 'utf-8');
        switch(data.method){
          case 'login':
            callback({ ...user[0], title, board })
            break
          case 'register':
            delete data.method
            callback({ ...data, title, board });
            break
        }
      }
      tmp_pool.end().then(() => console.log("poolを解除しました。"));
    })
    .catch(err => {
      logger.error(err)
    })
  })

  socket.on('get-tweet-in-public', async (data, callback) => {
    callback(await getTweetInPublic(data.user_id));
  })

  socket.on('get-tweet-in-public-before', async (data, callback) => {
    callback(await getTweetInPublicBefore(data.user_id, data.head_tweet_id));
  })

  socket.on('first-login-room', async (data, callback) => {
    logger.info(`socket.on:${ "first-login-room" },\tkeys:${ Object.keys(data) },\tid:${ data.id }`);
    const rooms = await getInitialRoom(data.id);
    if(!rooms.status)
      callback(rooms);
    for(const val of rooms.data){
      CHATROOMS.push(val.chatroom_id);
      socket.join(val.chatroom_id);
    }
    UserID = data.id
    socket.join(`@${UserID}`);//@user id.
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
    logger.info(`socket.on:${ "add-user-into-room" },\tkeys:${ Object.keys(data) },\tuser_id:${ data.user_id },\troom_id:${ data.room_id }`);
    let result = await addUserIntoRoom(data.user_id, data.room_id, data.opening, data.posting, io);
    callback(result);
    const roomMembers = await selectUsersInRoom(data.room_id);
    const user = await selectUser(data.user_id);
    roomMembers.data.forEach((member, index) => {
      io.to(`@${member.user_id}`).emit('receive-signal', { ...user, signal: '002002', status: true, room_id: Number(data.room_id) });
    })
    const singleRoom = await getSingleRoom(data.user_id, data.room_id);
    io.to(`@${data.user_id}`).emit('receive-signal', { ...singleRoom, signal: '002000', status: true });//002000　を新たな部屋の取得にしたい
    // 上記のユーザーのserverでjoinさせたい！
  })

  socket.on("update-user-in-room", async (data, callback) => {
    logger.info(`socket.on:${ "update-user-in-room" },\tkeys:${ Object.keys(data) },\tuser_id:${ data.user_id },\troom_id:${ data.room_id }`);
    callback(await updateUserInRoom(data.user_id, data.room_id, data.opening, data.posting, io));
  })

  socket.on("remove-user-from-room", async (data, callback) => {
    logger.info(`socket.on:${ "remove-user-from-room" },\tkeys:${ Object.keys(data) },\tuser_id:${ data.user_id },\troom_id:${ data.room_id }`);
    let result = await removeUserFromRoom(data.user_id, data.room_id, io)
    callback(result);
    if(result.status === true){
      // ユーザー自身が部屋を退室
      io.to(`@${data.user_id}`).emit('receive-signal', { data: {...result, user_id: data.user_id, room_id: data.room_id}, signal: '002999', status: true });
      // ユーザーのserverでreaveをさせたい！

      // 他のユーザーに退室を通達,部屋の更新
      const roomMembers = await selectUsersInRoom(data.room_id);
      roomMembers.data.forEach((member, index) => {
        io.to(`@${member.user_id}`).emit('receive-signal', { data: {...result, user_id: data.user_id, room_id: data.room_id}, signal: '002997', status: true });
      })
    }
  })

  socket.on('create-room', async (data,callback) => {
    logger.info(`socket.on:${ "create-room" },\tkeys:${ Object.keys(data) },\troomName:${ data.roomName },\tuserId:${ data.userId }`);
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
    const newRoom = await getSingleRoom(result.data.rows[0].user_id, result.data.rows[0].chatroom_id);
    [data.userId].forEach((user_id, index) => {
      io.to(`@${user_id}`).emit('receive-signal', { data: newRoom, signal: '002001', status: true });
    })
    CHATROOMS.push(result.data.rows[0].chatroom_id as string);
    socket.join(result.data.rows[0].chatroom_id);
  });

  socket.on('select-all-room', (data, callback) => {
    console.log('select all room.');
    selectAllRoom(callback);
  });

  socket.on('select-common-room', async (data, callback) => {
    console.log('select common room.', data);
    callback(await selectCommonRoom(data.user_id, data.another_id));
  })

  socket.on('update-room', (data, callback) => {
    logger.info(`socket.on:${ "update-room" },\tkeys:${ Object.keys(data) },\tid:${ data.id },\tname:${ data.name }`);
    updateRoom(data.id, data.name, data.open_level, data.post_level, data.picture, data.user_id, callback);
  })

  socket.on('delete-room', async (data, callback) => {
    logger.info(`socket.on:${ "delete-room" },\tkeys:${ Object.keys(data) },\troom_id:${ data.room_id }`);
    callback(await deleteRoom(data.room_id));
  });

  socket.on('select-user-by-publicity', (data, callback) => {
    console.log('select user by publicity.');
    selectUsersByPublicity(data.publicity, callback);
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
    logger.info(`socket.on:${ "update-user" },\tkeys:${ Object.keys(data) },\tid:${ data.id },\tname:${ data.name }`);
    const result = await checkAndUpdateUser(data.id, data.name, data.picture, data.password, data.mail, data.authority, data.publicity);
    callback(result);

    const user = await selectUser(data.id);
    //フレンド情報の更新
    const { rows : followers } = runGeneralSQL(SQL['select-users-followers'], [ data.id ], Message['select-users-followers'], 'picture')
    followers.concat(user.data[0]).forEach(follower => {
      io.to(`@${follower.id}`).emit('receive-signal', { data: user.data[0], signal: '003001', status: true });
    })
    //ルーム内のユーザー情報の更新
    const rooms = await getRoomsUserBelong(data.id);
    user.data.forEach(user => {
      io.to(user.room_id).emit('receive-signal', { data: user, signal: '003002', status: true });
    })
  });

  socket.on('delete-user', async (data, callback) => {
    logger.info(`socket.on:${ "delete-user" },\tkeys:${ Object.keys(data) },\tuser_id:${ data.user_id }`);
    callback(deleteUser(data.user_id));//欠陥あり
  })

  socket.on('log-out', (data, callback) => {
    logger.info(`socket.on:${ "log-out" },\tkeys:${ Object.keys(data) }`);
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
    const { rows, status, message } = await runGeneralSQL(SQL['select-users-friends'], [ data.id ], Message['select-users-friends'], 'picture')
    if(!status)
      return { rows, status, message };
    callback(rows);
  })

  socket.on('search-user', async (data, callback) => {
    const user = await selectUserWithId(data.user_id);
    if(!user.status)
      callback(user);
    callback(user.data);
  })

  socket.on('connect-to-friend', async (data, callback) => {
    logger.info(`socket.on:${ "connect-to-friend" },\tkeys:${ Object.keys(data) },\tuser_id:${ data.user_id },\tfriend_id:${ data.friend_id }`);
    const result = await runGeneralSQL(SQL['insert-into-user-friend-unit'], [ data.user_id, data.friend_id ], Message['insert-into-user-friend-unit'], null)
    callback(result);
    const friend = await selectUser(data.friend_id);
    io.to(`@${data.user_id}`).emit('receive-signal', { data: friend, signal: '001001', status: true });
    const user = await selectUser(data.user_id);
    io.to(`@${data.friend_id}`).emit('receive-signal', { data: user, signal: '001001', status: true });
  })

  socket.on('notice-reading-tweet', async (data, callback) => {
    const { stauts:insertStatus, message:insertMessage } = runGeneralSQL(SQL['insert-into-user-tweet-unit'], [ data.user_id, data.tweet_id ], Message['insert-into-user-tweet-unit'], null)
    if(!insertStatus)
      callback({'status':insertStatus, 'message':insertMessage})
    const { rows, status, message } = await runGeneralSQL(SQL['get-tweet-count'], [ data.tweet_id ], Message['get-tweet-count'], null)
    if(!status)
      callback({ status, message });
    const room_id = rows[0].room_id;
    callback({message: '既読', status: true, data: { tweet_id: data.tweet_id, room_id, check: 1 }});
    io.to(room_id).emit('update-tweet-information', { data: rows[0] });

  })

  socket.on('notice-reading-tweet', async (data, callback) => {
    const { stauts:insertStatus, message:insertMessage } = runGeneralSQL(SQL['insert-into-user-tweet-unit'], [ data.user_id, data.tweet_id ], Message['insert-into-user-tweet-unit'], null)
    if(!insertStatus)
      callback({'status':insertStatus, 'message':insertMessage})
    const { rows, status, message } = await runGeneralSQL(SQL['get-tweet-count'], [ data.tweet_id ], Message['get-tweet-count'], null)
    if(!status)
      callback({ rows, status, message });
    const room_id = rows[0].room_id;
    callback({message: '既読', status: true, data: { tweet_id: data.tweet_id, room_id, check: 1 }});
    io.to(room_id).emit('update-tweet-information', { data: rows[0] });
  })

  function generateRandomString(length) {
    return randomBytes(length).reduce((p, i) => p + (i % 36).toString(36), '')
  }

  socket.on('read-signal', async (data, callback) => {
    logger.info('read-signal');
    const signal = data['signal'];
    switch(signal) {
      case 'A00001':
        console.log("roomをjoinさせる", data['data']);
        CHATROOMS.push(Number(data['data']['room_id']));
        socket.join(Number(data['data']['room_id']));
        break;
      case 'A00002':
        console.log("roomからleaveさせる", data['data']);
        socket.leave(Number(data['data']['room_id']));
        CHATROOMS = CHATROOMS.filter(x => x!==Number(data['data']['room_id']));
        break;
      case '/chat': // 呟く
        logger.info(`/chat→socket.on:${ "chat" },\tkeys:${ Object.keys(data) },\ttext:${ data.text },\tuser:${ data.user },\troom:${ data.room }`);
        const result = await chat(data.user, data.room, data.text, data.picture, data.head)
        // 呟きを知らせる処理
        if(result.status && CHATROOMS.includes(data.room)){
          console.log('通知を送る')
          io.to(data.room).emit('receive-notification', result.data[0])
          const { rows : room } = await runGeneralSQL(SQL['select-room'], [ data.room ], Message['select-room'] , 'picture')
          if(room[0]["openlevel"]===3){
            const { rows } = await runGeneralSQL(SQL['select-users-followers'], [ data.user ], Message['select-users-followers'], 'picture')
            io.to(`@${data.user}`).emit('receive-signal', { data: result.data[0], signal: '000001', status: true });
            rows.forEach((usr, idx) => {
              io.to(`@${usr["id"]}`).emit('receive-signal', { data: result.data[0], signal: '000001', status: true });//<-ここでフォロワーに送る
            })
          }
        }
        callback(new Response(result.status, [], "chat success"));
        break;
    }
  })
});

/**
 * 呟き処理。
 * @param {string} user ユーザーID
 * @param {string} room ルームID
 * @param {string} text 呟き内容
 * @param {any} picture 画像が含まれないときはnull
 * @param {string} head 存在する場合はスレッド内の一つ前の呟きID
 * @returns 呟きの結果を返す。
 */
async function chat(user:string, room:string, text:string, picture:any, head:string) {
  var params = [] as any[]
  var key = ''

  if(picture != null){
    // 画像を持つ時の処理
    key = 'insert-tnto-pictweet'
    var path = `${ picture_directory }/${generateRandomString(12)}.png`
    while(isExisted(path)){
      path = `${ picture_directory }/${generateRandomString(12)}.png`
    }
    // 画像のデータ保存
    fs.writeFileSync(path, setImage(picture), 'base64')
    const { rows : pict } = await runGeneralSQL(SQL['insert-into-picture'], [ '練習用のラベル', path ], Message['insert-into-picture'], null)
    params = [ text, room, user, pict[0].id, head ]
  }else{
    // 画像を持たない時の処理
    key = 'insert-into-tweet'
    params = [ text, room, user, head ]
  }
  // 共通の処理
  const { rows : insert } = await runGeneralSQL(SQL[key], params, Message[key], null)
  // 部屋の更新?
  await updateRoomlatest(room);
  // ツイートの取得
  const result = await getSingleTweet(insert[0].id);
  return result
}

function generateRandomString(length) {
  return randomBytes(length).reduce((p, i) => p + (i % 36).toString(36), '');
}

// expressで静的ページにアクセスする.
app.use(cors())
app.use(express.urlencoded({extended: true, limit: '10mb'}));
app.use(express.static(path.join(__dirname, 'static')));
app.use(express.json())

app.post("/disconnected", function (request, response) {
  logger.info(`/disconnected,\trequest:${ request },\tresponse:${ response }`);
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
  logger.info(`${ "/sign-on/check" },\tkeys:${ Object.keys(data) },\tuser_id:${ data.user_id },\tuser_name:${ data.user_name }`);
  var path = `./${ picture_directory }/${generateRandomString(12)}.png`
  while(isExisted(path)){
    path = `./${ picture_directory }/${generateRandomString(12)}.png`
  }
  const image =(data.picture!=='null')? setImage(data.picture): fs.readFileSync(`./${ picture_directory }/default.jpg`);
  fs.writeFileSync(path, image, 'base64');
  const result = await addUserWithPicture(data.user_id, data.user_name, data.password1, data.mail, data.authority, '練習用のラベル0', path, response);
  logger.info(`result of /sign-on/check:${ result }`);
  const title = fs.readFileSync('./bin/title.txt', 'utf-8');
  const board = fs.readFileSync('./bin/board.txt', 'utf-8');
  response.json({ ...result, title, board });
});

/**
 * API仕様
 */
app.get("/publication", async function (request, response) {
  logger.info(`/publication,\trequest:${ request },\tresponse:${ response }`);
  let data = {};
  console.log("request.params.id:", request.query.id)
  if(request.query.id) {
    const room = await selectRoomPublication(request.query.id);
    if(room["data"].length > 0) {
      const tweets = await getCommonTweetsInRoom(room["data"][0]["room_id"]);
      data = { ...tweets, }
    } else {
      data = {message: "No tweet or undefined id.", status: false};
    }
  } else {
    data = {message: "No id.", status: false};
  }
  response.set({ 'Access-Control-Allow-Origin': '*' })
  response.json(data);
});

/**
 * REST APIのPOSTで呟く
 */
app.get("/post/tweet", async function(request, response) {
  logger.info(`/post/tweet,\t,request:${ request },\tresponse:${ response }`);
});


/**
 * Mail送信
 * 相手に送信完了メール & 特定のアドレスに確認メール & 特定のルームに投稿
 */
 app.post("/mail", async function (request, response) {
  response.set({ 'Access-Control-Allow-Origin': '*' });
  logger.info(`/mail,\trequest:${ request },\tresponse:${ response }`);
  logger.info('request:', request)
  const { body } = request; // .mail .subject .text
  if('mail' in body && 'subject' in body && 'text' in body) {
    // 相手に送信完了メール
    sendMail(body.mail, `From Shinjo Sato Website`, `以下のメッセージを送信しました\n件名:${body.subject}\n内容:${body.text}`)
    // 特定のアドレスに通知メール
    sendMail('nomi.shinjo@gmail.com', 'From website: '+body.subject, 'ウェブサイトから以下のメッセージを取得しました。\n↓\n'+body.text)
  }
  response.json({ test: '送信完了' });
});


async function sendMail(address: string, subject: string, text: string) {
  logger.info('send e-mail to:\t', address, subject, text)
  const { options } = require('./bin/mail')
  const mail = {
    from: 'shinjo.sample.blog@gmail.com',
    to: address,
    subject: subject,
    text: text,
    // html: `<p>${ text }</p>`,
  };
  try {
    const transport = nodemailer.createTransport(options);
    const result = await transport.sendMail(mail);
    logger.mark(result);
  } catch (err) {
    logger.error(err);
  }
}