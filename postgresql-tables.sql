-- 準備
CREATE EXTENSION PGCRYPTO;

-- テーブル
create table picture_table(
    id      serial not null,
    label   varchar(32) not null,
    path    varchar(256) not null,
    period  timestamp,
    primary key(id)
);

create table user_table(
    id          varchar(16) not null,
    name        varchar(32) not null,
    password    bytea not null,
    image       integer not null references picture_table(id),
    mail        bytea not null,
    primary key(id)
);

create table chatroom (
    id      serial not null,
    icon    integer not null references picture_table(id),
    name    varchar(32) not null,
    openLevel integer not null DEFAULT 3,
    postLevel integer not null DEFAULT 3,
    letterNum integer not null DEFAULT 300,
    term    integer,
    primary key(id)
);

create table tweet (
    id      serial not null,
    tweet   varchar(512) not null,
    room_id integer not null references chatroom(id),
    time    timestamp not null DEFAULT now(),
    user_id varchar(16) not null references user_table(id),
    picture_id integer references picture_table(id),
    period  timestamp,
    primary key(id)
);

create table user_chatroom_unit (
    user_id     varchar(16) not null references user_table(id),
    chatroom_id integer not null references chatroom(id),
    authority   boolean not null DEFAULT TRUE,
    primary key(user_id,chatroom_id)
);


-- サンプルデータ集
insert into picture_table(label,path) values('ダミー画像','');
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