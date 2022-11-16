// 受信されるクラス (Socket, REST API)
export interface RequestInterface {
    url: string; // /socket/server, /socket/client or /api
    rest: string; // /.../... 
    data: { [key: string]:any }|null;
    appid: string|null; // socket通信時はnull, REST API時は必須
}

export class Request implements RequestInterface {
    constructor (
        public url: string,
        public rest: string,
        public data: { [key: string]:any }|null,
        public appid: string|null,
    ) {}
}

// 返信するクラス (Socket, REST API)
export interface ResponseInterface {
    status: boolean;
    rows: any[];
    message: string;
    request: Request;
}

export class Response implements ResponseInterface {
    constructor (
        public status: boolean,
        public rows: any[],
        public message: string,
        public request: Request,
    ) {}
}
