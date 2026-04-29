// Core package - shared business logic
import { Logger, Config } from '@demo/monorepo-shared';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
}

export class UserService {
  private logger: Logger;

  constructor(config: Config) {
    this.logger = new Logger(config.logLevel);
  }

  async getUser(id: string): Promise<User | null> {
    this.logger.info(`Fetching user: ${id}`);
    // Implementation would go here
    return null;
  }

  async createUser(data: Omit<User, 'id'>): Promise<User> {
    this.logger.info('Creating user');
    const id = crypto.randomUUID();
    return { id, ...data };
  }
}

export class ProductService {
  private logger: Logger;

  constructor(config: Config) {
    this.logger = new Logger(config.logLevel);
  }

  async getProducts(): Promise<Product[]> {
    this.logger.info('Fetching products');
    return [];
  }
}

export { Logger, Config } from '@demo/monorepo-shared';