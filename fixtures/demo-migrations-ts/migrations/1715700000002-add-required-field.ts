/**
 * TypeORM Migration - NOT NULL without DEFAULT (blocking risk)
 * Triggers: DB_ADD_NOT_NULL_WITHOUT_DEFAULT (high severity)
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRequiredField1715700000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Blocking: Adding NOT NULL column without DEFAULT will fail for existing rows
    await queryRunner.query("ALTER TABLE users ADD COLUMN verified BOOLEAN NOT NULL");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE users DROP COLUMN verified");
  }
}