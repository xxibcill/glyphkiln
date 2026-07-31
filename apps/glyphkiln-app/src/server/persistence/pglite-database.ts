import {
  PGlite,
  type PGliteOptions,
  type Transaction as PGliteTransactionClient,
} from "@electric-sql/pglite";

import type { SqlDatabase, SqlParameters, SqlRow, SqlTransaction } from "./database";

type PGliteQueryExecutor = Pick<PGlite | PGliteTransactionClient, "query">;

class PGliteTransaction implements SqlTransaction {
  readonly #executor: PGliteQueryExecutor;

  constructor(executor: PGliteQueryExecutor) {
    this.#executor = executor;
  }

  async query<Row extends SqlRow = SqlRow>(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<Row[]> {
    const result = await this.#executor.query<Row>(statement, [...parameters]);
    return result.rows;
  }
}

export type PGliteDatabaseOptions = {
  dataDirectory?: string;
  pglite?: PGliteOptions;
};

export class PGliteDatabase implements SqlDatabase {
  readonly #client: PGlite;

  constructor(client: PGlite) {
    this.#client = client;
  }

  async query<Row extends SqlRow = SqlRow>(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<Row[]> {
    return new PGliteTransaction(this.#client).query<Row>(statement, parameters);
  }

  async transaction<Result>(
    operation: (transaction: SqlTransaction) => Promise<Result>,
  ): Promise<Result> {
    return this.#client.transaction(async (transactionClient) =>
      operation(new PGliteTransaction(transactionClient)),
    );
  }

  async close(): Promise<void> {
    await this.#client.close();
  }
}

export async function createPGliteDatabase(
  options: PGliteDatabaseOptions = {},
): Promise<PGliteDatabase> {
  const client = await PGlite.create(
    options.dataDirectory ?? "memory://",
    options.pglite,
  );

  return new PGliteDatabase(client);
}
