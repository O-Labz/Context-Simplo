/**
 * Simple authentication service for Context-Simplo Dashboard
 * Stores AUTH_TOKEN in localStorage and provides it to all API requests
 * Performance test: Modified at 12:48 PM to test auto-indexing speed
 */

const TOKEN_KEY = 'context-simplo-auth-token';

export class AuthService {
  private static token: string | null = null;
  private static listeners: Set<() => void> = new Set();

  static {
    // Load token from localStorage on init
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  static getToken(): string | null {
    return this.token;
  }

  static setToken(token: string): void {
    this.token = token;
    localStorage.setItem(TOKEN_KEY, token);
    this.notifyListeners();
  }

  static clearToken(): void {
    this.token = null;
    localStorage.removeItem(TOKEN_KEY);
    this.notifyListeners();
  }

  static isAuthenticated(): boolean {
    return !!this.token;
  }

  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  /**
   * Enhanced fetch that automatically includes Authorization header
   */
  static async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(input, {
      ...init,
      headers,
    });

    // If we get a 401, clear the token to trigger re-login
    if (response.status === 401) {
      this.clearToken();
    }

    return response;
  }
}

// Export a convenience function that matches the fetch signature
export const authFetch = AuthService.fetch.bind(AuthService);
