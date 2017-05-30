"use strict";

const debug = require('debug')('lib:indexfile');

const { close, open, unlink } = require('../fs_async');

const BufferedBucketWriter = require('./buffered_bucket_writer');
const BufferedBucketReaderStream = require('./buffered_bucket_reader_stream');

/*

index:
  0000 offset / 4 (4 bytes)
  ...
  FFFF offset / 4 (4 bytes)

bucket:
  4 bytes previous offset / 4
  4 bytes hash
  2 bytes size
  utf8 string 
  pad bytes (4)

checking:
- make hash
- read index
- read bucket
- compare
- read prev.

adding:
- write 4 bytes prev offset
- write 4 bytes hash
- write 2 bytes size + string + padding
- store new index offset

*/

const defaultOptions = {
  deleteFile: true,
  indexbits: 16
};

class IndexFile {
  constructor(filepath, options = {}) {
    options = Object.assign({}, defaultOptions, options);

    if (options.hash !== undefined) this.hash = options.hash;

    if ('function' !== typeof this.hash) {
      throw new Error('pass hash function to options or override hash prototype method');
    }

    const indexbits = Math.max(8, Math.min(options.indexbits|0, 24));
    const indexsize = 1 << indexbits;
    this.index = new Uint32Array(indexsize);
    this.indexmask = (1 << indexbits) - 1;

    debug('creating index file: %s', filepath);

    this.ready = open(filepath, 'wx+', 0o600)
    .then(fd => {
      if (options.deleteFile) {
        debug('deleting created index file: %s', filepath);
        return unlink(filepath).then(() => fd);
      }
      else return fd;
    })
    .then(fd => new BufferedBucketWriter(fd));
  }

  close() {
    return this.ready = this.ready
    .then(({fd}) => close(fd))
    .then(() => {
      debug('index closed');
    });
  }

  exists(value) {
    const hash = this.hash(value)
        , index = hash & this.indexmask;

    return this.ready.then(bbw => bbw.search(this.index[index], hash, value));
  }

  addIfNotExists(value) {
    return this.ready
    .then(bbw => {
      const hash = this.hash(value)
          , index = hash & this.indexmask
          , offset32 = this.index[index];

      return bbw.search(offset32, hash, value)
      .then(res => {
        if (res) return false;

        return bbw.addRecord(offset32, hash, value)
        .then(offset32 => {
          this.index[index] = offset32;
          return true;
        });
      });
    });
  }

  add(value) {
    return this.ready
    .then(bbw => {
      const hash = this.hash(value)
          , index = hash & this.indexmask

      return bbw.addRecord(this.index[index], hash, value)
      .then(offset32 => {
        this.index[index] = offset32;
      });
    });
  }

  createEntriesStream(options) {
    return this.ready.then(bbw => new BufferedBucketReaderStream(bbw, options));
  }
}

IndexFile.BufferedBucketWriter = BufferedBucketWriter;
IndexFile.BufferedBucketReaderStream = BufferedBucketReaderStream;

module.exports = exports = IndexFile;
