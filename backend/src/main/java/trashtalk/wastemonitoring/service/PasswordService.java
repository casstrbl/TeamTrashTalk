package main.java.trashtalk.wastemonitoring.service;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * Handles password hashing and verification for staff login.
 */
public class PasswordService {

    // Number of times PBKDF2 processes the password.
    private static final int ITERATIONS = 600_000;

    // Prefix stored with each password hash so we know
    // which hashing method and iteration count were used.
    private static final String PREFIX = "pbkdf2-sha256$600000$";

    // Generates a random salt for each password.
    private final SecureRandom random = new SecureRandom();

    /**
     * Creates a secure hash from a user's password.
     *
     * @param password the password entered by the user
     * @return the encoded password hash that can be stored in the database
     */
    public String hashPassword(char[] password) {

        // Passwords cannot be missing or empty.
        if (password == null || password.length == 0) {
            throw new IllegalArgumentException("Password is required");
        }

        // Create a random 16-byte salt.
        byte[] salt = new byte[16];
        random.nextBytes(salt);

        // Store the hashing method, salt, and derived password hash together.
        return PREFIX
                + Base64.getEncoder().encodeToString(salt)
                + "$"
                + Base64.getEncoder().encodeToString(
                derive(password, salt)
        );
    }

    /**
     * Checks whether an entered password matches
     * the password hash stored in the database.
     *
     * @param password the password entered during login
     * @param storedHash the password hash stored for the staff member
     * @return true if the password matches, otherwise false
     */
    public boolean verifyPassword(
            char[] password,
            String storedHash) {

        // Reject missing passwords or hashes that are not
        // in the format created by this service.
        if (password == null
                || password.length == 0
                || storedHash == null
                || !storedHash.startsWith(PREFIX)) {

            return false;
        }

        // Remove the prefix and separate the saved salt
        // from the saved password hash.
        String[] parts =
                storedHash.substring(PREFIX.length())
                        .split("\\$", -1);

        // A valid stored hash must contain a salt and hash value.
        if (parts.length != 2) {
            return false;
        }

        try {

            // Convert the stored salt back into bytes.
            byte[] salt =
                    Base64.getDecoder().decode(parts[0]);

            // Convert the stored password hash back into bytes.
            byte[] expected =
                    Base64.getDecoder().decode(parts[1]);

            // Hash the entered password again using the same salt
            // and compare the result with the stored hash.
            return salt.length == 16
                    && expected.length == 32
                    && MessageDigest.isEqual(
                    expected,
                    derive(password, salt)
            );

        } catch (IllegalArgumentException e) {

            // Invalid Base64 means the stored hash is not valid.
            return false;
        }
    }

    /**
     * Creates the actual password hash using PBKDF2.
     */
    private byte[] derive(
            char[] password,
            byte[] salt) {

        // Configure PBKDF2 with the password, salt,
        // iteration count, and 256-bit output size.
        PBEKeySpec spec =
                new PBEKeySpec(
                        password,
                        salt,
                        ITERATIONS,
                        256
                );

        try {

            // Generate the secure password hash.
            return SecretKeyFactory
                    .getInstance("PBKDF2WithHmacSHA256")
                    .generateSecret(spec)
                    .getEncoded();

        } catch (GeneralSecurityException e) {

            // Stop login setup if the hashing algorithm
            // is unavailable on the current Java installation.
            throw new IllegalStateException(
                    "Password hashing unavailable",
                    e
            );

        } finally {

            // Clear the password stored inside the specification
            // after hashing is finished.
            spec.clearPassword();
        }
    }
}
