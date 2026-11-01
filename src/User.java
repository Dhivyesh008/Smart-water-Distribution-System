import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Represents a registered user in the system.
 */
public class User {

    private static final DateTimeFormatter FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final String username;
    private final String email;
    private final String passwordHash;
    private final String salt;
    private final String createdAt;
    private final String role;

    public User(String username, String email, String passwordHash, String salt, String role) {
        this.username = username;
        this.email = email.toLowerCase().trim();
        this.passwordHash = passwordHash;
        this.salt = salt;
        this.createdAt = LocalDateTime.now().format(FORMATTER);
        this.role = (role != null && !role.trim().isEmpty()) ? role.trim().toLowerCase() : "admin";
    }

    public User(String username, String email, String passwordHash, String salt) {
        this(username, email, passwordHash, salt, "admin");
    }

    public String getUsername() {
        return username;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getSalt() {
        return salt;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public String getRole() {
        return role;
    }
}
