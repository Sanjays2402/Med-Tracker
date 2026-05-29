export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
};
