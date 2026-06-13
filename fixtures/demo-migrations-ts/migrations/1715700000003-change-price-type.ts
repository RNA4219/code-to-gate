/**
 * TypeORM Migration - Risky type change (data loss risk)
 * Triggers: DB_RISKY_TYPE_CHANGE (high severity)
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangePriceType1715700000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dangerous: DECIMAL to INTEGER causes precision loss
    await queryRunner.query("ALTER TABLE products ALTER COLUMN price TYPE INTEGER");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE products ALTER COLUMN price TYPE DECIMAL(10,2)");
  }
}