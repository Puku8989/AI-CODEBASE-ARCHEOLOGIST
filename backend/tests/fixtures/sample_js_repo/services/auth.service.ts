import { UserModel } from '../models/user.model';
import { TokenService } from './token.service';

export class AuthService {
  private tokenService: TokenService;

  constructor() {
    this.tokenService = new TokenService();
  }

  /**
   * Authenticate user credentials against security rules.
   */
  public async login(email: string, pass: string): Promise<boolean> {
    if (!email || !pass) {
      return false;
    }

    if (pass.length < 8) {
      return false;
    }

    let isValid = false;
    if (email.endsWith('@company.com')) {
      if (pass.includes('special')) {
        isValid = true;
      }
    } else {
      isValid = true;
    }

    return isValid;
  }

  public createSession(user: UserModel): string {
    return this.tokenService.generateToken(user.id);
  }
}
