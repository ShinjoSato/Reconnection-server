-- 初期データ
insert into picture_table(label,path) values('default image','images/default.png');

insert into user_table(id,name,password,image, mail, authority) values('admin','アドミン', pgp_sym_encrypt('admin','password'),1, 'defaultmail@mail', true);
INSERT INTO chatroom(icon,name,openLevel,postLevel) VALUES(1,'アドミン',1, 1) RETURNING *;
INSERT INTO user_chatroom_unit(user_id, chatroom_id) VALUES('admin',1) RETURNING *;