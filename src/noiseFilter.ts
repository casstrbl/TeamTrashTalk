
/**
 * TrashTalk - Noise Filter
 * Author: Waiss Ahmadyar
 * CSC 130 - Smart Trash Bin Project
 *
 * Removes invalid readings and sudden jumps
 * from the HC-SR04 ultrasonic sensor.
 */

export class NoiseFilter {

  // Maximum allowed change in centimeters
  private maxChange: number = 20;

  // Stores the previous accepted reading
  private lastReading: number | null = null;

  // Filters a new sensor reading
  filterReading(newReading: number): number | null {

    // Step 1: Check for invalid readings
    if (!Number.isFinite(newReading) || newReading <= 0) {
      return this.lastReading;
    }

    // Step 2: Accept the first valid reading
    if (this.lastReading === null) {
      this.lastReading = newReading;
      return newReading;
    }

    // Step 3: Calculate the difference
    const difference = Math.abs(
      newReading - this.lastReading
    );

    // Step 4: Reject sudden jumps
    if (difference > this.maxChange) {
      return this.lastReading;
    }

    // Step 5: Save the accepted reading
    this.lastReading = newReading;

    return newReading;
  }
}
