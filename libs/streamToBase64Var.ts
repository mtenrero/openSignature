import { Stream } from "stream";

export default function StreamToBase64Var(stream: Stream): Promise<string> {
    return new Promise((resolve, reject) => {
        let buffers = [];
        stream.on('data', (chunk) => { buffers.push(chunk); });
        stream.once('end', () => {
            let buffer = Buffer.concat(buffers);
            resolve(buffer.toString('base64'));
        });
        stream.once('error', (err) => {
            reject(err);
        });
    });
    
}