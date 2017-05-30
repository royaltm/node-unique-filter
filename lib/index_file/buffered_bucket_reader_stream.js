"use strict";

const assert = require('assert')
    , { read } = require('fs');

const debug = require('debug')('lib:indexfile:reader');

const Readable = require('stream').Readable;

const BufferedBucketWriter = require('./buffered_bucket_writer');

const { pad
      , MAX_VALUE_LENGTH
      , BUFFER_TOP32
      , BUFFER_TOP16
      , BYTES_PER_ELEMENT32
      , BYTES_PER_ELEMENT16
      , LENGTHOFFSET
      , BODYOFFSET
      , BUFFER_SIZE
      } = BufferedBucketWriter;

class BufferedBucketReaderStream extends Readable {
  constructor(bufferedBucketWriter, options) {
    assert(bufferedBucketWriter instanceof BufferedBucketWriter);
    super(Object.assign({}, options, {objectMode: true}));
    this.bufferedBucketWriter = bufferedBucketWriter;
    this.index = 0;
    this.position = BYTES_PER_ELEMENT32;
    this.bufferStart = this.position;
    this.bufferDataLength = 0;

    /* allocate read buffer once */
    const readBuffer8 = this.readBuffer = Buffer.allocUnsafe(BUFFER_SIZE);
    this.readPtr32 = new Uint32Array(readBuffer8.buffer, readBuffer8.byteOffset, BUFFER_TOP32);
    this.readPtr16 = new Uint16Array(readBuffer8.buffer, readBuffer8.byteOffset, BUFFER_TOP16);

    this._isReading = false;
  }

  isFinished() {
    return !this._isReading && this._readableState.ended;
  }

  wait() {
    if (this.isFinished()) return Promise.resolve(this.index);
    return new Promise((resolve, reject) => {
      this.on('error', reject).on('end', () => resolve(this.index));
    });
  }

  _read(size) {
    if (this._isReading) return;
    this._isReading = true;

    var index = this.index
      , position = this.position
      , buffer8 = this.readBuffer
      , ptr16 = this.readPtr16
      , ptr32 = this.readPtr32;

    const bufferedBucketWriter = this.bufferedBucketWriter
        , fd = bufferedBucketWriter.fd;

    const stopReading = () => {
      debug('stop reading: %s, position: %s', index, position);
      this.index = index;
      this.position = position;
      this._isReading = false;
    };

    const extractEntries = (offset, bufferLength) => {
      var start, length;

      debug('extracting: %s offset: %s, bufferLength: %s, position: %s', index, offset, bufferLength, position);
      while (offset + BODYOFFSET <= bufferLength) {
        length = ptr16[(offset + LENGTHOFFSET) / BYTES_PER_ELEMENT16];
        start = offset + BODYOFFSET;
        if (start + length > bufferLength) break;
        let needmore = this.push({
          value: buffer8.toString('utf8', start, start + length),
          hash: ptr32[(offset / BYTES_PER_ELEMENT32) + 1],
          index: index++
        });
        length = pad(BODYOFFSET + length);
        position += length;
        if (!needmore) {
          return stopReading();
        }
        offset += length;
      }
      if (offset < bufferLength) buffer8.copy(buffer8, 0, offset);
      startReading(bufferLength - offset);
    };

    const startReading = (offset) => {
      var length = BUFFER_SIZE;

      if (position + length > bufferedBucketWriter.filesize) {
        length = bufferedBucketWriter.filesize - position;
        if (length <= 0) {
          assert(offset === 0, 'offset !== 0');
          if (position >= bufferedBucketWriter.size()) {
            debug('streaming ends');
            stopReading();
            this.push(null);
          }
          else {
            debug('redirecting extractor to the write buffer');
            buffer8 = bufferedBucketWriter.writeBuffer;
            ptr16 = bufferedBucketWriter.writePtr16;
            ptr32 = bufferedBucketWriter.writePtr32;
            extractEntries(position - bufferedBucketWriter.filesize, bufferedBucketWriter.bufferOffset);
          }

          return;
        }
      }

      debug('reading from file: position: %s, length: %s, offset: %s', position, length, offset);
      assert(length > offset, 'length <= offset');

      read(fd, this.readBuffer, offset, length - offset, position + offset, (err, bytesRead) => {
        if (err) return this.emit('error', err);
        if (bytesRead !== length - offset) return this.emit('error', new Error("error reading file"));
        this.bufferStart = position;
        this.bufferDataLength = length;
        extractEntries(0, length);
      });
    };

    if (position >= bufferedBucketWriter.filesize) {
      buffer8 = bufferedBucketWriter.writeBuffer;
      ptr16 = bufferedBucketWriter.writePtr16;
      ptr32 = bufferedBucketWriter.writePtr32;
      debug('extract from write buffer');
      setImmediate(() => extractEntries(position - bufferedBucketWriter.filesize, bufferedBucketWriter.bufferOffset));
    }
    else {
      buffer8 = this.readBuffer;
      ptr16 = this.readPtr16;
      ptr32 = this.readPtr32;
      debug('extract from reader buffer');
      setImmediate(() => extractEntries(position - this.bufferStart, this.bufferDataLength));
    }
  }
}

module.exports = exports = BufferedBucketReaderStream;
