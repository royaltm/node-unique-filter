const assert = require('assert');
const crypto = require('crypto');

const iterations = (process.argv[2]|0) || 1000000;
const maxitemsize = (process.argv[3]>>>0) || 100;

const Level = require('level');
const db = Level('./foobar.tmp');

function exit() {
  return new Promise((resolve, reject) => {
    db.close(err => {
      if (err) return reject(err);
      Level.destroy('./foobar.tmp', err => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

const UniqueFilter = require('level-unique-filter');
const uniq = UniqueFilter(db, {generateValue: function() { return ''; }});

function uniqAsync(item) {
  return new Promise((resolve, reject) => {
    uniq.isUnique(item, resolve);
  });
}

test().catch(err => {
  console.error(err);
  console.error(err.stack);
})
.then(exit);

async function test() {
  var array = [];
  for(var i = iterations; i > 0; --i) {
    array.push(crypto.randomBytes(Math.random()*100|0).toString('hex'));
  }
  var uset = new Set(array);
  var start = Date.now();
  var unique = 0;
  for(let item of array) {
    if (await uniqAsync(item)) ++unique;
  }
  var stop = Date.now();
  console.log("time: %s ms", (stop - start) / array.length);
  console.log("items: %s unique: %s uf: %s", array.length, uset.size, unique);

  var start = Date.now();
  for(let item of array) {
    assert(!(await uniqAsync(item)));
  }
  var stop = Date.now();
  console.log("time: %s ms", (stop - start) / array.length);
}
