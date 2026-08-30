import { AuthService } from '../services/auth.service';
import { UserModel } from '../models/user.model';

const authService = new AuthService();

export const handleLogin = async (req: any, res: any) => {
  const { email, password } = req.body;
  const isOk = await authService.login(email, password);
  if (isOk) {
    const user = new UserModel(1, 'alice', email);
    const token = authService.createSession(user);
    return res.json({ success: true, token });
  }
  return res.status(401).json({ error: 'Unauthorized' });
};

// Express Router registration
const router = {
  post: (path: string, handler: any) => handler,
  get: (path: string, handler: any) => handler
};

router.post('/login', handleLogin);
router.get('/health', (req: any, res: any) => res.send('OK'));

export default router;
