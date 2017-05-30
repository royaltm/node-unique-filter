const path = require('path')
    , fs = require('fs')
    , crypto = require('crypto');

const goby = require('goby').init();

const GOBY_ARGS = ['adj', 'pre', 'suf'];

const { test } = require('tap');

const { murmurHash32 } = require('murmurhash-native');

const UniqueFilter = require('../lib/unique_filter');

UniqueFilter.setDefaultOptions({hash: murmurHash32});

function uniqueName() {
  var name = 'testuf1.' +
    process.pid + '.' +
    crypto.randomBytes(6).toString('hex') + '.' +
    Date.now().toString(16) + '.tmp';
  return path.join(__dirname, '..', 'tmp', name);
}

test('UniqueFilter', suite => {

  suite.test('maxByteUsage', t => {
    t.strictEquals(UniqueFilter.maxByteUsage({}), 196628);
    t.strictEquals(UniqueFilter.maxByteUsage({indexbits: 24}), 67305488);
    t.strictEquals(UniqueFilter.maxByteUsage({indexbits: 8, bloombits: 65536}), 140304);
    t.strictEquals(UniqueFilter.maxByteUsage({indexbits: 12, bloombits: 16384*32, bloomhashes: 20}), 213034);
    t.end();
  });

  suite.test('getOptimalOptions', t => {
    t.deepEquals(UniqueFilter.getOptimalOptions(), {
      indexbits: 18,
      bloombits: 4792576,
      bloomhashes: 3
    });
    t.deepEquals(UniqueFilter.getOptimalOptions(1000, 0.1), {
      indexbits: 8,
      bloombits: 4832,
      bloomhashes: 3
    });
    t.deepEquals(UniqueFilter.getOptimalOptions(10000, 0.05), {
      indexbits: 11,
      bloombits: 62368,
      bloomhashes: 4
    });
    t.deepEquals(UniqueFilter.getOptimalOptions(100000, 0.02), {
      indexbits: 15,
      bloombits: 814272,
      bloomhashes: 6
    });
    t.deepEquals(UniqueFilter.getOptimalOptions(1000000, 0.02), {
      indexbits: 18,
      bloombits: 8142400,
      bloomhashes: 6
    });
    t.deepEquals(UniqueFilter.getOptimalOptions(1000000, 0.01), {
      indexbits: 18,
      bloombits: 9585088,
      bloomhashes: 7
    });
    t.deepEquals(UniqueFilter.getOptimalOptions(10000000, 0.01), {
      indexbits: 21,
      bloombits: 95850624,
      bloomhashes: 7
    });
    t.end();
  });

  suite.test('ready', t => {
    t.plan(2);
    return new UniqueFilter(__filename)
    .ready().catch(err => {
      t.type(err, Error)
      t.strictEquals(err.code, 'EEXIST');
    });
  }).catch(suite.threw);

  suite.test('should retain only unique values', t => {
    var uf;
    t.plan(20);
    return new UniqueFilter(uniqueName())
    .ready().then(res => {
      t.type(res, UniqueFilter);
      uf = res;
      t.type(uf.add('ala'), Promise);
      t.type(uf.add('ala'), Promise);
      t.type(uf.add('ma'), Promise);
      t.type(uf.add('ma'), Promise);
      t.type(uf.add('kota'), Promise);
      t.type(uf.add('kota'), Promise);
      t.type(uf.add('ma'), Promise);
      t.type(uf.add('ala'), Promise);
      return Promise.all([
        uf.has('ala'),
        uf.has('ALA'),
        uf.has('kota'),
        uf.has('ma'),
        uf.has('KOTA'),
        uf.has('MA')
      ]);
    })
    .then(results => {
      t.strictEquals(uf.size, 3);
      t.strictSame(results, [true, false, true, true, false, false]);

      return Promise.all([
        uf.add('ala'),
        uf.add('ALA'),
        uf.add('kota'),
        uf.add('ma'),
        uf.add('MA'),
        uf.add('KOTA')
      ]);
    })
    .then(results => {
      t.strictEquals(uf.size, 6);
      t.strictSame(results, [false, true, false, false, true, true]);
    })
    .then(results => {
      return Promise.all([
        uf.has('ala'),
        uf.has('ALA'),
        uf.has('kota'),
        uf.has('ma'),
        uf.has('KOTA'),
        uf.has('MA')
      ]);
    })
    .then(results => {
      t.strictEquals(uf.size, 6);
      t.strictSame(results, [true, true, true, true, true, true]);
      return uf.toSet();
    })
    .then(result => {
      t.type(result, Set);
      t.strictEquals(result.size, 6);
      t.strictSame(Array.from(result), ['ala', 'ma', 'kota', 'ALA', 'MA', 'KOTA']);
      return uf.close();
    })
    .then(result => {
      t.strictEquals(result, undefined);
      t.strictEquals(fs.existsSync(uf.filename), false);
    });
  }).catch(suite.threw);

  suite.test('should retain only unique values with many random names', t => {
    var uf, total = 200000, unique = 0, verify = new Set();
    t.plan(8);
    return new UniqueFilter(uniqueName(), UniqueFilter.getOptimalOptions(total, 0.01))
    .ready().then(res => {
      t.type(res, UniqueFilter);
      uf = res;

      const generate = () => {
        var text = goby.generate(GOBY_ARGS);
        return uf.add(text)
        .then(res => {
          if (res) {
            ++unique;
            verify.add(text);
          }
          if (--total > 0) return generate();
        });
      };

      return generate();
    })
    .then(() => {
      t.strictEquals(uf.size, unique);
      t.strictEquals(verify.size, unique);
      return uf.toSet();
    })
    .then(result => {
      t.type(result, Set);
      t.strictEquals(result.size, unique);
      t.strictSame(Array.from(result), Array.from(verify));
      return uf.close();
    })
    .then(result => {
      t.strictEquals(result, undefined);
      t.strictEquals(fs.existsSync(uf.filename), false);
    });
  }).catch(suite.threw);

  suite.end();
});
