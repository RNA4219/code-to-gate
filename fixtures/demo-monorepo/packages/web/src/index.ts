// Web package - frontend utilities
import { User, Product, UserService, ProductService } from '@demo/monorepo-core';
import { Logger, Config } from '@demo/monorepo-shared';

export class WebApp {
  private userService: UserService;
  private productService: ProductService;
  private logger: Logger;

  constructor(config: Config) {
    this.userService = new UserService(config);
    this.productService = new ProductService(config);
    this.logger = new Logger(config.logLevel);
  }

  async loadUserData(userId: string): Promise<User | null> {
    this.logger.info(`Loading user data for: ${userId}`);
    return this.userService.getUser(userId);
  }

  async loadProducts(): Promise<Product[]> {
    this.logger.info('Loading products');
    return this.productService.getProducts();
  }

  renderUserCard(user: User): string {
    return `
      <div class="user-card">
        <h2>${user.name}</h2>
        <p>${user.email}</p>
      </div>
    `;
  }

  renderProductList(products: Product[]): string {
    const items = products.map(p => `
      <li class="product-item">
        <span>${p.name}</span>
        <span>$${p.price.toFixed(2)}</span>
      </li>
    `).join('');

    return `<ul class="product-list">${items}</ul>`;
  }
}

export { User, Product, Logger, Config };