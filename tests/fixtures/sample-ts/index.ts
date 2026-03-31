export class UserService {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async fetchUser(id: string): Promise<User> {
    const response = await fetch(`${this.apiUrl}/users/${id}`);
    return response.json();
  }

  async createUser(data: CreateUserData): Promise<User> {
    return this.apiCall('POST', '/users', data);
  }

  private async apiCall(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface CreateUserData {
  name: string;
  email: string;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
