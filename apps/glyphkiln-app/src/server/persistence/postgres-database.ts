import postgres from "postgres";

import type { SqlDatabase, SqlParameters, SqlRow, SqlTransaction } from "./database";

type PostgresClient = ReturnType<typeof postgres>;
type PostgresQueryExecutor = Pick<PostgresClient, "unsafe">;
type TransactionResult<Result> = { readonly value: Result };

export type PostgresDatabaseOptions = {
  applicationName?: string;
  connectTimeoutSeconds?: number;
  idleTimeoutSeconds?: number;
  maxConnections?: number;
  ssl?: boolean | "allow" | "prefer" | "require" | "verify-full";
};

class PostgresTransaction implements SqlTransaction {
  readonly #executor: PostgresQueryExecutor;

  constructor(executor: PostgresQueryExecutor) {
    this.#executor = executor;
  }

  async query<Row extends SqlRow = SqlRow>(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<Row[]> {
    const result = await this.#executor.unsafe<Row[]>(statement, [...parameters]);

    return Array.from(result);
  }
}

export class PostgresDatabase implements SqlDatabase {
  readonly #client: PostgresClient;

  constructor(client: PostgresClient) {
    this.#client = client;
  }

  async query<Row extends SqlRow = SqlRow>(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<Row[]> {
    return new PostgresTransaction(this.#client).query<Row>(statement, parameters);
  }

  async transaction<Result>(
    operation: (transaction: SqlTransaction) => Promise<Result>,
  ): Promise<Result> {
    const result = await this.#client.begin<TransactionResult<Result>>(
      async (transactionClient) => ({
        value: await operation(new PostgresTransaction(transactionClient)),
      }),
    );

    return result.value;
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 5 });
  }
}

export function createPostgresDatabase(
  connectionString: string,
  options: PostgresDatabaseOptions = {},
): PostgresDatabase {
  if (connectionString.trim().length === 0) {
    throw new Error("A non-empty PostgreSQL connection string is required.");
  }

  const client = postgres(connectionString, {
    connect_timeout: options.connectTimeoutSeconds ?? 10,
    connection: {
      application_name: options.applicationName ?? "glyphkiln-app",
    },
    idle_timeout: options.idleTimeoutSeconds ?? 20,
    max: options.maxConnections ?? 10,
    prepare: true,
    ...(options.ssl === undefined ? {} : { ssl: options.ssl }),
  });

  return new PostgresDatabase(client);
}
