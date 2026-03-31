// Sample Rust code for testing parser

use std::collections::HashMap;

/// User authentication service
pub struct AuthService {
    users: HashMap<String, User>,
}

#[derive(Debug, Clone)]
pub struct User {
    pub id: u64,
    pub username: String,
    pub email: String,
}

impl AuthService {
    /// Create a new authentication service
    pub fn new() -> Self {
        Self {
            users: HashMap::new(),
        }
    }

    /// Register a new user
    pub fn register_user(&mut self, username: String, email: String) -> Result<u64, String> {
        if self.users.contains_key(&username) {
            return Err("User already exists".to_string());
        }

        let id = self.users.len() as u64 + 1;
        let user = User {
            id,
            username: username.clone(),
            email,
        };

        self.users.insert(username, user);
        Ok(id)
    }

    /// Authenticate a user
    pub fn authenticate(&self, username: &str) -> Option<&User> {
        self.users.get(username)
    }

    /// Get user count
    pub fn user_count(&self) -> usize {
        self.users.len()
    }
}

fn main() {
    let mut service = AuthService::new();
    
    match service.register_user("alice".to_string(), "alice@example.com".to_string()) {
        Ok(id) => println!("User registered with ID: {}", id),
        Err(e) => eprintln!("Registration failed: {}", e),
    }

    if let Some(user) = service.authenticate("alice") {
        println!("Authenticated user: {:?}", user);
    }
}
