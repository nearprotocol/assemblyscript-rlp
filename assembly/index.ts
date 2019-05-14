import { RLPData } from "./type";

const hexAlphabet = '0123456789abcdef';

class Decoded {
    data: RLPData;
    remainder: Uint8Array;

    constructor(data: RLPData, remainder: Uint8Array) {
        this.data = data;
        this.remainder = remainder;
    }
}

/**
 * Parse integers. Check if there is no leading zeros
 * Note that this is NOT safe in assemblyscript due to
 * the lack of error handling.
 * @param v The value to parse
 * @param base The base to parse the integer into
 */
function safeParseInt(v: string, base: u32): u32 {
    if (v.slice(0, 2) == '00') {
        throw new Error('invalid RLP: extra zeros');
    }
    return parseI32(v, base) as u32;
}

/** Transform an integer into its hexadecimal value */
function intToHex(integer: u32): string {
    let res = new Array<string>();
    do {
        let t = integer / 16;
        let r = integer % 16;
        integer = t;
        res.push(hexAlphabet[r]);
    } while (integer);
    let hex = res.reverse().join('');
    return hex.length % 2 ? "0" + hex : hex;
}

function bytesToHex(bytes: Uint8Array): string {
    let arr = new Array<string>();
    for (let i = 0; i < bytes.length; i++) {
        arr.push(intToHex(bytes[i]));
    }
    return arr.join('');
}

function hexToBytes(hex: string): Uint8Array {
    if (!hex.length) {
        return null;
    }
    assert(hex.length % 2 == 0);
    let byte_length = hex.length / 2;
    let res = new Uint8Array(byte_length);
    for (let i = 0; i < byte_length; i++) {
        res[i] = parseI32(hex.substr(i*2, 2), 16) as u8;
    }
    return res;
}

function concatUint8Array(arr1: Uint8Array, arr2: Uint8Array): Uint8Array {
    let len = arr1.length + arr2.length;
    let res = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        if (i < arr1.length) {
            res[i] = arr1[i];
        } else {
            res[i] = arr2[i-arr1.length];
        }
    }
    return res;
}

function concatUint8Arrays(arrays: Array<Uint8Array>): Uint8Array {
    let len = arrays.reduce<u32>(((acc, x) => acc + x.length), 0);
    let res = new Uint8Array(len);
    let counter = 0;
    for (let i = 0; i < arrays.length; i++) {
        for (let j = 0; j < arrays[i].length; j++) {
            res[counter++] = arrays[i][j];
        }
    }
    return res;
}

/**
 * RLP Encoding based on: https://github.com/ethereum/wiki/wiki/%5BEnglish%5D-RLP
 * This function takes in an argument of type Input and returns the rlp encoding of it.
 * @param input: a Uint8Array or an array of inputs.
 * @returns returns rlp encoded byte array.
 **/
export function encode(input: RLPData): Uint8Array {
    if (input.children) {
        let output = new Array<Uint8Array>();
        for (let i = 0; i < input.children.length; i++) {
            output.push(encode(input.children[i]));
        }
        let buf = concatUint8Arrays(output);
        return concatUint8Array(encodeLength(buf.length, 192), buf);
    } else {
        if (input.buffer.length == 1 && input.buffer[0] < 128) {
            return input.buffer;
        }
        return concatUint8Array(encodeLength(input.buffer.length, 128), input.buffer);
    }
}

function encodeLength(len: u32, offset: u32): Uint8Array {
    if (len < 56) {
        return hexToBytes(intToHex(len + offset));
    } else {
        let hexLength = intToHex(len);
        let lLength = hexLength.length / 2;
        let firstByte = intToHex(offset + 55 + lLength);
        return concatUint8Array(hexToBytes(firstByte), hexToBytes(hexLength));
    }
}

/**
 * RLP Decoding based on: {@link https://github.com/ethereum/wiki/wiki/%5BEnglish%5D-RLP|RLP}
 * @param input - Uint8Array
 * @returns - returns RLPData containing the original message
 **/
export function decode(input: Uint8Array): RLPData {
    let res = _decode(input);
    if (res.remainder.length != 0) {
        throw new Error('invalid remainder');
    }
    return res.data;
}

export function _decode(input: Uint8Array): Decoded {
    let length: u32;
    if (!input.length) {
        throw new Error('invalid input: cannot be empty');
    }
    let firstByte = input[0];
    if (firstByte <= 0x7f) {
        // a single byte whose value is in the [0x00, 0x7f] range, that byte is its own RLP encoding.
        return new Decoded(new RLPData(input.subarray(0, 1),null), input.subarray(1));
    } else if (firstByte <= 0xb7) {
        length = firstByte - 0x7f;
        if (firstByte == 0x80) {
            return new Decoded(new RLPData(new Uint8Array(0), null), new Uint8Array(0));
        }
        let data = input.subarray(1, length);
        if (length == 2 && data[0] < 0x80) {
            throw new Error('invalid rlp encoding: byte must be less 0x80');
        }
        return new Decoded(new RLPData(data, null), input.subarray(length));
    } else if (firstByte <= 0xbf) {
        let llength = firstByte - 0xb6;
        length = safeParseInt(bytesToHex(input.subarray(1, llength)), 16);
        let data = input.subarray(llength, length + llength);
        if ((data.length as u32) < length) {
            throw new Error('invalid RLP');
        }
        return new Decoded(new RLPData(data, null), input.subarray(length + llength));
    } else if (firstByte <= 0xf7) {
        length = firstByte - 0xbf;
        let remainder = input.subarray(1, length);
        let decoded: RLPData[] = [];
        while (remainder.length) {
            let d = _decode(remainder);
            decoded.push(d.data);
            remainder = d.remainder;
        }
        return new Decoded(new RLPData(null, decoded), input.subarray(length));
    } else {
        // a list over 55 bytes long
        let llength = firstByte - 0xf6;
        length = safeParseInt(bytesToHex(input.subarray(1, llength)), 16);
        let totalLength = llength + length;
        if (totalLength > (input.length as u32)) {
            throw new Error('invalid rlp: total length is larger than the data');
        }

        let remainder = input.subarray(llength, totalLength);
        if (remainder.length == 0) {
            throw new Error('invalid rlp, List has a invalid length');
        }
        let decoded: RLPData[] = [];
        while (remainder.length) {
            let d = _decode(remainder);
            decoded.push(d.data);
            remainder = d.remainder;
        }
        return new Decoded(new RLPData(null, decoded), input.subarray(totalLength));
    }
}



