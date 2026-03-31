// Sample Go code for testing parser
package main

import (
	"errors"
	"fmt"
)

// User represents a user in the system
type User struct {
	ID       uint64
	Username string
	Email    string
}

// AuthService handles user authentication
type AuthService struct {
	users map[string]*User
}

// NewAuthService creates a new authentication service
func NewAuthService() *AuthService {
	return &AuthService{
		users: make(map[string]*User),
	}
}

// RegisterUser registers a new user
func (s *AuthService) RegisterUser(username, email string) (uint64, error) {
	if _, exists := s.users[username]; exists {
		return 0, errors.New("user already exists")
	}

	id := uint64(len(s.users) + 1)
	user := &User{
		ID:       id,
		Username: username,
		Email:    email,
	}

	s.users[username] = user
	return id, nil
}

// Authenticate authenticates a user
func (s *AuthService) Authenticate(username string) (*User, error) {
	user, exists := s.users[username]
	if !exists {
		return nil, errors.New("user not found")
	}
	return user, nil
}

// UserCount returns the number of registered users
func (s *AuthService) UserCount() int {
	return len(s.users)
}

func main() {
	service := NewAuthService()

	id, err := service.RegisterUser("alice", "alice@example.com")
	if err != nil {
		fmt.Printf("Registration failed: %v\n", err)
		return
	}

	fmt.Printf("User registered with ID: %d\n", id)

	user, err := service.Authenticate("alice")
	if err != nil {
		fmt.Printf("Authentication failed: %v\n", err)
		return
	}

	fmt.Printf("Authenticated user: %+v\n", user)
}
