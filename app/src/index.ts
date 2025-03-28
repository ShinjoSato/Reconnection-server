const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors')
const app = express();
const fs = require('fs')
const {randomBytes} = require('crypto')
const nodemailer = require('nodemailer');
const cron = require('cron')
const axios = require('axios')

import {
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
  deleteRoom,
  selectUser,
  selectUsersByPublicity,
  selectAllUser,
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
  getPicTweetInSingleRoom,
  getInitialRoom,
  getRoomsUserBelong,
  getMemberInEachRoom,
} from "./psql";

import { Request, Response } from "./Response";
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
const host = process.env.SERVER_HOST;
const port = process.env.SERVER_PORT;
const server = http.createServer(app).listen(port, host, () => {
  console.log('server start. port=' + port);
});
const io = require('socket.io')(server, {pingTimeout: 600000, pingInterval: 5000});// {pingTimeout: 10000, pingInterval: 30000}

// PostgreSQL
const { Pool } = require('pg');
const pool_data = {
  user: process.env.PSQL_USER,
  host: process.env.PSQL_HOST,
  database: process.env.PSQL_DATABASE,
  password: process.env.PSQL_PASSWORD,
  port: process.env.PSQL_PORT,
  keepAlive: true,
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

  // 全てを一度にではなく、個々の部屋を個別に取得させるようにしたい?もうなっている！？
  socket.on('get-users-rooms', async (data, callback) => {// swift用に用意
    const result = await getRoomsUserBelong(data.user_id)
    callback(divideByRoom(result.rows, 'id'));
  })

  socket.on('get-users-friends', async (data, callback) => {// swift用に用意
    callback(divideByRoom(await getMemberInEachRoom(data.user_id), 'room_id'));
  })

  socket.on('get-tweets-in-room', async (data, callback) => {// swift用に用意
    callback(await getTweetInSingleRoom(data.user_id, data.room_id));
  })

  socket.on('new-message', async (data, callback) => {
    const tweet = await getSingleTweet(data.id);
    if(!tweet.status)
      callback(tweet);
    callback({rows: tweet.data})
  });

  socket.on('receive-room-member', async (data, callback) => {
    console.log("receive room member.");
    const { status, rows, message } = await runGeneralSQL('/sql/room/user', [ data.id ], 'picture')
    if(!status)
      callback({ status, rows, message });
    callback({ rows });
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
    let response = await addUserIntoRoom(data.user_id, data.room_id, data.opening, data.posting, io);
    callback(response);
    if(response.status == true) {
      updateRoomUserViaSocket(data.room_id, '/room/member/update')
    }
    // const { rows } = await runGeneralSQL('/sql/room/user', [ data.room_id ], 'picture')
    // rows.forEach(async (member, index) => {
    //   var updatedRoom = await getSingleRoom(member.user_id, data.room_id);
    //   io.to(`@${member.user_id}`).emit('/socket/client', { rest:'/room/update', data:updatedRoom, status: true });
    // })
    // const singleRoom = await getSingleRoom(data.user_id, data.room_id);
    // io.to(`@${data.user_id}`).emit('/socket/client', { rest:'/room/update', data:singleRoom, status: true });
    
    // 上記のユーザーのserverでjoinさせたい！
  })

  socket.on("update-user-in-room", async (data, callback) => {
    logger.info(`socket.on:${ "update-user-in-room" },\tkeys:${ Object.keys(data) },\tuser_id:${ data.user_id },\troom_id:${ data.room_id }`);
    const response = await updateUserInRoom(data.user_id, data.room_id, data.opening, data.posting, io)
    callback(response);
    if(response.status == true) {
      updateRoomUserViaSocket(data.room_id, '/room/member/update')
    }
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
      const roomMembers = await runGeneralSQL('/sql/room/user', [ data.room_id ], 'picture')
      roomMembers.data.forEach((member, index) => {
        io.to(`@${member.user_id}`).emit('receive-signal', { data: {...result, user_id: data.user_id, room_id: data.room_id}, signal: '002997', status: true });
      })
      // updateRoomUserViaSocket(data.room_id, '/room/member/update')
    }
  })

  const updateRoomUserViaSocket = async (room_id, rest) => {
    const { rows } = await runGeneralSQL('/sql/room/user', [ room_id ], 'picture')
    rows.forEach(async (member, index) => {
      // var updatedRoom = await getSingleRoom(member.user_id, room_id);
      var data = { room_id:room_id }
      io.to(`@${member.user_id}`).emit('/socket/client', { rest:rest, data:data, status:true });
    })
    // const singleRoom = await getSingleRoom(user_id, room_id);
    // io.to(`@${user_id}`).emit('/socket/client', { rest:rest, data:singleRoom, status: true });
  }

  // /room/create
  socket.on('create-room', async (data,callback) => {
    const request = new Request('', '', data, null)
    logger.info(`socket.on:${ "create-room" },\tkeys:${ Object.keys(data) },\troomName:${ data.roomName },\tuserId:${ data.userId }`);
    var path = `./${ picture_directory }/${generateRandomString(12)}.png`
    while(isExisted(path)){
      path = `./${ picture_directory }/${generateRandomString(12)}.png`
    }
    const image =(data.picture)? setImage(data.picture): fs.readFileSync(`./${ picture_directory }/default.jpg`);
    fs.writeFileSync(path, image, 'base64');
    var { rows, status, message } = await createUserRoomWithPicture(data.roomName, data.userId, data.open_level, data.post_level, '部屋の画像ラベル0', path);
    if(!status)
      callback(new Response(status, rows, message, request))
    const room = await runGeneralSQL('/sql/user/room/status/single', [ rows[0].chatroom_id, rows[0].user_id ], 'picture')
    callback(room);
    const newRoom = await getSingleRoom(rows[0].user_id, rows[0].chatroom_id);
    [data.userId].forEach((user_id, index) => {
      io.to(`@${user_id}`).emit('/socket/client', { data: newRoom, rest: '/room/add', status: true });
    })
    CHATROOMS.push(rows[0].chatroom_id as string);
    socket.join(rows[0].chatroom_id);
  });

  socket.on('select-all-room', (data, callback) => {
    console.log('select all room.');
    selectAllRoom(callback);
  });

  socket.on('select-common-room', async (data, callback) => {
    console.log('select common room.', data);
    callback(await selectCommonRoom(data.user_id, data.another_id));
  })

  socket.on('update-room', async (data, callback) => {
    logger.info(`socket.on:${ "update-room" },\tkeys:${ Object.keys(data) },\tid:${ data.id },\tname:${ data.name }`);
    const response = await updateRoom(data.id, data.name, data.open_level, data.post_level, data.picture, data.user_id);
    if(response.status == true) {
      const updatedRoom = await getSingleRoom(data.user_id, data.id);
      io.to(data.id).emit('/socket/client', { rest:'/room/update', data:updatedRoom, status: true });
    }
    callback(response)
  })

  socket.on('delete-room', async (data, callback) => {
    logger.info(`socket.on:${ "delete-room" },\tkeys:${ Object.keys(data) },\troom_id:${ data.room_id }`);
    var response = await deleteRoom(data.room_id)
    if(response.status == true) {
      io.to(data.room_id).emit('/socket/client', { rest:'/room/remove', data:data })
      // ホントはここでCHATROOMSから取り除く処理も必要！
    }
    callback(response);
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
    const response = await runGeneralSQL('/sql/room/user', [ data.room_id ], 'picture')
    if(!response.status)
      callback(response);
    callback({  status: response.status, rows: response.rows, message: response.message });
  });

  socket.on('update-user', async (data, callback) => {
    logger.info(`socket.on:${ "update-user" },\tkeys:${ Object.keys(data) },\tid:${ data.id },\tname:${ data.name }`);
    const result = await checkAndUpdateUser(data.id, data.name, data.picture, data.password, data.mail, data.authority, data.publicity);
    callback(result);

    const user = await selectUser(data.id);
    //フレンド情報の更新
    const { rows : followers } = runGeneralSQL('select-users-followers', [ data.id ], 'picture')
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
    const { rows, status, message } = await runGeneralSQL('select-users-friends', [ data.id ], 'picture')
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
    const result = await runGeneralSQL('insert-into-user-friend-unit', [ data.user_id, data.friend_id ],null)
    callback(result);
    const friend = await selectUser(data.friend_id);
    io.to(`@${data.user_id}`).emit('receive-signal', { data: friend, signal: '001001', status: true });
    const user = await selectUser(data.user_id);
    io.to(`@${data.friend_id}`).emit('receive-signal', { data: user, signal: '001001', status: true });
  })

  socket.on('notice-reading-tweet', async (data, callback) => {
    const { stauts:insertStatus, message:insertMessage } = runGeneralSQL('insert-into-user-tweet-unit', [ data.user_id, data.tweet_id ], null)
    if(!insertStatus)
      callback({'status':insertStatus, 'message':insertMessage})
    const { rows, status, message } = await runGeneralSQL('get-tweet-count', [ data.tweet_id ], null)
    if(!status)
      callback({ status, message });
    const room_id = rows[0].room_id;
    callback({message: '既読', status: true, data: { tweet_id: data.tweet_id, room_id, check: 1 }});
    io.to(room_id).emit('/socket/client', { rest: '/tweet/update', rows: rows[0] });

  })

  function generateRandomString(length) {
    return randomBytes(length).reduce((p, i) => p + (i % 36).toString(36), '')
  }

  // 送信したユーザーへ返信
  socket.on('/socket/server', async (req, callback) => {
    logger.info('/socket/server')
    const { rest, data } = req
    const request = new Request('/socket/server', rest, data, null);
    switch(rest) {
      case '/first-login-room':
        logger.info('/first-login-room')
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
        break
      case '/chat': // 呟く
      case '/tweet/public': // get-tweet-in-public
      case '/tweet/public/before': // get-tweet-in-public-before
      case '/user/room': // userが属する全てのルームの取得 // get-users-rooms
      case '/room/create':
      case '/room/tweet': // get-tweets-in-room
      case '/room/tweet/user/read':
      case '/room/user': // roomに属しているuser
      case '/room/tweet/picture': // roomで呟かれた画像付きツイート全て
      case '/user/webhook':
      case '/webhook/id/option':
      case '/webhook/id/output':
      case '/webhook/id/outgoing':
      case '/webhook/id/scheduler':
        logger.info(rest)
        var response = await runProcesePerCondition(request)
        callback(response);
        break
    }
  })

  // 特定の部屋に所属するユーザー全員へ送信
  socket.on('/socket/server/room', async(req, callback) => {
    logger.info('/socket/server/room')
    const { rest, data } = req
    const { room_id } = req.data
    const request = new Request('/socket/server/room', rest, data, null);
    switch(rest) {
      case '/room/tweet/id/count/update':
        // tweetの既読数の更新
        var response = await runProcesePerCondition(request)
        io.to(room_id).emit('/socket/client', response)
        callback(response)
        break
    }
  })

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
    }
  })
});

/**
 * SocketとREST APIで共通する処理
 * @param request 
 * @returns 
 */
async function runProcesePerCondition(request:Request) {
  logger.info('runProcesePerCondition');
  logger.info(request);
  const data:{[key: string]: any} = request.data
  var response:Response;
  switch(request.rest) {
    // 呟き
    case "/chat":
      logger.info('/chat');
      var result = await chat(data.user, data.room, data.text, data.picture, data.head)
      // 呟きを知らせる処理
      if(result.status && CHATROOMS.includes(data.room)){
        console.log('通知を送る')
        io.to(data.room).emit('receive-notification', result.data[0])
        const { rows : room } = await runGeneralSQL('select-room', [ data.room ], 'picture')
        if(room[0]["openlevel"]===3){
          const { rows } = await runGeneralSQL('select-users-followers', [ data.user ], 'picture')
          io.to(`@${data.user}`).emit('receive-signal', { data: result.data[0], signal: '000001', status: true });
          rows.forEach((usr, idx) => {
            io.to(`@${usr["id"]}`).emit('receive-signal', { data: result.data[0], signal: '000001', status: true });//<-ここでフォロワーに送る
          })
        }
      }
      response = new Response(result.status, [], "chat success", request)
      break;
    // get-tweet-in-public
    case "/tweet/public":
      logger.info("/tweet/public")
      var { status, rows, message } = await getTweetInPublic(data.user_id);
      response = new Response(status, rows, message, request)
      break;
    // get-tweet-in-public-before
    case "/tweet/public/before":
      logger.info("/tweet/public/before")
      var { status, rows, message } = await getTweetInPublicBefore(data.user_id, data.head_tweet_id);
      response = new Response(status, rows, message, request)
      break;
    // ユーザーが属する部屋リスト取得
    case "/user/room":
      logger.info(request.rest)
      var { status, rows, message } = await runGeneralSQL('/sql/user/room', [ data.user_id ], 'picture')
      response = new Response(status, rows, message, request)
      break;
    // case '/room/create':
    case "/room/tweet": // ※送り手と受け手で既読などの取得データが異なる
      logger.info(request.rest)
      var { status, rows, message } = await getTweetInSingleRoom(data.user_id, data.room_id)
      response = new Response(status, rows, message, request)
      break;
    case '/room/tweet/id/count/update':
      logger.info(request.rest)
      var { status, rows, message } = await  runGeneralSQL('get-tweet-count', [ data.tweet_id ], null)
      response = new Response(status, rows, message, request)
      break;
    case "/room/tweet/user/read":
      logger.info(request.rest)
      var { status, rows, message } = await  runGeneralSQL('insert-into-user-tweet-unit', [ data.user_id, data.tweet_id ], null)
      response = new Response(status, rows, message, request)
      break;
    case "/room/user":
      logger.info(request.rest)
      var { status, rows, message } = await runGeneralSQL('/sql/room/user', [ data.room_id ], 'picture')
      response = new Response(status, rows, message, request)
      break;
    case '/room/tweet/picture':
      logger.info(request.rest)
      var { status, rows, message } = await getPicTweetInSingleRoom(data.user_id, data.room_id)
      response = new Response(status, rows, message, request)
      break;
    case '/user/webhook':
      logger.info(request.rest)
      var { status, rows, message } = await runGeneralSQL('/sql/user/webhook', [ data.user_id ], null)
      response = new Response(status, rows, message, request)
      break
    case '/webhook/id/option':
      logger.info(request.rest)
      var { status, rows, message } = await runGeneralSQL('/sql/webhook/outgoing/id/option', [ data.api_id ], null)
      // var tmp:{[key: string]: any} = {}
      // rows.map((row) => {
      //   var keywords = row.keyword.split('.').filter(text => text.length > 0)
      //   keywords.unshift(row.option)
      //   tmp = pseudoJQ(keywords, row.value, tmp)
      // })
      response = new Response(status, rows, message, request)
      break
    case '/webhook/id/outgoing':
      logger.info(request.rest)
      var { status, rows, message } = await runGeneralSQL('/restapi/id/outgoingwebhook', [ data.api_id ], null)
      response = new Response(status, rows, message, request)
      break
    case '/webhook/id/scheduler':
      logger.info(request.rest)
      var { status, rows, message } = await runGeneralSQL('/restapi/id/scheduler', [ data.api_id ], null)
      response = new Response(status, rows, message, request)
      break
    case '/webhook/id/output':
      logger.info(request.rest)
      var { status, rows, message } = await runGeneralSQL('/sql/webhook/outgoing/id/output', [ data.api_id ], null)
      response = new Response(status, rows, message, request)
      break
    case '/webhook/id/flag/update':
      logger.info(request.rest)
      var { status, rows, message } = await runGeneralSQL('/sql/webhook/outgoing/id/flag/update', [ data.flag, data.id ], null)
      response = new Response(status, rows, message, request)
      break
    case '/webhook/id/execute':
      var options = await runGeneralSQL('/restapi/id/option', [ data.restapi_id ], null)
      var tmp:{[key: string]: any} = {}
      // Webhookのパラメータ作成
      for(const option of options.rows) {
        var outputText = ''
          if(option.replacekeyword==null) {
            // RestAPI_Option.valueをそのまま使用
            outputText = option.value
          } else {
            // Request内の指定のデータを取得し、RestAPI_Option.valueの正規表現箇所と置換
            var planeText = getValueFromObject(option.replacekeyword.split('.').filter(t => t.length>0), request)
            outputText =  option.value.replace(new RegExp(option.regexpvalue), planeText)
          }
          // 作成されたテキストをObjectの指定箇所に挿入
          var keywords = option.keyword.split('.').filter(text => text.length > 0)
          keywords.unshift(option.option)
          tmp = pseudoJQ(keywords, outputText, tmp)
      }
      logger.warn('dataの中身')
      logger.warn(data)
      // APIの実行
      await axios({ method:data.method, url:data.url, data:tmp.data, params:tmp.params })
      .then(async res => {
        logger.debug(res)
        // APIから取得したデータを基にした出力（呟く）
        var { status, rows, message } = await runGeneralSQL('/restapi/id/output/get', [ data.restapi_id ], null);
        rows.forEach(async (output) => {
          // 任意のパラメータ値を取得
          var param = getValueFromObject(output.keyword.split('.').filter(t => t.length>0), res)
          // パラメータを用意しているテキストに差し込む
          var outputText = output.value.replace(new RegExp(output.regexpvalue), param)
          // 呟く！
          const outputData = { text:outputText, user:output.user_id, room:output.room_id, head:null, picture:null }
          await runProcesePerCondition(new Request('/outgoing/output', '/chat', outputData, null))
        })
        response = new Response(status, rows, message, request)
      }).catch(error => {
        logger.error(error);
        response = new Response(false, [], message, request)
      }).finally(() => {})
      break
    case '/webhook/outgoing/add':
      logger.info(request.rest)
      // RestAPIの登録
      var RestAPI_id:number = -1;
      var { status, rows, message } = await runGeneralSQL('/restapi/id/add', [ data.method, data.url, data.user_id ], null)
      if(rows.length>0)
        RestAPI_id = rows[0]['id']
      else
        break;
      // RestAPI_Optionの登録
      var keys = getKeysFromObject(data.data)
      keys.map(async(key, index) => {
        var value = getValueFromObject(key.split('.').filter(x=>x.length>0), data.data)
        var replaceKey = getValueFromObject(key.split('.').filter(x=>x.length>0), data.replaceKey)
        var regexpValue = getValueFromObject(key.split('.').filter(x=>x.length>0), data.regexpValue)
        var resp = await runGeneralSQL('/restapi/id/option/add', [ RestAPI_id, index+1, 'data', key,replaceKey, regexpValue, value ], null)
      })
      response = new Response(status, rows, message, request)
      break
    case "/scheduler/restapi/id/flag/update":
      logger.info(request.rest)
      var { status, rows, message } = await runGeneralSQL('/sql/scheduler/restapi/id/flag/update', [ data.flag, data.restapi_id, data.id ], null)
      response = new Response(status, rows, message, request)
      break;
    // mail 送信, 相手に送信完了メール & 特定のアドレスに確認メール & 特定のルームに投稿
    case "/mail":
      logger.info("/mail")
      var status:any = false;
      var message:any = '';
      if('mail' in data && 'subject' in data && 'text' in data) {
        // 相手に送信完了メール
        var message1 = `以下のメッセージを送信しました\n件名:${data.subject}\n内容:${data.text}`
        sendMail(data.mail, `From Shinjo Sato Website`, message1)
        message += message1+'\n'
        // 特定のアドレスに通知メール
        var message2 = 'ウェブサイトから以下のメッセージを取得しました。\n↓\n'+data.text
        sendMail('nomi.shinjo@gmail.com', 'From website: '+data.subject, message2)
        message += message2
        // 送信完了
        status = true
      }
      response = new Response(status, rows, message, request)
      break;
    default:
      response = new Response(false, [], 'null', request)
  }

  // 正規表現に引っかかったOutgoing Webhookの実行
  switch(request.rest){
    case '/chat':
      var checkOutgoing = await runGeneralSQL('/webhook/outgoing/check', [ data.room, data.text ], null)
      if(checkOutgoing.rows.length > 0) {
        // 正規表現に引っかかったOutgoing Webhookを順に実行
        checkOutgoing.rows.forEach(async (row) => {
          // APIの実行に必要となるデータを追加
          request.data.text = row.value
          request.data.restapi_id = row.restapi_id
          request.data.url = row.url
          // APIを実行
          const subRequest = new Request('/webhook', '/webhook/id/execute', request.data, null)
          const subResponse = await runProcesePerCondition(subRequest)
        })
      }
      break;
    default:
      break;
  }

  return response;
}

/**
 * Objectの任意の位置に値を代入させる。
 * @param keys - Objectの目的の位置までの道のりを示すKeyを含む配列
 * @param value - Objectの目的の位置に入れる値
 * @param obj - 更新させるObjectデータ
 * @returns valueが代入されたObjectデータ
 */
function pseudoJQ(keys:string[], value:any, obj:object) {
  const key = keys.shift()
  return { ...obj, [key]: (keys.length==0)? value : pseudoJQ(keys, value, (obj!=null && key in obj)? obj[key] : null) }
}

/**
 * Objectの任意の位置にある値を取得する。
 * @param keys 目的となる値までの道のりを示すKeyを含む配列
 * @param obj - 目的となる値を含むObjectデータ
 * @returns 目的となる値
 */
function getValueFromObject(keys, obj) {
  const key = keys.shift()
  return (keys.length==0)
    ? obj[key]
    : (key.match(/[\d]/g)==null)
      ? getValueFromObject(keys, obj[key])
      : getValueFromObject(keys, (obj[key.match(/.+(?=\[)/g)])[Number(key.match(/[\d]/g))])
}

/**
 * Objectに含まれるkeyをディレクトリ形式の文字列に変換して取得する。
 * @param {object} ob 
 * @returns {string[]} ディレクトリ形式の文字列を含む配列。
 */
 function getKeysFromObject(ob:object) {
  var valuelist:string[] = []
  Object.keys(ob).map((key) => {
      const currentDirectory = `.${ key }`
      switch(typeof(ob[key])) {
          case "number":
          case "string":
              valuelist = [ ...valuelist, `${ currentDirectory }`]
              break;
          case "object":
              if(ob[key] == null)
                  valuelist = [ ...valuelist, `${ currentDirectory }`]
              else
                  valuelist = [ ...valuelist, ...getKeysFromObject(ob[key]).map(x => `${ currentDirectory }${x}`) ]
              break;
      }
  })
  return valuelist
}

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
    const { rows : pict } = await runGeneralSQL('insert-into-picture', [ '練習用のラベル', path ], null)
    params = [ text, room, user, pict[0].id, head ]
  }else{
    // 画像を持たない時の処理
    key = 'insert-into-tweet'
    params = [ text, room, user, head ]
  }
  // 共通の処理
  const { rows : insert } = await runGeneralSQL(key, params, null)
  // 部屋の更新?
  await updateRoomlatest(room);
  // ツイートの取得
  const result = await getSingleTweet(insert[0].id);
  return result
}

// ここを確認!
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

// APIを管理する関数
app.post("/api", async function (req, response) {
  logger.info('/api')
  logger.info(req.body)
  response.set({ 'Access-Control-Allow-Origin': '*' });
  const { rest, data, appid } = req.body
  const request = new Request('/api', rest, data, appid)
  // APPID認証チェック
  const checkAppid = await runGeneralSQL('/api/appid/check', [ appid, rest ], null)
  if(checkAppid.rows.length == 0) {
    return response.json(new Response(false, [], 'APPIDが存在しません。', request))
  }

  switch(rest) {
    // 動作テスト用API
    case '/test':
      logger.info('/test')
      response.json(new Response(true, [], 'API送受信に成功しました。', request))
      break
    case '/chat': // 呟く
    case '/webhook/outgoing/add': // Outgoing Webhookの登録
    case '/webhook/id/flag/update':
    case '/scheduler/restapi/id/flag/update':
      logger.info(rest)
      response.json(await runProcesePerCondition(request))
      break
    // メール送信
    case '/mail':
      logger.info('/mail')
      var { status, rows, message } = await runProcesePerCondition(request)
      response.json(new Response(status, rows, message, request))
      break
    default:
      logger.info('default')
      response.json(new Response(false, [], '一致するAPIが存在しませんでした。', request))
  }
})

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
  const result = await addUserWithPicture(data.user_id, data.user_name, data.password1, data.mail, data.authority, 1, '練習用のラベル0', path, response);
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

// 今後実装予定のスケジュール実行
// cronJobsの中身を直接削除するというのは極力控える。
// スケジュールマスタのような物をPostgreSQL上に用意して、毎分それを読み込んで実行させる仕組みにしたい。
// 特定の日時一度きり:timestamp, 特定の日一度きり:Date, 固定の時間毎日: Time, 固定の時間等間隔: interval （最小で分単位）
// {schedule:"timestamp", time:"2022/11/10 12:30:00"}, {schedule:"interval", time:"00:15:00"}, {schedule:"week", time:"0,1,0,1,0,0,0"/* Sunday, Monday, Tuesday, Wednesday, Thrsday, Friday, Saturday */}
// timeの中身はコードマスタ?を作成して管理させたい。
// ①DBからジャストタイミングでさせるものを取得・実行
// const cronJobs:any[] = [];
// cronJobs.push(
cron.job(
  '0 */1 * * * *', // Every minute
  async () => {
    const currentTime = new Date(Date.now())
    // TimeZoneを日本時間に修正
    currentTime.setHours(currentTime.getHours() + 9)
    logger.info('Schedule実行開始時刻:', currentTime)
    var { status, rows, message } = await runGeneralSQL('/sql/schedule/get', [], null)
    rows.map(async (row) => {
      const request = new Request('/schedule', '/webhook/id/execute', { url:row.url, method:row.method, restapi_id:row.id, text:row.text }, null)
      const response = await runProcesePerCondition(request)
      if(response.status == true) {
        await runGeneralSQL('/sql/schedule/executetime/update', [ currentTime.toISOString(), row.id, row.schedule_id ], null)
        logger.info('schedule successfully and update "executeTime"!')
      }
    })
  },
  null,
  true
)
// )
// logger.info('cronの実行テスト開始')