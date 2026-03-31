// Sample Java code for testing parser
package com.example.auth;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * User authentication service
 */
public class AuthService {
    private final Map<String, User> users;

    /**
     * Create a new authentication service
     */
    public AuthService() {
        this.users = new HashMap<>();
    }

    /**
     * Register a new user
     * 
     * @param username User's username
     * @param email User's email
     * @return User ID
     * @throws IllegalArgumentException if user already exists
     */
    public long registerUser(String username, String email) {
        if (users.containsKey(username)) {
            throw new IllegalArgumentException("User already exists");
        }

        long id = users.size() + 1;
        User user = new User(id, username, email);
        users.put(username, user);
        return id;
    }

    /**
     * Authenticate a user
     * 
     * @param username User's username
     * @return User if found
     */
    public Optional<User> authenticate(String username) {
        return Optional.ofNullable(users.get(username));
    }

    /**
     * Get user count
     * 
     * @return Number of registered users
     */
    public int getUserCount() {
        return users.size();
    }

    /**
     * User class
     */
    public static class User {
        private final long id;
        private final String username;
        private final String email;

        public User(long id, String username, String email) {
            this.id = id;
            this.username = username;
            this.email = email;
        }

        public long getId() {
            return id;
        }

        public String getUsername() {
            return username;
        }

        public String getEmail() {
            return email;
        }

        @Override
        public String toString() {
            return "User{" +
                    "id=" + id +
                    ", username='" + username + '\'' +
                    ", email='" + email + '\'' +
                    '}';
        }
    }

    public static void main(String[] args) {
        AuthService service = new AuthService();

        try {
            long id = service.registerUser("alice", "alice@example.com");
            System.out.println("User registered with ID: " + id);

            service.authenticate("alice").ifPresent(user -> {
                System.out.println("Authenticated user: " + user);
            });
        } catch (IllegalArgumentException e) {
            System.err.println("Registration failed: " + e.getMessage());
        }
    }
}
