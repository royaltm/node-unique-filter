const assert = require('assert');
const crypto = require('crypto');

assert('function' === typeof global.gc, 'run with --expose-gc');

const { murmurHash32 } = require('murmurhash-native');
const UniqueFilter = require('..');

const iterations = (process.argv[2]|0) || 1000000;
const probability = +process.argv[3] || 0.01;
const maxitemsize = (process.argv[4]>>>0) || 100;

UniqueFilter.prototype.hash = murmurHash32;

const options = UniqueFilter.getOptimalOptions(iterations, probability);

options.hash = murmurHash32;

console.log(options);

new UniqueFilter('foobar.tmp', options).ready().then(test).catch(err => console.error(err));

async function test(uf) {
  console.log('byteUseage: %s', UniqueFilter.maxByteUsage(options))
  console.log('index: %s: %s bytes', uf.index.index.length, uf.index.index.length * uf.index.index.constructor.BYTES_PER_ELEMENT);
  console.log('buckets: %s: %s bytes', uf.bloom.buckets.length, uf.bloom.buckets.length * uf.bloom.buckets.constructor.BYTES_PER_ELEMENT);
  console.log('hashes: %s', uf.bloom._locations.length);

  console.log(process.memoryUsage());

  var start = Date.now();
  for(var i = iterations; i > 0; --i) {
    await uf.add(crypto.randomBytes(Math.random()*maxitemsize|0).toString('hex'));
  }
  var stop = Date.now();
  console.log("time: %s ms", (stop - start) / iterations);
  console.log("items: %s uf: %s", iterations, uf.size);
  console.log(process.memoryUsage());

  await uf.close();
  uf = null;

  global.gc();

  var uset = new Set();
  var start = Date.now();
  for(var i = iterations; i > 0; --i) {
    uset.add(crypto.randomBytes(Math.random()*maxitemsize|0).toString('hex'));
  }
  var stop = Date.now();
  console.log("time: %s ms", (stop - start) / iterations);
  console.log("items: %s uset: %s", iterations, uset.size);
  console.log(process.memoryUsage());
}
