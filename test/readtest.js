const assert = require('assert');
const UniqueFilter = require('..');

const { murmurHash32 } = require('murmurhash-native');

UniqueFilter.setDefaultOptions({hash: murmurHash32});

const delay = (t) => new Promise((resolve, reject) => setTimeout(resolve, t));

const iterations = (process.argv[2]|0) || 100000;
const probability = +process.argv[3] || 0.1;

const options = UniqueFilter.getOptimalOptions(iterations, probability);

console.log(options);

new UniqueFilter('foobar.tmp', options).ready().then(test).catch(err => console.error(err));

async function test(uf) {
  console.log('index: %s: %s bytes', uf.index.index.length, uf.index.index.length * uf.index.index.constructor.BYTES_PER_ELEMENT);
  console.log('buckets: %s: %s bytes', uf.bloom.buckets.length, uf.bloom.buckets.length * uf.bloom.buckets.constructor.BYTES_PER_ELEMENT);
  console.log('hashes: %s', uf.bloom._locations.length);

  var bbw = await uf.index.ready

  var start = Date.now();
  for(let i = 0; i < iterations; ++i) {
    await uf.add('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ' + i.toString(16));
  }
  var stop = Date.now();
  console.log("time: %s ms", (stop - start) / iterations);
  console.log("items: %s uf: %s", iterations, uf.size);

  console.log("file size: %s", bbw.filesize);
  console.log("total size: %s", bbw.size());

  var reader = await uf.createEntriesStream();

  var index = 0;

  reader.on('data', obj => {
    // console.log('%j', obj);
    assert.strictEqual(obj.index, index++);
    assert.strictEqual(obj.value, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ' + obj.index.toString(16));
  });
  await delay(10);
  reader.pause();
  console.log('paused')
  await delay(2000);
  console.log('more...')
  reader.resume();
  console.log('resumed')

  var setpromise = uf.toSet(); // concurrent reader

  for(let i = iterations; i < 2*iterations; i += 1) {
    await uf.add('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ' + i.toString(16));
  }

  console.log('finished adding, isFinished: %s _isReading: %s, pos: %s, size: %s',
    reader.isFinished(), reader._isReading, reader.position, bbw.size())

  var results = await reader.wait();
  // var results = await Promise.all([reader.wait(), uf.toSet()]);
  console.log("read entries: %j", results);
  results = await setpromise;
  console.log("toSet.size: %j", results.size);
  console.log("total entries: %s", uf.size);
  results = await uf.toSet();
  console.log("toSet.size: %j", results.size);
  await uf.close();
}
