import authRouter from './routes/auth.routes';

const PORT = 3000;

export function bootstrapApp() {
  console.log(`Starting server on port ${PORT}...`);
  return { status: 'running', port: PORT };
}

if (process.env.NODE_ENV !== 'test') {
  bootstrapApp();
}
