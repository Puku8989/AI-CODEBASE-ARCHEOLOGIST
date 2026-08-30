import { AuthService } from './auth.service';

export class TokenService {
  private activeTokens: Map<string, number>;

  constructor() {
    this.activeTokens = new Map();
  }

  public generateToken(userId: number): string {
    const token = `jwt_token_${userId}_${Date.now()}`;
    this.activeTokens.set(token, userId);
    return token;
  }

  public verify(token: string): boolean {
    return this.activeTokens.has(token);
  }
}
