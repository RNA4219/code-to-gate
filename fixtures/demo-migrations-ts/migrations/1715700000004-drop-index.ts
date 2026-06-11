/**
 * TypeORM Migration - DROP INDEX (medium risk - SPEC-29 baseline)
 * Triggers: DB_DROP_INDEX (medium severity), DB_ROLLBACK_NOT_EVIDENCED
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class DropIndex1715700000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dangerous: DROP INDEX may affect query performance
    await queryRunner.query("DROP INDEX users_email_idx");
  }

  // No rollback - DB_ROLLBACK_NOT_EVIDENCED also triggered
}