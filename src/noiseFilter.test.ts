
/**
 * TrashTalk - Noise Filter Testing
 * Author: Waiss Ahmadyar
 * CSC 130 - Smart Trash Bin Project
 *
 * Tests the noise filter using fake HC-SR04 readings.
 */

import { NoiseFilter } from "./noiseFilter";

// Create a new noise filter
const filter = new NoiseFilter();

// Fake sensor readings in centimeters
const readings = [
  30,
  29,
  150,
  28,
  27,
  0,
  26
];

// Expected results after filtering
const expected = [
  30,
  29,
  29,
  28,
  27,
  27,
  26
];

console.log("TrashTalk Noise Filter Test");
console.log("---------------------------");

let passed = 0;

// Test each sensor reading
for (let i = 0; i < readings.length; i++) {

  const result = filter.filterReading(readings[i]);

  const success = result === expected[i];

  if (success) {
    passed++;
  }

  console.log(
    `Input: ${readings[i]} cm | ` +
    `Filtered: ${result} cm | ` +
    `${success ? "PASS" : "FAIL"}`
  );
}

console.log("---------------------------");
console.log(`Tests passed: ${passed}/${readings.length}`);
