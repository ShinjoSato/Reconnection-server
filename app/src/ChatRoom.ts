export interface ChatRoomInterface {
    id: number;
    picture: any;
    name: string;
    openLevel: number;
    postLevel: number;
    letterNum: number;
    term: number;
}

export class ChatRoom implements ChatRoomInterface {
    constructor (
        public id: number,
        public picture: any,
        public name: string,
        public openLevel: number,
        public postLevel: number,
        public letterNum: number,
        public term: number,
    ) {}
}
