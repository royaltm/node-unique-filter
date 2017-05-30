UniqueFilter
============

The purpose of UniqueFilter is to calculate the exact uniqueness of the large data sets using predictable maximum amount of memory.

Other then that UniqueFilter may be used in a similar way as a `Set` except it doesn't allow to delete its entries and is `Promise` based.

It utilizes [bloomfilter](https://www.npmjs.com/package/bloomfilter) so it performes best if the added entries are unique.

UniqueFilter keeps the hash index and bloom filter buckets in memory and both sizes can be adjusted.

The actual unique set values are written to the temporary file.


Install
-------

```
npm i royal/unique-filter --save
```


Usage
-----

```
const { murmurHash32 } = require('murmurhash-native');

const UniqueFilter = require('unique-filter');

var ufilter = new UniqueFilter('/tmp/foo.tmp', {
  hash: murmurHash32, // the hash function has signature: hash(string) -> UInt32
  bloombits: 524288,  // how many bloom filter bits to allocate in the bloom filter (should be a multiple of 32)
  bloomhashes: 7,     // how many bloom hashes to generate bits
  indexbits: 16,      // the size of the hash index 8 - 24
  deleteFile: true    // if the file should be deleted upon creation (is temporary)
})

// check if file has been created
ufilter.ready().then(ufilter => console.log('ready: %s', ufilter.filename))

// add item
ufilter.add('foo').then(added => console.log(added ? 'added' : 'already exists'))

// check if item exists
ufilter.has('foo').then(exists => console.log(exists ? 'exists' : 'not found'))

// check current size of the set
console.log(ufilter.size)

// create item stream reader
uf.createEntriesStream().then(reader => {
  reader.on('data', (item) => {
    console.log("#%s hash: %s value: %j", item.index, item.hash, item.value)
  })
  return reader.wait()
}).then(n => console.log('read: %s items', n))

// create Set using item stream reader
uf.toSet().then(set => console.log(set))

// close file and free resources
ufilter.close().then(() => console.log('closed'))
```

Configuration
-------------

Memory usage calculations:

```
the size of bytes allocated = buffer sizes + 4 * 2^indexbits + bloombits / 8 + 2 * bloomhashes
buffer sizes = write buffer size + read buffer size
write buffer size = BufferedBucketWriter.BUFFER_SIZE (65536)
read buffer size = up to BufferedBucketWriter.MAX_VALUE_LENGTH (65526)
```

To get optimal options based on predicted size of the set and bloom filter false-positive probability use:

```
var iterations = 10000000
var probability = 0.01

var options = UniqueFilter.getOptimalOptions(iterations, probability)

console.log('will used max: %s bytes', UniqueFilter.maxByteUsage(options))

var ufilter = new UniqueFilter('/tmp/foo', options)
```

It is safe to read entries and add new items to UniqueFilter at the same time.

Providing default hash function:

```
UniqueFilter.setDefaultOptions({hash: murmurHash32});
```
