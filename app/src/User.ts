export interface UserInterface {
    id: string;
    name: string;
    picture: any;
    mail: string;
}

export class User implements UserInterface {
    constructor(
        public id: string,
        public name: string, 
        public picture: any,
        public mail: string,
    ) {}
}
