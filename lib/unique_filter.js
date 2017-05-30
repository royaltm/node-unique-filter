"use strict";

const { BloomFilter } = require('bloomfilter');

const IndexFile = require('./index_file');

const { BufferedBucketWriter: { BUFFER_SIZE, MAX_VALUE_LENGTH } } = IndexFile;

const defaultOptions = {
  bloombits: 32 * 16384,
  bloomhashes: 7
};

class UniqueFilter {
  constructor(filename, options = {}) {
    options = Object.assign({}, defaultOptions, options);
    this.filename = filename;
    this.size = 0;
    this.index = new IndexFile(filename, options);
    this.bloom = new BloomFilter(options.bloombits, options.bloomhashes);
    this._promise = this.index.ready;
  }

  ready() {
    return this._promise.then(() => this);
  }

  close() {
    return this._promise = synchronize(this._promise, () => this.index.close());
  }

  add(value) {
    const bloom = this.bloom;
    if ('string' !== typeof value) value = value.toString();

    return this._promise = synchronize(this._promise, () => {
      if (!bloom.test(value)) {
        return this.index.add(value).then(() => {
          this.size += 1;
          bloom.add(value);
          return true;
        });
      }
      else {
        return this.index.addIfNotExists(value).then(res => {
          if (res) {
            this.size += 1;
            bloom.add(value);
          }
          return res;
        });
      }
    });
  }

  has(value) {
    if ('string' !== typeof value) value = value.toString();

    return this._promise = synchronize(this._promise, () => {
      if (!this.bloom.test(value)) {
        return false;
      }
      else return this.index.exists(value);
    });
  }

  createEntriesStream(options) {
    return this.index.createEntriesStream(options);
  }

  toSet(options) {
    return this.index.createEntriesStream(options).then(reader => new Promise((resolve, reject) => {
      const result = new Set();
      reader.on('error', reject)
      .on('data', obj => result.add(obj.value))
      .on('end', () => resolve(result));
    }));
  }

  static getOptimalOptions(iterations = 1000000, probability = 0.1) {
    probability = Math.max(0, Math.min(1, probability));
    iterations >>>= 0;
    var m = -iterations * Math.log(probability) / Math.LN2 ** 2;
    var k = (m / iterations) * Math.LN2;
    var ibits = Math.round(Math.log2(iterations) - 2);

    return {
      indexbits: Math.max(8, Math.min(ibits, 24)),
      bloombits: 32 * Math.round((m + 31) / 32),
      bloomhashes: Math.round(k)
    };
  }

  static maxByteUsage(options) {
    options = Object.assign({}, defaultOptions, options);
    var indexbits = Math.max(8, Math.min(options.indexbits, 24));
    return BUFFER_SIZE + MAX_VALUE_LENGTH + 
            (4 << indexbits) +
            ((options.bloombits + 31) >>> 3) +
            2 * options.bloomhashes;
  }

  static setDefaultOptions(options) {
    Object.assign(defaultOptions, options);
  }
}


function synchronize(promise, callback) {
  return promise.then(callback, callback);
}

UniqueFilter.IndexFile = IndexFile;

module.exports = exports = UniqueFilter;
