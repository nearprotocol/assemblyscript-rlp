import * as RLP from '../index';
import {RLPData} from "../type";

function arrayToUint8Array(array: u8[]): Uint8Array {
    let len = array.length;
    let res = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        res[i] = array[i];
    }
    return res;
}

function bytesToString(bytes: Uint8Array): string {
    return String.fromUTF8((bytes.buffer.data + bytes.byteOffset) as usize, bytes.byteLength);
}

function stringToBytes(s: string): Uint8Array {
    let len = s.lengthUTF8 - 1;
    let bytes = new Uint8Array(len);
    memory.copy(bytes.buffer.data, s.toUTF8(), len);
    return bytes;
}

// describe('random test', (): void => {
//     it('dog', (): void => {
//         let byteArray = new Uint8Array(4);
//         byteArray[0] = 131;
//         byteArray[1] = 100;
//         byteArray[2] = 111;
//         byteArray[3] = 103;
//         let bytes = byteArray.subarray(1);
//         let s1 = bytesToString(bytes);
//         let s2 = String.fromUTF8(bytes.buffer as usize, bytes.byteLength);
//         expect<string>(s1).toBe(s2);
//     });
// });

describe('RLP encoding (string):', (): void => {
    it('should return itself if single byte and less than 0x7f:', (): void => {
        let encodedSelf = RLP.encode(new RLPData(stringToBytes('a'), null));
        expect<string>(bytesToString(encodedSelf)).toBe('a');
        expect<usize>(encodedSelf.length).toBe(1);
    });

    it('length of string 0-55 should return (0x80+len(data)) plus data', (): void => {
        let rlpData = new RLPData(stringToBytes('dog'), null);
        let encodedDog = RLP.encode(rlpData);
        expect<usize>(encodedDog.length).toBe(4);
        // assert.equal(RLP.getLength(encodedDog), 4)
        expect<u8>(encodedDog[0]).toBe(131);
        expect<u8>(encodedDog[1]).toBe(100);
        expect<u8>(encodedDog[2]).toBe(111);
        expect<u8>(encodedDog[3]).toBe(103);
    });

    it('length of string >55 should return 0xb7+len(len(data)) plus len(data) plus data', (): void => {
        let rlpData = new RLPData(stringToBytes('zoo255zoo255zzzzzzzzzzzzssssssssssssssssssssssssssssssssssssssssssssss'), null);
        let encodedLongString = RLP.encode(rlpData);
        // assert.equal(RLP.getLength(encodedLongString), 2)
        expect<u8>(encodedLongString[0]).toBe(184);
        expect<u8>(encodedLongString[1]).toBe(70);
        expect<u8>(encodedLongString[2]).toBe(122);
        expect<u8>(encodedLongString[3]).toBe(111);
        expect<u8>(encodedLongString[12]).toBe(53);
    });
});

describe('RLP encoding (list):', function() {
    it('length of list 0-55 should return (0xc0+len(data)) plus data', (): void => {
        let dog = new RLPData(stringToBytes('dog'), null);
        let god = new RLPData(stringToBytes('god'), null);
        let cat = new RLPData(stringToBytes('cat'), null);
        let rlpData = new RLPData(null, [dog, god, cat]);
        let encodedArrayOfStrings = RLP.encode(rlpData);
        expect<usize>(encodedArrayOfStrings.length).toBe(13);
        expect<u8>(encodedArrayOfStrings[0]).toBe(204);
        expect<u8>(encodedArrayOfStrings[1]).toBe(131);
        expect<u8>(encodedArrayOfStrings[11]).toBe(97);
        expect<u8>(encodedArrayOfStrings[12]).toBe(116);
    });

    it('combined length of list >55 should return 0xf7+len(len(data)) plus len(data) plus data', (): void => {
        let dog = new RLPData(stringToBytes('dog'), null);
        let longString = new RLPData(stringToBytes('this is a string that is very very very very very long'), null);
        let rlpData = new RLPData(null, [dog, longString]);
        let encodedArrayOfStrings = RLP.encode(rlpData);
        expect<usize>(encodedArrayOfStrings.length).toBe(61);
        expect<u8>(encodedArrayOfStrings[0]).toBe(248);
        expect<u8>(encodedArrayOfStrings[1]).toBe(59);
        expect<u8>(encodedArrayOfStrings[2]).toBe(131);
        expect<u8>(encodedArrayOfStrings[6]).toBe(182);
    });
});

describe('RLP decoding:', function() {
    it('first byte < 0x7f, return byte itself', (): void => {
        let decoded = RLP.decode(arrayToUint8Array([97]));
        expect<usize>(decoded.buffer.length).toBe(1);
        expect<RLPData[]>(decoded.children).toBeNull();
        expect<string>(bytesToString(decoded.buffer)).toBe('a');
    });

    it('first byte < 0xb7, data is everything except first byte', (): void => {
        let decoded = RLP.decode(arrayToUint8Array([131, 100, 111, 103]));
        expect<usize>(decoded.buffer.length).toBe(3);
        expect<RLPData[]>(decoded.children).toBeNull();
        expect<string>(bytesToString(decoded.buffer)).toBe('dog');
    });

    it('strings over 55 bytes long', (): void => {
        let testString = 'This function takes in a data, convert it to buffer if not, and a length for recursion';
        let encoded = RLP.encode(new RLPData(stringToBytes(testString), null));
        let decoded = RLP.decode(encoded);
        expect<RLPData[]>(decoded.children).toBeNull();
        expect<string>(bytesToString(decoded.buffer)).toBe(testString);
    });

    it('list of items', (): void => {
        let decodedBufferArray = RLP.decode(arrayToUint8Array([204, 131, 100, 111, 103, 131, 103, 111, 100, 131, 99, 97, 116]));
        expect<Uint8Array>(decodedBufferArray.buffer).toBeNull();
        expect<usize>(decodedBufferArray.children.length).toBe(3);
        // as-pect does not support deep equal due to lack of metadata support from assemblyscript.
        expect<string>(bytesToString(decodedBufferArray.children[0].buffer)).toBe('dog');
        expect<string>(bytesToString(decodedBufferArray.children[1].buffer)).toBe('god');
        expect<string>(bytesToString(decodedBufferArray.children[2].buffer)).toBe('cat');
    });

    it('list over 55 bytes long', (): void => {
        let testString: string[] = ['This', 'function', 'takes', 'in', 'a', 'data', 'convert', 'it', 'to', 'buffer', 'if', 'not', 'and', 'a', 'length', 'for', 'recursion', 'a1', 'a2', 'a3', 'ia4', 'a5', 'a6', 'a7', 'a8', 'ba9'];
        let rlpData = new RLPData(null, testString.map<RLPData>(s => new RLPData(stringToBytes(s), null)));
        let encoded = RLP.encode(rlpData);
        expect<usize>(encoded.length).toBe(114);
        let decoded = RLP.decode(encoded);
        expect<Uint8Array>(decoded.buffer).toBeNull();
        expect<usize>(decoded.children.length).toBe(testString.length);
        for (let i = 0; i < testString.length; i++) {
            expect<string>(bytesToString(decoded.children[i].buffer)).toBe(testString[i]);
        }
    });
});

describe('null values', function() {
    it('encode a null array', function() {
        let encoded = RLP.encode(new RLPData(new Uint8Array(0), null));
        expect<u8>(encoded[0]).toBe(0x80);
        expect<usize>(encoded.length).toBe(1);
    });

    it('should decode a null value', function() {
        let decoded = RLP.decode(arrayToUint8Array([0x80]));
        expect<usize>(decoded.buffer.length).toBe(0);
        expect<RLPData[]>(decoded.children).toBeNull();
    });
});

describe('zero values', function() {
    it('encode a zero', function() {
        let rlpData = new RLPData(arrayToUint8Array([0]), null);
        let encoded = RLP.encode(rlpData);
        expect<u8>(encoded[0]).toBe(0);
        expect<usize>(encoded.length).toBe(1);
    });

    it('decode a zero', function() {
        let decoded = RLP.decode(arrayToUint8Array([0]));
        expect<u8>(decoded.buffer[0]).toBe(0);
        expect<usize>(decoded.buffer.length).toBe(1);
        expect<RLPData[]>(decoded.children).toBeNull();
    })
});
