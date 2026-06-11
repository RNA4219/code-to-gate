/**
 * TypeORM Migration - DROP TABLE without rollback (critical risk)
 * Triggers: DB_DROP_TABLE (critical severity - SPEC-29 baseline), DB_ROLLBACK_NOT_EVIDENCED
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class DropOldTable1715700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dangerous: DROP TABLE without corresponding down() rollback
    await queryRunner.query("DROP TABLE old_logs");
  }
}