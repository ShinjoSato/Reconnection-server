const fs = require('fs');

function getImage(path){
    const data = fs.readFileSync(path);
    return "data:image;base64,"+ data.toString("base64");
}

function setImage(binary){
    var matches = String(binary).match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    var response = {
      type: matches[1],
      data: Buffer.from(matches[2], 'base64')
    };
    return response.data;
}

function saveImage(path: string, picture: any){
    console.log('save image.');
    console.log(path);
    fs.writeFileSync(path, setImage(picture), 'base64');
}

function isExisted(file) {
    return fs.existsSync(file);
}

export {getImage, setImage, saveImage, isExisted}