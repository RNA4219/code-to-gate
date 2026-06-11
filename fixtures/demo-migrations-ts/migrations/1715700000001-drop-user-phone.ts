/**
 * TypeORM Migration - DROP COLUMN with rollback (medium risk)
 * Triggers: DB_DROP_COLUMN (medium severity)
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class DropUserPhone1715700000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE users DROP COLUMN phone");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE users ADD COLUMN phone VARCHAR(50)");
  }
}