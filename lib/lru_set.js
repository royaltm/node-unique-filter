"use strict";

const ITEM_OVERHEAD_SIZE = 4;

class LRUSet extends Set {
  constructor(maxLength = 1024*1024) {
    super();
    this.maxLength = maxLength;
    this.length = 0;
  }

  clear() {
    super.clear();
    this.length = 0;
  }

  delete(item) {
    if (super.delete(item)) {
      this.length -= ITEM_OVERHEAD_SIZE + item.length;
    }
    else return false;
  }

  add(item) {
    if (!super.has(item)) {
      const maxLength = this.maxLength;
      let length = ITEM_OVERHEAD_SIZE + item.length;
      if (length > maxLength) return;
      let total = this.length + length;
      if (total > maxLength) {
        for(let item of this) {
          super.delete(item);
          total -= ITEM_OVERHEAD_SIZE + item.length;
          if (total <= maxLength) break;
        }
      }
      super.add(item);
      this.length = total;
    }
  }

  has(item) {
    if (super.delete(item)) {
      super.add(item);
      return true;
    }
    else return false;
  }
}

module.exports = exports = LRUSet;
