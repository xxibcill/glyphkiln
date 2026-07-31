export type SqlJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly SqlJsonValue[]
  | { readonly [key: string]: SqlJsonValue | undefined };

export type SqlParameter = SqlJsonValue | Date | Uint8Array;

/**
 * Values are always bound separately from the SQL statement. Identifiers and
 * SQL fragments are deliberately not parameters and must remain
 * application-owned static text.
 */
export type SqlParameters = readonly SqlParameter[];

export type SqlRow = Record<string, unknown>;

export type SqlTransaction = {
  query<Row extends SqlRow = SqlRow>(
    statement: string,
    parameters?: SqlParameters,
  ): Promise<Row[]>;
};

export type SqlDatabase = SqlTransaction & {
  transaction<Result>(
    operation: (transaction: SqlTransaction) => Promise<Result>,
  ): Promise<Result>;

  close(): Promise<void>;
};
