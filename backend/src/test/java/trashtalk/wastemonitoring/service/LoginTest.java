package test.java.trashtalk.wastemonitoring.service;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.PreparedStatement;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import main.java.trashtalk.wastemonitoring.config.DatabaseConfig;
import main.java.trashtalk.wastemonitoring.database.DatabaseInitializer;
import main.java.trashtalk.wastemonitoring.service.LoginService;
import main.java.trashtalk.wastemonitoring.service.PasswordService;

/**
 * Tests staff login and backend role checks.
 */
class LoginTest {

    // Password used only for these local test accounts.
    private final char[] password =
            "fake test password".toCharArray();

    private LoginService login;
    private String hash;
    private boolean initialized;

    /**
     * Creates temporary staff accounts before each test.
     *
     * These tests should only run against an in-memory
     * H2 database and never against shared Supabase.
     */
    @BeforeEach
    void setUp() throws Exception {

        // Make sure the test is using a dedicated H2 database
        // before DatabaseConfig opens a connection.
        String url = System.getenv("DB_URL");

        assertTrue(
                url != null
                        && url.startsWith("jdbc:h2:mem:"),
                "Set DB_URL to a dedicated in-memory H2 database for this test"
        );

        // Create the database tables for the test.
        DatabaseInitializer.initializeDatabase();

        initialized = true;

        login = new LoginService();

        // Create one password hash used by the test accounts.
        hash = new PasswordService()
                .hashPassword(password);

        // Add temporary staff members with different roles.
        addStaff(
                900101,
                "viewer",
                hash
        );

        addStaff(
                900102,
                "editor",
                hash
        );

        // Existing admin accounts should behave like editors.
        addStaff(
                900103,
                "admin",
                hash
        );

        // Account with no password hash should not be able to log in.
        addStaff(
                900104,
                "viewer",
                null
        );
    }

    /**
     * Removes the temporary test staff after each test.
     */
    @AfterEach
    void cleanUp() throws Exception {

        if (!initialized) {
            return;
        }

        try (Connection connection =
                     DatabaseConfig.getConnection();

             PreparedStatement statement =
                     connection.prepareStatement(
                             "DELETE FROM staff "
                                     + "WHERE id IN "
                                     + "(900101, 900102, 900103, 900104)"
                     )) {

            statement.executeUpdate();
        }
    }

    /**
     * Confirms that a successful login returns
     * a token and safe staff profile.
     */
    @Test
    void loginReturnsTokenAndSafeProfile()
            throws Exception {

        // Login should ignore extra spaces
        // and email capitalization.
        var result =
                login.login(
                        "  900101@TEST.INVALID  ",
                        password
                );

        assertNotNull(result);

        assertEquals(
                900101,
                result.staff().id()
        );

        assertEquals(
                "viewer",
                result.staff().role()
        );

        // The token should authenticate the same user.
        assertEquals(
                result.staff(),
                login.authenticate(
                        result.token()
                )
        );

        // Convert the response to JSON to make sure
        // sensitive password information is not included.
        String json =
                new ObjectMapper()
                        .writeValueAsString(result);

        assertFalse(
                json.contains(hash)
        );

        assertFalse(
                json.contains("password")
        );
    }

    /**
     * Confirms that invalid login attempts
     * are rejected.
     */
    @Test
    void rejectsWrongPasswordMissingAccountAndNullHash()
            throws Exception {

        // Wrong password should fail.
        assertNull(
                login.login(
                        "900101@test.invalid",
                        "wrong".toCharArray()
                )
        );

        // Missing account should fail.
        assertNull(
                login.login(
                        "missing@test.invalid",
                        password
                )
        );

        // Account without a password hash should fail.
        assertNull(
                login.login(
                        "900104@test.invalid",
                        password
                )
        );
    }

    /**
     * Confirms that backend editor checks use
     * the authenticated user's current database role.
     */
    @Test
    void editorGuardUsesAuthenticatedDatabaseRole()
            throws Exception {

        // A fake token should not have editor permission.
        assertNull(
                login.editorForToken(
                        "invented-token"
                )
        );

        // A viewer should not have editor permission.
        assertNull(
                login.editorForToken(
                        login.login(
                                "900101@test.invalid",
                                password
                        ).token()
                )
        );

        // An editor should have permission.
        String editorToken =
                login.login(
                        "900102@test.invalid",
                        password
                ).token();

        assertEquals(
                900102,
                login.editorForToken(
                        editorToken
                ).id()
        );

        // Existing admin accounts are treated
        // as editors for compatibility.
        assertEquals(
                900103,
                login.editorForToken(
                        login.login(
                                "900103@test.invalid",
                                password
                        ).token()
                ).id()
        );

        // Change the editor's role in the database.
        try (Connection connection =
                     DatabaseConfig.getConnection();

             PreparedStatement statement =
                     connection.prepareStatement(
                             "UPDATE staff "
                                     + "SET role = 'viewer' "
                                     + "WHERE id = 900102"
                     )) {

            statement.executeUpdate();
        }

        // The backend should reload the role
        // and remove editor permission immediately.
        assertNull(
                login.editorForToken(
                        editorToken
                )
        );
    }

    /**
     * Adds one temporary staff account
     * to the local H2 test database.
     */
    private void addStaff(
            int id,
            String role,
            String passwordHash) throws Exception {

        try (Connection connection =
                     DatabaseConfig.getConnection();

             PreparedStatement statement =
                     connection.prepareStatement(
                             "INSERT INTO staff "
                                     + "(id, name, role, email, password_hash) "
                                     + "VALUES (?, ?, ?, ?, ?)"
                     )) {

            statement.setInt(
                    1,
                    id
            );

            statement.setString(
                    2,
                    "Test Staff"
            );

            statement.setString(
                    3,
                    role
            );

            statement.setString(
                    4,
                    id + "@test.invalid"
            );

            statement.setString(
                    5,
                    passwordHash
            );

            statement.executeUpdate();
        }
    }
}