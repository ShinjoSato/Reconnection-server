-- 準備
CREATE EXTENSION PGCRYPTO;

-- テーブル
create table picture_table(
    id      serial not null,
    label   varchar(32) not null,
    path    varchar(256) not null,
    -- period  timestamp,
    primary key(id)
);

create table user_table(
    id          varchar(16) not null,
    name        varchar(32) not null,
    password    bytea not null,
    image       integer not null references picture_table(id),
    mail        text not null,
    authority   boolean not null DEFAULT TRUE,
    publicity   integer not null DEFAULT 1, -- 1: 一般ユーザー(ID検索で完全一致させて追加)), 2: 公式アカウント(検索しやすく自由に追加), 3: 必須アカウント(アカウント作成時にフレンド追加)
    primary key(id)
);

create table chatroom (
    id      serial not null,
    icon    integer not null references picture_table(id),
    name    varchar(32) not null,
    openLevel integer not null DEFAULT 3, -- 1: 自分のみ, 2: 限定公開, 3: 全体公開
    postLevel integer not null DEFAULT 3, -- 1: 自分のみ, 2: 限定投稿, 3: 全体投稿
    start   timestamp not null DEFAULT now(), -- 部屋が作成された時
    latest  timestamp not null DEFAULT now(), -- 部屋が作成された時, 呟かれた時
    -- letterNum integer not null DEFAULT 300, -- 300: 300文字以下, 500: 500文字以下, 0: 制限無し
    -- term    integer, -- 1: 1カ月以内, 6: 半年以内, 12: 一年以内, 0: 制限無し
    primary key(id)
);

create table tweet (
    id      serial not null,
    tweet   varchar(512) not null,
    room_id integer not null references chatroom(id),
    time    timestamp not null DEFAULT now(),
    user_id varchar(16) not null references user_table(id),
    picture_id integer references picture_table(id),
    head    integer DEFAULT null,
    -- period  timestamp,
    primary key(id)
);

-- ReconnectionのIncoming webhook(REST API)
-- 登録すると以下のようなAPIが作成される
-- https://ipアドレス:port番号/rest
-- Reconnection内で行われる動作のAPI
-- parameterやdataは外部からの入力
create table IncomingWebhook (
    id          integer GENERATED ALWAYS AS IDENTITY,
    appid       varchar(32) not null, -- ランダムな文字列のキー
    user_id     varchar(16) not null references user_table(id),
    createTime  timestamp not null DEFAULT now(),
    updateTime  timestamp not null DEFAULT now(),
    UNIQUE(appid),
    primary key(id)
);

-- 外部・内部のAPIを管理
create table RestAPI (
    id      integer GENERATED ALWAYS AS IDENTITY,
    method  varchar(8) not null, -- 1:GET, 2:POST, ... 数字文字か文字か
    url     varchar(256) not null,
    user_id varchar(16) not null references user_table(id), -- このユーザーがRestAPIを実行兼オーナー
    createTime timestamp not null DEFAULT now(),
    updateTime timestamp not null DEFAULT now(),
    primary key(id)
);

-- RestAPIに持たせる値
create table RestAPI_Option (
    restapi_id integer not null references RestAPI(id),
    id integer not null,
    option varchar(64) not null, -- Header, Parameter, Data, Cookie　などのオプションを示す数値か文字
    keyword varchar(64) not null, -- 複雑なObject(JSON)構造にも対応させたいので、{ data: { status: 'GOOD! } } の時は /data/status とする
    replacekeyword varchar(64) not null, -- valueがnullの時にRequestパラメータから欲しいデータを取得する。
    value varchar(128), -- nullの時に値を入力値から取得（とりあえずまずはtextからregexpで抽出したもの）
    regexpvalue varchar(64), -- valueに対応させた正規表現で、ひっかかった箇所を取得したデータ（テキスト）に入れ替える
    primary key(restapi_id, id)
);

-- flagはAPIやWebhookでtrue,falseを切り替える
-- 正規表現に該当するもののAPIを実行させる？
-- Reconnection内での特定の動作（chatなど）でイベント（内部・外部APIの実行）を実行
create table OutgoingWebhook (
    id          integer GENERATED ALWAYS AS IDENTITY,
    room_id     integer not null references chatroom(id),
    regexp      varchar(64) not null, -- 引っかかったのもを発火させる為の正規表現
    restapi_id  integer not null references RestAPI(id),
    flag        boolean DEFAULT FALSE, -- trueの時は実行中, falseの時は無反応
    user_id     varchar(16) not null references user_table(id), -- 
    createTime  timestamp not null DEFAULT now(),
    updateTime  timestamp not null DEFAULT now(),
    primary key(id)
);

create table user_chatroom_unit (
    user_id     varchar(16) not null references user_table(id),
    chatroom_id integer not null references chatroom(id),
    authority   boolean not null DEFAULT TRUE,
    opening     boolean not null DEFAULT TRUE,
    posting     boolean not null DEFAULT TRUE,
    primary key(user_id,chatroom_id)
);

create table user_friend_unit (
    user_id     varchar(16) not null references user_table(id),
    friend_id   varchar(16) not null references user_table(id),
    time        timestamp not null DEFAULT now(),
    primary key (user_id, friend_id)
);

create table user_tweet_unit (-- 既読履歴
    user_id     varchar(16) not null references user_table(id),
    tweet_id    integer not null references tweet(id),
    time        timestamp not null DEFAULT now(),
    primary key(user_id, tweet_id)
);

create table chatroom_publication (-- API実行。hatroomのopenLevel=3のみ登録可能
    id      varchar(16) not null,
    room_id integer not null references chatroom(id),
    PRIMARY KEY(id)
);
-- insert into chatroom_publication(id, room_id) values('qazwsxedcrfvtgby', 118);
SELECT room_id FROM chatroom_publication
WHERE id = 'qazwsxedcrfvtgby';

-- サンプルデータ集
insert into picture_table(label,path) values('ダミー画像','');
insert into picture_table(label,path) values('default image','images/default.png'); -- 必須！
insert into user_table(id,name,password,image) values('sample01','サンプルユーザー',pgp_sym_encrypt('sample','password'),1);
insert into picture_table(label,path) values
('マイケル画像','/tmp_images/free_max64x64.jpg'),
('メリンダ画像','/tmp_images/woman01_64x64.jpg'),
('チェン画像','/tmp_images/man02_64x64.jpg'),
('街','/tmp_images/city01.jpg'),
('自然','/tmp_images/nature01.jpg'),
('夜空','/tmp_images/nightsky01.jpg'),
('ビーチ','/tmp_images/beach01.jpg');
insert into user_table(id,name,password,image) values
('sample02','Micel',pgp_sym_encrypt('sample','password'),2),
('sample03','Melinda',pgp_sym_encrypt('sample','password'),3),
('sample04','Chen',pgp_sym_encrypt('sample','password'),4);
insert into chatroom(icon,name) values(1,'ダミールーム'),(5,'ルーム１'),(6,'ルーム２'),(7,'ルーム３');
insert into user_chatroom_unit
values('sample02',4),('sample04',3),('sample02',2),('sample03',3),('sample04',4);
insert into tweet(tweet,room_id,user_id) values('サンプルに呟きます',1,'sample01');

insert into user_table(id,name,password,image, mail, authority) values('admin','アドミン', pgp_sym_encrypt('admin','password'),1, 'defaultmail@mail', true); -- 必須！
INSERT INTO chatroom(icon,name,openLevel,postLevel) VALUES(1,'アドミン',1, 1) RETURNING *; -- 必須！
INSERT INTO user_chatroom_unit(user_id, chatroom_id) VALUES('admin',1) RETURNING *; -- 必須！

-- ユーザー取得
select user_table.id,user_table.name,user_table.publicity,picture_table.path from user_table 
join picture_table on user_table.image = picture_table.id;
-- ルーム取得
select chatroom.id,chatroom.name,picture_table.path,user_chatroom_unit.user_id from chatroom
join picture_table on chatroom.icon = picture_table.id
join user_chatroom_unit on chatroom.id = user_chatroom_unit.chatroom_id
where user_chatroom_unit.user_id = 'sample02';
-- 呟きを取得
select tweet.id,tweet,tweet.time, user_table.name as user,user_table.path as user_icon from tweet
join (
    select user_table.id,user_table.name,picture_table.path from user_table
    join picture_table on user_table.image = picture_table.id
) as user_table on tweet.user_id = user_table.id
where room_id = 1;
-- テーブル内データ削除用
delete from user_chatroom_unit;
delete from tweet;
delete from chatroom;
delete from user_table;
delete from picture_table;

-- テーブル削除用
drop table user_chatroom_unit;
drop table tweet;
drop table chatroom;
drop table user_table;
drop table picture_table;

-- メモ
select tweet.id,tweet,tweet.time, user_table.name as user,user_table.path as user_icon, picture_table.path from tweet
join (
    select user_table.id,user_table.name,picture_table.path from user_table
    join picture_table on user_table.image = picture_table.id
) as user_table on tweet.user_id = user_table.id
left join picture_table on tweet.picture_id = picture_table.id
order by tweet.id;

select tweet.id,tweet,tweet.time, user_table.name as user,user_table.path as user_icon from tweet
join (
    select user_table.id,user_table.name,picture_table.path from user_table
    join picture_table on user_table.image = picture_table.id
) as user_table on tweet.user_id = user_table.id
order by tweet.id;

select * from user_table
join user_chatroom_unit on user_table.id = user_chatroom_unit.user_id
where user_chatroom_unit.chatroom_id = 4;
-- 全ての呟きに対する既読数と特定ユーザーの既読確認を取得。
SELECT tweet.id, A.count AS count, B.count AS check FROM tweet
JOIN(-- 呟きに対する既読数
    SELECT tweet.id, COUNT(A.tweet_id) AS count
    FROM tweet
    LEFT JOIN (
        SELECT tweet_id
        FROM user_tweet_unit
    ) AS A ON tweet.id = A.tweet_id
    GROUP BY tweet.id
) AS A ON A.id = tweet.id
JOIN(-- 特定のユーザーが呟きを既に読んだ時に1, 読んでいない時に0を示す
    SELECT tweet.id, COUNT(A.tweet_id)
    FROM tweet
    LEFT JOIN (
        SELECT tweet_id
        FROM user_tweet_unit
        WHERE user_id = 'sample02'
    ) AS A ON tweet.id = A.tweet_id
    GROUP BY tweet.id
) AS B ON B.id = tweet.id;

-- 追加事項
alter table user_table add column mail text not null DEFAULT 'dummy@dummy';
alter table user_table add column authority boolean not null DEFAULT TRUE;
alter table chatroom add openLevel integer not null DEFAULT 3;
alter table chatroom add postLevel integer not null DEFAULT 3;
alter table user_chatroom_unit add column authority boolean not null DEFAULT TRUE;
alter table user_chatroom_unit add column opening boolean not null DEFAULT TRUE;
alter table user_chatroom_unit add column posting boolean not null DEFAULT TRUE;
alter table tweet add column head integer DEFAULT null;
alter table user_table add column publicity integer not null DEFAULT 1;
alter table chatroom add column start timestamp not null DEFAULT now();
alter table chatroom add column latest timestamp not null DEFAULT now();

-- 一時的メモ（内容は必ず削除する）

-- insert into RestAPI(method, url, user_id)
-- values('POST', 'https://discord.com/api/webhooks/1038729638475743332/emIX1JY5Sun-RsLgCVAt_0dc5oTUFFCLVVC-iUWRoSpmTN25SZbpH7PwpbMJSovddw6u', 'admin') RETURNING *;

-- insert into RestAPI_Option(restapi_id, id, option, keyword, replacekeyword, regexpvalue, value)
-- values(1, 1, 'data', '.content', '.data.text', '(テキスト)', '予め用意されているテキストです。'); -- request.data.textの値を取得したい

-- insert into OutgoingWebhook(room_id, user_id, regexp, restapi_id, flag)
-- values('164', 'admin', '^discord:(.*)$', 1, TRUE);

-- SELECT A.restapi_id, A.room_id, A.flag, A.regexp, B.method, B.url, B.user_id FROM OutgoingWebhook AS A
-- LEFT JOIN RestAPI AS B on A.restapi_id = B.id
-- WHERE A.room_id = 164 AND A.flag = TRUE AND 'ABC100' ~ A.regexp;