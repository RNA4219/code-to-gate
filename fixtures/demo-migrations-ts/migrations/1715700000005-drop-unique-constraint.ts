/**
 * TypeORM Migration - DROP CONSTRAINT (data integrity risk)
 * Triggers: DB_DROP_CONSTRAINT (high severity)
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class DropUniqueConstraint1715700000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dangerous: Dropping unique constraint allows duplicate data
    await queryRunner.query("ALTER TABLE users DROP CONSTRAINT users_email_unique");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email)");
  }
}