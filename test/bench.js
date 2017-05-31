const assert = require('assert');
const crypto = require('crypto');
const UniqueFilter = require('..');

const goby = require('goby').init();
const GOBY_ARGS = ['pre', 'suf'];

const { murmurHash32 } = require('murmurhash-native');

UniqueFilter.setDefaultOptions({hash: murmurHash32});

const iterations = (process.argv[2]|0) || 1000000;
const probability = +process.argv[3] || 0.01;
const maxitemsize = (process.argv[4]>>>0);
const lru = (process.argv[5]>>>0) || 0;

const genItem = maxitemsize ? () => crypto.randomBytes(Math.random()*maxitemsize|0).toString('hex')
                            : () => goby.generate(GOBY_ARGS);

const options = UniqueFilter.getOptimalOptions(iterations, probability);
options.lru = lru;

console.log(options);

new UniqueFilter('foobar.tmp', options).ready().then(test).catch(err => console.error(err));

async function test(uf) {
  console.log('max byte usage: %s', UniqueFilter.maxByteUsage(options));
  console.log('byte usage: %s', await uf.byteUsage());
  console.log('index: %s: %s bytes', uf.index.index.length, uf.index.index.length * uf.index.index.constructor.BYTES_PER_ELEMENT);
  console.log('buckets: %s: %s bytes', uf.bloom.buckets.length, uf.bloom.buckets.length * uf.bloom.buckets.constructor.BYTES_PER_ELEMENT);
  console.log('hashes: %s', uf.bloom._locations.length);
  var array = [];
  for(var i = iterations; i > 0; --i) {
    array.push(genItem());
  }
  var uset = new Set(array);
  var start = Date.now();
  for(let item of array) {
    await uf.add(item);
  }
  var stop = Date.now();
  console.log("time: %s ms", (stop - start) / array.length);
  console.log("items: %s unique: %s uf: %s", array.length, uset.size, uf.size);
  console.log('byte usage: %s', await uf.byteUsage());

  var start = Date.now();
  for(let item of array) {
    assert(await uf.has(item));
  }
  var stop = Date.now();
  console.log("time: %s ms", (stop - start) / array.length);
  console.log('byte usage: %s', await uf.byteUsage());

  var count = 0;
  var array = [];
  for(var i = iterations; i > 0; --i) {
    array.push(genItem());
  }
  var start = Date.now();
  for(item of array) {
    if (await uf.has(item)) count++;
  }
  var stop = Date.now();
  console.log("time: %s ms", (stop - start) / array.length);
  console.log("hits: %s", count);
  console.log('byte usage: %s', await uf.byteUsage());
}
