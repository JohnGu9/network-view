import pako from "pako";

export function deflate(arr: ArrayBuffer) {
    return pako.gzip(new Uint8Array(arr)).buffer;
}

export function inflate(arr: ArrayBuffer) {
    return pako.ungzip(new Uint8Array(arr)).buffer;
}

export function stringifyAndDeflate(obj: unknown) {
    const str = JSON.stringify(obj);
    const buf = utf8TextEncode(str);
    const arr = deflate(buf.buffer);
    return arr;
}

export function inflateAndJson(arr: ArrayBuffer) {
    const buf = inflate(arr);
    const str = utf8TextDecode(buf);
    const obj = JSON.parse(str);
    return obj;
}

const Utf8TextEncoder = new TextEncoder();// always utf-8
const Utf8TextDecoder = new TextDecoder("utf-8");

function utf8TextEncode(input: string) {
    return Utf8TextEncoder.encode(input);
}

function utf8TextDecode(buffer: ArrayBuffer) {
    return Utf8TextDecoder.decode(buffer);
}
