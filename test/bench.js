const assert = require('assert');
const crypto = require('crypto');
const UniqueFilter = require('..');

const { murmurHash32 } = require('murmurhash-native');

UniqueFilter.setDefaultOptions({hash: murmurHash32});

const iterations = (process.argv[2]|0) || 1000000;
const probability = +process.argv[3] || 0.01;

const options = UniqueFilter.getOptimalOptions(iterations, probability);

console.log(options);

new UniqueFilter('foobar.tmp', options).ready().then(test).catch(err => console.error(err));

async function test(uf) {
  console.log('index: %s: %s bytes', uf.index.index.length, uf.index.index.length * uf.index.index.constructor.BYTES_PER_ELEMENT);
  console.log('buckets: %s: %s bytes', uf.bloom.buckets.length, uf.bloom.buckets.length * uf.bloom.buckets.constructor.BYTES_PER_ELEMENT);
  console.log('hashes: %s', uf.bloom._locations.length);
  var array = [];
  for(var i = iterations; i > 0; --i) {
    array.push(crypto.randomBytes(Math.random()*100|0).toString('hex'));
  }
  var uset = new Set(array);
  var start = Date.now();
  for(let item of array) {
    await uf.add(item);
  }
  var stop = Date.now();
  console.log("time: %s ms", (stop - start) / array.length);
  console.log("items: %s unique: %s uf: %s", array.length, uset.size, uf.size);

  var start = Date.now();
  for(let item of array) {
    assert(await uf.has(item));
  }
  var stop = Date.now();
  console.log("time: %s ms", (stop - start) / array.length);

  var count = 0;
  var array = [];
  for(var i = iterations; i > 0; --i) {
    array.push(crypto.randomBytes(Math.random()*100|0).toString('hex'));
  }
  var start = Date.now();
  for(item of array) {
    if (await uf.has(item)) count++;
  }
  var stop = Date.now();
  console.log("time: %s ms", (stop - start) / array.length);
  console.log("hits: %s", count);
}
