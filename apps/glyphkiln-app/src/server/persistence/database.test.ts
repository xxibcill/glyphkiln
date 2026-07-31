import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SqlDatabase } from "./database";
import { createPGliteDatabase } from "./pglite-database";
import { createPostgresDatabase } from "./postgres-database";

describe("SQL database adapters", () => {
  let database: SqlDatabase;

  beforeEach(async () => {
    database = await createPGliteDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it("binds values as parameters instead of interpreting them as SQL", async () => {
    await database.query("CREATE TABLE inert_values (value text NOT NULL)");

    const inertValue = "'); DROP TABLE inert_values; --";
    await database.query("INSERT INTO inert_values (value) VALUES ($1)", [inertValue]);

    await expect(
      database.query<{ value: string }>(
        "SELECT value FROM inert_values WHERE value = $1",
        [inertValue],
      ),
    ).resolves.toEqual([{ value: inertValue }]);
  });

  it("rolls back the complete operation when a transaction fails", async () => {
    await database.query("CREATE TABLE transaction_values (value text NOT NULL)");

    await expect(
      database.transaction(async (transaction) => {
        await transaction.query("INSERT INTO transaction_values (value) VALUES ($1)", [
          "not-committed",
        ]);
        throw new Error("abort transaction");
      }),
    ).rejects.toThrow("abort transaction");

    await expect(
      database.query("SELECT value FROM transaction_values"),
    ).resolves.toEqual([]);
  });

  it("rejects an empty production connection string before opening a client", () => {
    expect(() => createPostgresDatabase("   ")).toThrow(
      "A non-empty PostgreSQL connection string is required.",
    );
  });
});
