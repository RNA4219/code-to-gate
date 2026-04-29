// API package - REST API server
import express, { Request, Response } from 'express';
import { UserService, ProductService, User, Product } from '@demo/monorepo-core';
import { Logger, Config } from '@demo/monorepo-shared';

const app = express();
const config: Config = {
  logLevel: 'info',
  environment: process.env.NODE_ENV || 'development'
};

const logger = new Logger(config.logLevel);
const userService = new UserService(config);
const productService = new ProductService(config);

app.use(express.json());

// User endpoints
app.get('/users/:id', async (req: Request, res: Response) => {
  const user = await userService.getUser(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

app.post('/users', async (req: Request, res: Response) => {
  const user = await userService.createUser(req.body);
  res.status(201).json(user);
});

// Product endpoints
app.get('/products', async (req: Request, res: Response) => {
  const products = await productService.getProducts();
  res.json(products);
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export { app, userService, productService };