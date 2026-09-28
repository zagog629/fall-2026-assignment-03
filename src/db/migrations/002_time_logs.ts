/* eslint-disable @typescript-eslint/no-explicit-any */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('time_logs')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('ticket_id', 'integer', (col) =>
      col.references('tickets.id').onDelete('cascade').notNull(),
    )
    .addColumn('user_id', 'integer', (col) =>
      col.references('users.id').onDelete('cascade').notNull(),
    )
    // Whole hours. Kept as `integer` (not `numeric`) because the `pg` driver
    // returns numeric columns as strings, which would not match the `number`
    // type declared for this column in database.ts.
    .addColumn('hours', 'integer', (col) => col.notNull().check(sql`hours > 0`))
    .addColumn('logged_at', 'timestamptz', (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  // Postgres does not index foreign keys automatically. Every total is a
  // `WHERE ticket_id = ?` aggregate, so index the column it filters on.
  await db.schema
    .createIndex('time_logs_ticket_id_idx')
    .on('time_logs')
    .column('ticket_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Dropping the table also drops its index.
  await db.schema.dropTable('time_logs').ifExists().execute();
}
