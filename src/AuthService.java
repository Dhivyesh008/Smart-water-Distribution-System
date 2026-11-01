import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Handles authentication, registration, password hashing, and user sessions.
 */
public class AuthService {

    private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    private final Map<String, User> users = new ConcurrentHashMap<>();
    private final Map<String, User> sessions = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    public AuthService() {
        // Pre-seed default administrator, operator, and citizen accounts
        registerInternal("Administrator", "admin@watergrid.com", "Admin@123", "admin");
        registerInternal("Field Operator", "operator@watergrid.com", "Water@123", "admin");
        registerInternal("Public Resident", "citizen@watergrid.com", "Citizen@123", "public");
    }

    public static class AuthResult {
        private final boolean success;
        private final String message;
        private final String sessionId;
        private final User user;

        public AuthResult(boolean success, String message, String sessionId, User user) {
            this.success = success;
            this.message = message;
            this.sessionId = sessionId;
            this.user = user;
        }

        public boolean isSuccess() {
            return success;
        }

        public String getMessage() {
            return message;
        }

        public String getSessionId() {
            return sessionId;
        }

        public User getUser() {
            return user;
        }
    }

    private void registerInternal(String username, String email, String password, String role) {
        String salt = generateSalt();
        String hash = hashPassword(password, salt);
        User user = new User(username, email, hash, salt, role);
        users.put(user.getEmail(), user);
    }

    public AuthResult register(String username, String email, String password, String confirmPassword) {
        return register(username, email, password, confirmPassword, "public");
    }

    public AuthResult register(String username, String email, String password, String confirmPassword, String role) {
        if (username == null || username.trim().isEmpty()) {
            return new AuthResult(false, "Username is required.", null, null);
        }
        username = username.trim();
        if (username.length() < 2 || username.length() > 80) {
            return new AuthResult(false, "Username must be between 2 and 80 characters.", null, null);
        }

        if (email == null || email.trim().isEmpty()) {
            return new AuthResult(false, "Email is required.", null, null);
        }
        email = email.trim().toLowerCase();
        if (!EMAIL_PATTERN.matcher(email).matches() || email.length() > 254) {
            return new AuthResult(false, "Please enter a valid email address.", null, null);
        }

        if (users.containsKey(email)) {
            return new AuthResult(false, "An account with this email already exists.", null, null);
        }

        if (password == null || password.length() < 8) {
            return new AuthResult(false, "Password must be at least 8 characters long.", null, null);
        }

        boolean hasUpper = false;
        boolean hasLower = false;
        boolean hasDigit = false;
        for (char c : password.toCharArray()) {
            if (Character.isUpperCase(c)) hasUpper = true;
            else if (Character.isLowerCase(c)) hasLower = true;
            else if (Character.isDigit(c)) hasDigit = true;
        }
        if (!hasUpper || !hasLower || !hasDigit) {
            return new AuthResult(false, "Password must include an uppercase letter, lowercase letter, and a number.", null, null);
        }

        if (!password.equals(confirmPassword)) {
            return new AuthResult(false, "Passwords do not match.", null, null);
        }

        String salt = generateSalt();
        String hash = hashPassword(password, salt);
        User user = new User(username, email, hash, salt, role);
        users.put(email, user);

        String sessionId = createSession(user);
        return new AuthResult(true, "Account created successfully.", sessionId, user);
    }

    public AuthResult login(String email, String password) {
        if (email == null || email.trim().isEmpty() || password == null || password.isEmpty()) {
            return new AuthResult(false, "Please enter both email and password.", null, null);
        }

        email = email.trim().toLowerCase();
        User user = users.get(email);
        if (user == null) {
            return new AuthResult(false, "Email or password is incorrect.", null, null);
        }

        String hash = hashPassword(password, user.getSalt());
        if (!hash.equals(user.getPasswordHash())) {
            return new AuthResult(false, "Email or password is incorrect.", null, null);
        }

        String sessionId = createSession(user);
        return new AuthResult(true, "Sign in successful.", sessionId, user);
    }

    public void logout(String sessionId) {
        if (sessionId != null) {
            sessions.remove(sessionId);
        }
    }

    public User getUserBySession(String sessionId) {
        if (sessionId == null) {
            return null;
        }
        return sessions.get(sessionId);
    }

    private String createSession(User user) {
        String sessionId = UUID.randomUUID().toString();
        sessions.put(sessionId, user);
        return sessionId;
    }

    private String generateSalt() {
        byte[] salt = new byte[16];
        random.nextBytes(salt);
        return Base64.getEncoder().encodeToString(salt);
    }

    private String hashPassword(String password, String salt) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(salt.getBytes(StandardCharsets.UTF_8));
            byte[] hashed = md.digest(password.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hashed);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
