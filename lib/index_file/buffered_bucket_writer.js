"use strict";

// const debug = require('debug')('lib:indexfile:writer');

const { read, write } = require('../fs_async');

const LRUSet = require('../lru_set');

const BYTES_PER_ELEMENT32 = Uint32Array.BYTES_PER_ELEMENT
    , BYTES_PER_ELEMENT16 = Uint16Array.BYTES_PER_ELEMENT
    , LENGTHOFFSET = BYTES_PER_ELEMENT32 + BYTES_PER_ELEMENT32
    , BODYOFFSET = LENGTHOFFSET + BYTES_PER_ELEMENT16
    , MASK32 = BYTES_PER_ELEMENT32 - 1;

const BUFFER_TOP32 = 0x4000
    , BUFFER_SIZE  = BUFFER_TOP32 * BYTES_PER_ELEMENT32
    , BUFFER_TOP16 = BUFFER_SIZE / BYTES_PER_ELEMENT16;

const MAX_VALUE_LENGTH = Math.max(0xFFFF, BUFFER_SIZE - BODYOFFSET);

const byteLength = Buffer.byteLength;

// var sharedSearchBuffer = Buffer.allocUnsafe(8192);

// function valueEqualsBuffer(value, valueSize, buffer, start, length) {
//   var bufferLength;
//   if (valueSize !== length) return false;
//   if ('string' === typeof value) {
//     bufferLength = sharedSearchBuffer.length;
//     if (length > bufferLength) {
//       bufferLength = pad(length + 1024);
//       sharedSearchBuffer = Buffer.allocUnsafe(bufferLength);
//     }
//     sharedSearchBuffer.write(value, 0, length, 'utf8');
//     return sharedSearchBuffer.compare(buffer, start, start + length, 0, length) === 0;
//   }
//   else return value.compare(buffer, start, start + length) === 0;
// }

function pad(bytes) {
  return bytes + (-bytes & MASK32);
}

class BufferedBucketWriter {
  constructor(fd, lruMaxLength) {
    if (lruMaxLength) {
      this.lruSet = new LRUSet(lruMaxLength);
    }
    this.fd = fd;
    this.filesize = BYTES_PER_ELEMENT32;
    this.bufferOffset = 0;

    /* allocate write buffer once */
    const writeBuffer8 = this.writeBuffer = Buffer.allocUnsafe(BUFFER_SIZE);
    this.writePtr32 = new Uint32Array(writeBuffer8.buffer, writeBuffer8.byteOffset, BUFFER_TOP32);
    this.writePtr16 = new Uint16Array(writeBuffer8.buffer, writeBuffer8.byteOffset, BUFFER_TOP16);

    /* allocate extendable read buffer */
    this._allocReadBuffer(64);
  }

  size() {
    return this.filesize + this.bufferOffset;
  }

  addRecord(index, hash, value) {
    const ptr32 = this.writePtr32
        , ptr16 = this.writePtr16
        , buffer8 = this.writeBuffer
        , filesize = this.filesize
        , length = byteLength(value)

    if (length > MAX_VALUE_LENGTH) return Promise.reject(new Error(`value must be less than ${MAX_VALUE_LENGTH} bytes`));

    var promise
      , bufferOffset = this.bufferOffset;

    const result = (filesize + bufferOffset) / BYTES_PER_ELEMENT32;

    if (BODYOFFSET + length + bufferOffset > BUFFER_SIZE) {
      promise = write(this.fd, buffer8, 0, bufferOffset, filesize)
                .then(() => {
                  this.filesize += bufferOffset;
                  bufferOffset = this.bufferOffset = 0;
                });
    }
    else promise =  Promise.resolve();

    return promise.then(() => {
      var bufferIndex32 = bufferOffset / BYTES_PER_ELEMENT32;
      ptr32[bufferIndex32] = index;
      ptr32[bufferIndex32 + 1] = hash;
      ptr16[(bufferOffset + LENGTHOFFSET) / BYTES_PER_ELEMENT16] = buffer8.write(value, bufferOffset + BODYOFFSET, length);
      this.bufferOffset = bufferOffset + pad(BODYOFFSET + length);

      return result;
    });
  }

  search(index, hash, value) {
    if (index === 0) return Promise.resolve(false);
    const lruSet = this.lruSet;
    if (lruSet && lruSet.has(value)) return Promise.resolve(true);

    return this._search(index, hash, value, byteLength(value));
  }

  _search(index, hash, value, valueSize) {
    if (index === 0 || valueSize > MAX_VALUE_LENGTH) return Promise.resolve(false);

    var position = index * BYTES_PER_ELEMENT32
      , offset = position - this.filesize;

    if (offset < 0) return this._compareFileRecord(position, hash, value, valueSize, -offset);

    const ptr32 = this.writePtr32
        , offset32 = offset / BYTES_PER_ELEMENT32;

    if (ptr32[offset32 + 1] === hash) {
      const start = offset + BODYOFFSET
          , length = this.writePtr16[(offset + LENGTHOFFSET) / BYTES_PER_ELEMENT16]
          , found = this.writeBuffer.toString('utf8', start, start + length);
      // if (valueEqualsBuffer(value, valueSize, this.writeBuffer, start, length)) {
      //   return Promise.resolve(true);
      // }
      if (found === value) return Promise.resolve(true);
    }

    return this._search(ptr32[offset32], hash, value, valueSize);
  }

  _compareFileRecord(position, hash, value, valueSize, maxLength) {
    var buffer8 = this.readBuffer;

    var readLength = BODYOFFSET + valueSize;

    if (maxLength < readLength) readLength = BODYOFFSET;

    if (buffer8.length < readLength) buffer8 = this._allocReadBuffer(readLength);

    return read(this.fd, buffer8, 0, readLength, position)
    .then(() => {
      const ptr32 = this.readPtr32
          , nextIndex = ptr32[0];

      if (ptr32[1] === hash) {
        const length = this.lengthPtr16[0]
            , found = buffer8.toString('utf8', BODYOFFSET, BODYOFFSET + length);
        // if (valueEqualsBuffer(value, valueSize, buffer8, BODYOFFSET, length)) {
        if (found === value) {
          const lruSet = this.lruSet;
          if (lruSet) lruSet.add(value);
          return true;
        }
      }

      return this._search(nextIndex, hash, value, valueSize);
    });
  }

  _allocReadBuffer(size) {
    size = pad(size);
    const buffer8 = this.readBuffer = Buffer.allocUnsafe(size);
    this.readPtr32 = new Uint32Array(buffer8.buffer, buffer8.byteOffset, size / BYTES_PER_ELEMENT32);
    this.lengthPtr16 = new Uint16Array(buffer8.buffer, buffer8.byteOffset + LENGTHOFFSET, 1);
    return buffer8;
  }

  // readEntry(index) {
  //   const position = index * BYTES_PER_ELEMENT32;

  //   if (position >= this.size()) return Promise.resolve({entry: null, index});

  //   const offset = position - this.filesize;

  //   if (offset < 0) return this._readFileEntry(position);

  //   const start = offset + BODYOFFSET
  //       , length = this.writePtr16[(offset + LENGTHOFFSET) / BYTES_PER_ELEMENT16]
  //       , entry = this.writeBuffer.toString('utf8', start, start + length)
  //       , next = pad(offset + BODYOFFSET + length) / BYTES_PER_ELEMENT32;

  //   return Pormise.resolve({entry, next});
  // }

  // _readFileEntry(position) {
  //   var buffer8 = this.readBuffer;

  //   const fd = this.fd;

  //   return read(fd, buffer8, 0, BODYOFFSET, position)
  //   .then(() => {
  //     const length = this.lengthPtr16[0];
  //     if (buffer8.length < length) buffer8 = this._allocReadBuffer(length);

  //     return read(fd, buffer8, 0, length, position + BODYOFFSET)
  //     .then(() => {
  //       var entry = buffer8.toString('utf8', 0, length)
  //         , next = pad(position + BODYOFFSET + length) / BYTES_PER_ELEMENT32;
  //       return {entry, next};
  //     });
  //   });
  // }

}

BufferedBucketWriter.pad                 = pad;
BufferedBucketWriter.MAX_VALUE_LENGTH    = MAX_VALUE_LENGTH;
BufferedBucketWriter.BYTES_PER_ELEMENT32 = BYTES_PER_ELEMENT32;
BufferedBucketWriter.BYTES_PER_ELEMENT16 = BYTES_PER_ELEMENT16;
BufferedBucketWriter.LENGTHOFFSET        = LENGTHOFFSET;
BufferedBucketWriter.BODYOFFSET          = BODYOFFSET;
BufferedBucketWriter.BUFFER_SIZE         = BUFFER_SIZE;
BufferedBucketWriter.BUFFER_TOP32        = BUFFER_TOP32;
BufferedBucketWriter.BUFFER_TOP16        = BUFFER_TOP16;

module.exports = exports = BufferedBucketWriter;

/*
write buffer:
- offset
- hash
- size
- data
- padding

buffer = new BufferedBucketWriter(fd)
buffer.addRecord(index, hash, value) -> newIndex;
buffer.search(index, hash, value) -> true / false;
buffer._compareFileRecord(position, hash, value) -> true / false;
*/
