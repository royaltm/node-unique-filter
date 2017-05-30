/*
 * LIB fs_async
 *
 * Author: Rafal Michalski (c) 2017
 */
"use strict";

/*
  Promisify only what we need in a way we need.
*/

const {
  close,
  open,
  read,
  unlink,
  write
} = require('fs');

exports.open = function(path, flags, mode) {
  return new Promise((resolve, reject) => {
    open(path, flags, mode, (err, fd) => {
      if (err) return reject(err);
      resolve(fd);
    });
  });
};

exports.close = function(fd) {
  return new Promise((resolve, reject) => {
    close(fd, err => {
      if (err) return reject(err);
      resolve();
    });
  });
};

exports.unlink = function(path) {
  return new Promise((resolve, reject) => {
    unlink(path, err => {
      if (err) return reject(err);
      resolve();
    });
  });
};

exports.read = function(fd, buffer, offset, length, position) {
  return new Promise((resolve, reject) => {
    read(fd, buffer, offset, length, position, (err, bytesRead) => {
      if (err) return reject(err);
      if (bytesRead !== length) return reject(new Error("error reading file"));
      resolve(buffer);
    });
  });  
};

exports.write = function(fd, buffer, offset, length, position) {
  return new Promise((resolve, reject) => {
    write(fd, buffer, offset, length, position, (err, written) => {
      if (err) return reject(err);
      if (written !== length) return reject(new Error("error writing file"));
      resolve(buffer);
    });
  });
};
