/**
 * Large JavaScript file with many symbols for scale testing.
 */

// Many function declarations
function func001() { return 1; }
function func002() { return 2; }
function func003() { return 3; }
function func004() { return 4; }
function func005() { return 5; }
function func006() { return 6; }
function func007() { return 7; }
function func008() { return 8; }
function func009() { return 9; }
function func010() { return 10; }

// Async functions
async function async001() { await Promise.resolve(); return 1; }
async function async002() { await Promise.resolve(); return 2; }
async function async003() { await Promise.resolve(); return 3; }
async function async004() { await Promise.resolve(); return 4; }
async function async005() { await Promise.resolve(); return 5; }

// Arrow functions assigned to variables
const arrow001 = () => 1;
const arrow002 = () => 2;
const arrow003 = () => 3;
const arrow004 = () => 4;
const arrow005 = () => 5;
const arrow006 = async () => { await Promise.resolve(); return 6; };
const arrow007 = async () => { await Promise.resolve(); return 7; };
const arrow008 = async () => { await Promise.resolve(); return 8; };

// Generator functions
function* gen001() { yield 1; }
function* gen002() { yield 2; }
function* gen003() { yield 3; }
function* gen004() { yield 4; }
function* gen005() { yield 5; }

// Async generators
async function* asyncGen001() { await Promise.resolve(); yield 1; }
async function* asyncGen002() { await Promise.resolve(); yield 2; }
async function* asyncGen003() { await Promise.resolve(); yield 3; }

// Multiple variables
const var001 = "string";
const var002 = 42;
const var003 = { key: "value" };
const var004 = [1, 2, 3];
const var005 = true;

// Classes with methods
class LargeClass001 {
  method001() { return 1; }
  method002() { return 2; }
  method003() { return 3; }
  method004() { return 4; }
  method005() { return 5; }
  method006() { return 6; }
  method007() { return 7; }
  method008() { return 8; }
  method009() { return 9; }
  method010() { return 10; }

  async asyncMethod001() { await Promise.resolve(); return 1; }
  async asyncMethod002() { await Promise.resolve(); return 2; }
  async asyncMethod003() { await Promise.resolve(); return 3; }
}

class LargeClass002 {
  constructor() { this.value = 0; }
  getValue() { return this.value; }
  setValue(v) { this.value = v; }
  increment() { this.value++; }
  decrement() { this.value--; }
  async fetchValue() { await Promise.resolve(); return this.value; }
}

// Class with static methods
class StaticClass {
  static staticMethod001() { return 1; }
  static staticMethod002() { return 2; }
  static async asyncStatic001() { await Promise.resolve(); return 1; }
}

// Require statements (CommonJS)
const path = require('path');
const fs = require('fs');
const util = require('util');

// Destructured require
const { readFile, writeFile } = fs.promises;

// Named imports (ESM style in CJS context)
const express = require('express');
const router = express.Router();

// Multiple export patterns
module.exports = {
  func001,
  func002,
  func003,
  async001,
  async002,
  arrow001,
  arrow002,
  gen001,
  gen002,
  LargeClass001,
  LargeClass002,
  StaticClass,
  var001,
  var002
};

// Individual exports
module.exports.extraFunc = function() { return "extra"; };
module.exports.extraArrow = () => "extra arrow";
module.exports.extraAsync = async () => { await Promise.resolve(); return "extra async"; };

// Call relationships
function callingOtherFunctions() {
  func001();
  func002();
  async001();
  arrow001();
  readFile('/path/to/file');
  return func003();
}

// Class with calls
class ClassWithMethodCalls {
  process() {
    func001();
    callingOtherFunctions();
    return this.getValue();
  }

  getValue() {
    return LargeClass001.prototype.method001();
  }
}

// Anonymous functions in arrays and objects
const functionArray = [
  () => 1,
  () => 2,
  function() { return 3; },
  async () => { await Promise.resolve(); return 4; }
];

const functionObject = {
  fn1: () => 1,
  fn2: function() { return 2; },
  fn3: async () => { await Promise.resolve(); return 3; },
  nested: {
    deepFn: () => 4
  }
};

module.exports.functionArray = functionArray;
module.exports.functionObject = functionObject;