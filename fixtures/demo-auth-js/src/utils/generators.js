/**
 * Generator functions for JavaScript testing.
 */

/**
 * Simple generator function.
 */
function* idGenerator(start = 0) {
  let id = start;
  while (true) {
    yield id++;
  }
}

/**
 * Generator for iterating over array.
 */
function* arrayIterator(arr) {
  for (const item of arr) {
    yield item;
  }
}

/**
 * Generator with filtering.
 */
function* filterGenerator(arr, predicate) {
  for (const item of arr) {
    if (predicate(item)) {
      yield item;
    }
  }
}

/**
 * Async generator function.
 */
async function* asyncItemGenerator(items) {
  for (const item of items) {
    await new Promise(resolve => setTimeout(resolve, 10));
    yield { ...item, processed: true };
  }
}

/**
 * Generator that yields objects.
 */
function* objectYielder(keys, values) {
  for (let i = 0; i < keys.length; i++) {
    yield { key: keys[i], value: values[i] };
  }
}

/**
 * Generator with return value.
 */
function* countingGenerator(limit) {
  for (let i = 1; i <= limit; i++) {
    yield i;
  }
  return `Counted ${limit} items`;
}

/**
 * Nested generator usage.
 */
function processWithGenerator(items) {
  const gen = arrayIterator(items);
  const results = [];

  for (const item of gen) {
    results.push(item);
  }

  return results;
}

/**
 * Generator passed as argument.
 */
function consumeGenerator(gen, consumer) {
  let result = gen.next();
  while (!result.done) {
    consumer(result.value);
    result = gen.next();
  }
  return result.value;
}

module.exports = {
  idGenerator,
  arrayIterator,
  filterGenerator,
  asyncItemGenerator,
  objectYielder,
  countingGenerator,
  processWithGenerator,
  consumeGenerator
};