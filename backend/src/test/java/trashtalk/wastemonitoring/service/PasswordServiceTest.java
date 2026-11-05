package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.service.PasswordService;

/**
 * Tests password hashing and verification for staff login.
 */
class PasswordServiceTest {

    /**
     * Confirms that a password can be hashed
     * and then verified successfully.
     */
    @Test
    void correctPasswordMatchesStoredHash() {

        PasswordService passwordService =
                new PasswordService();

        char[] password =
                "TestPassword123!".toCharArray();

        // Create a secure password hash.
        String hash =
                passwordService.hashPassword(password);

        // The same password should match the stored hash.
        assertTrue(
                passwordService.verifyPassword(
                        "TestPassword123!".toCharArray(),
                        hash
                )
        );
    }

    /**
     * Confirms that an incorrect password
     * does not match the stored hash.
     */
    @Test
    void incorrectPasswordDoesNotMatchStoredHash() {

        PasswordService passwordService =
                new PasswordService();

        // Hash the original password.
        String hash =
                passwordService.hashPassword(
                        "CorrectPassword123!".toCharArray()
                );

        // A different password should fail verification.
        assertFalse(
                passwordService.verifyPassword(
                        "WrongPassword123!".toCharArray(),
                        hash
                )
        );
    }

    /**
     * Confirms that two hashes of the same password
     * are different because each one uses a random salt.
     */
    @Test
    void samePasswordCreatesDifferentHashes() {

        PasswordService passwordService =
                new PasswordService();

        String firstHash =
                passwordService.hashPassword(
                        "SamePassword123!".toCharArray()
                );

        String secondHash =
                passwordService.hashPassword(
                        "SamePassword123!".toCharArray()
                );

        // Random salts should make the stored hashes different.
        assertNotEquals(
                firstHash,
                secondHash
        );

        // Both hashes should still verify the original password.
        assertTrue(
                passwordService.verifyPassword(
                        "SamePassword123!".toCharArray(),
                        firstHash
                )
        );

        assertTrue(
                passwordService.verifyPassword(
                        "SamePassword123!".toCharArray(),
                        secondHash
                )
        );
    }

    /**
     * Confirms that missing or invalid stored hashes
     * are rejected instead of causing an error.
     */
    @Test
    void invalidStoredHashDoesNotVerify() {

        PasswordService passwordService =
                new PasswordService();

        char[] password =
                "TestPassword123!".toCharArray();

        assertFalse(
                passwordService.verifyPassword(
                        password,
                        null
                )
        );

        assertFalse(
                passwordService.verifyPassword(
                        password,
                        "not-a-valid-password-hash"
                )
        );
    }
}
