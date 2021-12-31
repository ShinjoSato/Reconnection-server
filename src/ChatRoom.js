"use strict";
exports.__esModule = true;
exports.ChatRoom = void 0;
var ChatRoom = /** @class */ (function () {
    function ChatRoom(id, picture, name, openLevel, postLevel, letterNum, term) {
        this.id = id;
        this.picture = picture;
        this.name = name;
        this.openLevel = openLevel;
        this.postLevel = postLevel;
        this.letterNum = letterNum;
        this.term = term;
    }
    return ChatRoom;
}());
exports.ChatRoom = ChatRoom;
