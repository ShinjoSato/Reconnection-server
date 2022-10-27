export interface ChatRoomInterface {
    status: boolean;
    rows: any[];
    message: string;
}

// Socket, REST APIで返信する時の中身
export default class ChatRoom implements ChatRoomInterface {
    constructor (
        public status: boolean,
        public rows: any[],
        public message: string,
    ) {}
}
