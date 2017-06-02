UniqueFilter
============

The purpose of UniqueFilter is to calculate the exact uniqueness of the large data sets (currently only strings) using predictable maximum amount of memory.

Other then that UniqueFilter may be used in a similar way as a `Set` except it doesn't allow to delete its entries and is asynchronous - `Promise` based.

UniqueFilter utilizes [bloomfilter](https://www.npmjs.com/package/bloomfilter) for preliminary checks and keeps the hash index of stored items in the memory.

The sizes of both bloomfilter buckets and a hash table are configurable.

The unique strings are being written to the temporary file, using standard `fs` utils.
To verify string existence in the set entries are being looked up with the help of the hash table.

Optional LRU cache can be configured that speeds up checks (but eats additional memory) for elements that has been already added to the set.

The UniqueFilter is not persistent - once closed can't be re-opened, however its design does not make it impossible - it just hasn't been implemented (yet?).


Install
-------

```
npm i @royaltm/unique-filter --save
```


Usage
-----

```js
const { murmurHash32 } = require('murmurhash-native');

const UniqueFilter = require('unique-filter');

var ufilter = new UniqueFilter('/tmp/foo.tmp', {
  hash: murmurHash32, // the hash function (required) hash(string) -> UInt32
  /* below are the default values */
  bloombits: 524288,  // how many bloom filter bits to allocate in the bloom filter (should be a multiple of 32)
  bloomhashes: 7,     // how many bloom hashes to generate bits
  indexbits: 16,      // the size of the hash index 8 - 24
  lru: 0              // max length for optional disk read LRU cache (0 = disabled)
  deleteFile: true    // if the file should be deleted upon creation (is temporary)
})

/* wait for the file to be created, fails if file alredy exists */
ufilter.ready().then(ufilter => console.log('ready: %s', ufilter.filename))

/* add item */
ufilter.add('foo').then(added => console.log(added ? 'added' : 'already exists'))

/* check if item exists */
ufilter.has('foo').then(exists => console.log(exists ? 'exists' : 'not found'))

/* check the current size of the set */
console.log(ufilter.size)

/* create item stream reader */
uf.createEntriesStream().then(reader => {
  reader.on('data', (item) => {
    console.log("#%s hash: %s value: %j", item.index, item.hash, item.value)
  })
  return reader.wait()
}).then(n => console.log('read: %s items', n))

/* create Set using item stream reader */
uf.toSet().then(set => console.log(set))

/* close file and free resources */
ufilter.close().then(() => console.log('closed'))
```

Configuration
-------------

Memory usage calculations (excluding heap occupied by JavaScript data structures):

```
the size of bytes allocated = buffer sizes + 4 * 2^indexbits + bloombits / 8 + 2 * bloomhashes + 2 * lru length
buffer sizes = write buffer size + read buffer size
write buffer size = BufferedBucketWriter.BUFFER_SIZE (65536)
read buffer size = up to BufferedBucketWriter.MAX_VALUE_LENGTH (65526)
```

To get optimal options based on predicted size of the set and bloom filter false-positive probability use:

```
var iterations = 10000000
var probability = 0.01

var options = UniqueFilter.getOptimalOptions(iterations, probability)

console.log('will use max: %s bytes', UniqueFilter.maxByteUsage(options))

var ufilter = new UniqueFilter('/tmp/foo', options)
```

It is safe to read entries and add new items to UniqueFilter at the same time.

Providing default hash function:

```
UniqueFilter.setDefaultOptions({hash: murmurHash32, lru: 131072});
```
