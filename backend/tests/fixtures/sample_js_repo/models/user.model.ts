export interface UserAttributes {
  id: number;
  username: string;
  email: string;
  role: string;
}

export class BaseModel {
  public id: number = 0;
  public createdAt: Date = new Date();
}

export class UserModel extends BaseModel implements UserAttributes {
  public username: string;
  public email: string;
  public role: string;

  constructor(id: number, username: string, email: string, role: string = 'user') {
    super();
    this.id = id;
    this.username = username;
    this.email = email;
    this.role = role;
  }

  public getSummary(): string {
    return `${this.username} (${this.email}) - ${this.role}`;
  }
}
