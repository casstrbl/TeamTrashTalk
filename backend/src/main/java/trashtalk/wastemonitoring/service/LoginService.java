package main.java.trashtalk.wastemonitoring.service;

import java.security.SecureRandom;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import main.java.trashtalk.wastemonitoring.model.StaffMember;
import main.java.trashtalk.wastemonitoring.repository.StaffRepository;

/**
 * Handles staff login, temporary login sessions,
 * and backend role checks.
 */
public class LoginService {

    /**
     * Safe staff information that can be returned
     * after a successful login.
     */
    public record Profile(
            int id,
            String name,
            String email,
            String role) {
    }

    /**
     * Stores the login token and safe staff profile
     * returned after a successful login.
     */
    public record LoginResult(
            String token,
            Profile staff) {
    }

    /**
     * Stores the staff member connected to a login token
     * and when that token expires.
     */
    private record Session(
            int staffId,
            Instant expiresAt) {
    }

    // Handles staff database lookups.
    private final StaffRepository staffRepository =
            new StaffRepository();

    // Handles password hashing and verification.
    private final PasswordService passwords =
            new PasswordService();

    // Generates secure random login tokens.
    private final SecureRandom random =
            new SecureRandom();

    // Stores active login sessions while the backend is running.
    private final Map<String, Session> sessions =
            new HashMap<>();

    // Used so the password verification step still runs
    // when an account is missing or does not have a password hash.
    private final String dummyHash =
            passwords.hashPassword(
                    "unused-login-check".toCharArray()
            );

    /**
     * Attempts to log in a staff member using
     * their email and password.
     *
     * @return login information if successful,
     *         otherwise null
     */
    public LoginResult login(
            String email,
            char[] password) throws SQLException {

        // Reject missing login information.
        if (email == null
                || email.isBlank()
                || password == null
                || password.length == 0) {

            return null;
        }

        // Find the staff account matching the email.
        StaffRepository.Credentials credentials =
                staffRepository.findByEmail(email);

        // Get the stored password hash if the account exists.
        String hash =
                credentials == null
                        ? null
                        : credentials.passwordHash();

        // Verify the entered password.
        // A dummy hash is used when an account has no usable hash.
        boolean matches =
                passwords.verifyPassword(
                        password,
                        hash == null
                                ? dummyHash
                                : hash
                );

        // Login fails if there is no stored hash
        // or the password does not match.
        if (hash == null || !matches) {
            return null;
        }

        // Convert the staff member into a safe profile.
        Profile staff =
                profile(credentials.staff());

        if (staff == null) {
            return null;
        }

        // Create a random token for this login session.
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);

        String token =
                Base64.getUrlEncoder()
                        .withoutPadding()
                        .encodeToString(bytes);

        Instant now = Instant.now();

        synchronized (sessions) {

            // Remove expired sessions before adding a new one.
            sessions.values().removeIf(
                    session ->
                            !session.expiresAt()
                                    .isAfter(now)
            );

            // Prevent an unlimited number of sessions
            // from being stored in memory.
            if (sessions.size() >= 1000) {
                throw new IllegalStateException(
                        "Session limit reached"
                );
            }

            // Keep the login active for two hours.
            sessions.put(
                    token,
                    new Session(
                            staff.id(),
                            now.plus(Duration.ofHours(2))
                    )
            );
        }

        return new LoginResult(
                token,
                staff
        );
    }

    /**
     * Checks a login token and returns the
     * currently authenticated staff member.
     */
    public Profile authenticate(
            String token) throws SQLException {

        if (token == null) {
            return null;
        }

        Session session;

        synchronized (sessions) {

            // Find the session connected to the token.
            session = sessions.get(token);

            if (session == null) {
                return null;
            }

            // Remove and reject an expired session.
            if (!session.expiresAt()
                    .isAfter(Instant.now())) {

                sessions.remove(token);
                return null;
            }
        }

        // Reload the staff member from the database
        // so role changes take effect on the next request.
        return profile(
                staffRepository.findById(
                        session.staffId()
                )
        );
    }

    /**
     * Checks whether the logged-in staff member
     * has editor permission.
     *
     * A future write endpoint, such as mark pickup done,
     * can use this method for both permission and staff ID.
     */
    public Profile editorForToken(
            String token) throws SQLException {

        Profile staff =
                authenticate(token);

        return staff != null
                && "editor".equals(staff.role())
                ? staff
                : null;
    }

    /**
     * Converts a StaffMember into a safe login profile
     * and normalizes the supported backend roles.
     */
    private Profile profile(
            StaffMember staff) {

        if (staff == null
                || staff.getRole() == null) {

            return null;
        }

        // Support viewer and editor roles.
        // Existing admin accounts are treated as editors
        // so teammate data does not break.
        String role =
                switch (
                        staff.getRole()
                                .trim()
                                .toLowerCase(Locale.ROOT)
                        ) {

                    case "viewer" ->
                            "viewer";

                    case "editor", "admin" ->
                            "editor";

                    default ->
                            null;
                };

        // Do not authenticate accounts with unsupported roles.
        return role == null
                ? null
                : new Profile(
                staff.getStaffID(),
                staff.getName(),
                staff.getEmail(),
                role
        );
    }
}
