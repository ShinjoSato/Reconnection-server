-- 準備
CREATE EXTENSION PGCRYPTO;

-- テーブル
create table picture_table(
    id      serial not null,
    label   varchar(32) not null,
    path    varchar(256) not null,
    primary key(id)
);

create table user_table(
    id          varchar(16) not null,
    name        varchar(32) not null,
    password    bytea not null,
    image       integer not null references picture_table(id),
    primary key(id)
);

create table chatroom (
    id      serial not null,
    icon    integer not null references picture_table(id),
    name    varchar(32) not null,
    primary key(id)
);

create table tweet (
    id      serial not null,
    tweet   varchar(512) not null,
    room_id integer not null references chatroom(id),
    time    timestamp not null DEFAULT now(),
    user_id varchar(16) not null references user_table(id),
    primary key(id)
);

create table user_chatroom_unit (
    user_id     varchar(16) not null references user_table(id),
    chatroom_id integer not null references chatroom(id),
    primary key(user_id,chatroom_id)
);


-- サンプルデータ集
insert into picture_table(label,path) values('ダミー画像','');
insert into user_table(id,name,password,image) values('sample01','サンプルユーザー',pgp_sym_encrypt('sample','password'),1);
insert into chatroom(icon,name) values(1,'ダミールーム'),(1,'ルーム１'),(1,'ルーム２'),(1,'ルーム３');
insert into tweet(tweet,room_id,user_id) values('サンプルに呟きます',1,'sample01');
insert into picture_table(label,path)
values('マイケル画像','./src/images/free_max64x64.jpg'),
('メリンダ画像','./src/images/woman01_64x64.jpg'),
('チェン画像','./src/images/man02_64x64.jpg');
insert into user_table(id,name,password,image) values
('sample02','Micel',pgp_sym_encrypt('sample','password'),2),
('sample03','Melinda',pgp_sym_encrypt('sample','password'),3),
('sample04','Chen',pgp_sym_encrypt('sample','password'),4);
insert into user_chatroom_unit
values('sample02',4),('sample04',3),('sample02',2),('sample03',3),('sample04',4);

-- ユーザー取得
select user_table.id,user_table.name,picture_table.path from user_table 
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
