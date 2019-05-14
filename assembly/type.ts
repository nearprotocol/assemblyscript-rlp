/**
 * class that represents data in rlp format. Due to the lack of support for recursive
 * data types, we have to use a class instead.
 */
export class RLPData {
    buffer: Uint8Array;
    children: RLPData[];

    constructor(input: Uint8Array, children: RLPData[]) {
        this.buffer = input;
        this.children = children;
    }
}
