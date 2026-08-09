import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SqlTransaction } from "./database";
import { createPostgresDatabase } from "./postgres-database";

const postgresMock = vi.hoisted(() => vi.fn());

vi.mock("postgres", () => ({
  default: postgresMock,
}));

function createClient() {
  const unsafe = vi.fn();
  const transactionUnsafe = vi.fn();
  const transactionClient = { unsafe: transactionUnsafe };
  const begin = vi.fn(
    async (
      operation: (client: typeof transactionClient) => Promise<unknown>,
    ): Promise<unknown> => operation(transactionClient),
  );
  const end = vi.fn(() => Promise.resolve());
  return {
    begin,
    end,
    transactionUnsafe,
    unsafe,
  };
}

describe("PostgreSQL database adapter", () => {
  beforeEach(() => {
    postgresMock.mockReset();
  });

  it("rejects an empty connection string before opening a client", () => {
    expect(() => createPostgresDatabase("   ")).toThrow(
      "A non-empty PostgreSQL connection string is required.",
    );
    expect(postgresMock).not.toHaveBeenCalled();
  });

  it("uses secure bounded defaults when creating the PostgreSQL client", () => {
    const client = createClient();
    postgresMock.mockReturnValue(client);

    createPostgresDatabase("postgresql://runtime@database/glyphkiln");

    expect(postgresMock).toHaveBeenCalledWith(
      "postgresql://runtime@database/glyphkiln",
      {
        connect_timeout: 10,
        connection: {
          application_name: "glyphkiln-app",
        },
        idle_timeout: 20,
        max: 10,
        prepare: true,
      },
    );
  });

  it("passes explicit connection policy to the PostgreSQL client", () => {
    const client = createClient();
    postgresMock.mockReturnValue(client);

    createPostgresDatabase("postgresql://worker@database/glyphkiln", {
      applicationName: "glyphkiln-worker",
      connectTimeoutSeconds: 4,
      idleTimeoutSeconds: 7,
      maxConnections: 3,
      ssl: "verify-full",
    });

    expect(postgresMock).toHaveBeenCalledWith(
      "postgresql://worker@database/glyphkiln",
      {
        connect_timeout: 4,
        connection: {
          application_name: "glyphkiln-worker",
        },
        idle_timeout: 7,
        max: 3,
        prepare: true,
        ssl: "verify-full",
      },
    );
  });

  it("binds copied query parameters and returns ordinary row arrays", async () => {
    const client = createClient();
    const storedRows = [{ value: "inert" }];
    client.unsafe.mockResolvedValue(storedRows);
    postgresMock.mockReturnValue(client);
    const database = createPostgresDatabase("postgresql://runtime@database/glyphkiln");
    const parameters = ["'); DROP TABLE designs; --"] as const;

    const rows = await database.query<{ value: string }>(
      "SELECT value FROM records WHERE value = $1",
      parameters,
    );

    expect(client.unsafe).toHaveBeenCalledWith(
      "SELECT value FROM records WHERE value = $1",
      [...parameters],
    );
    expect(rows).toEqual(storedRows);
    expect(rows).not.toBe(storedRows);

    client.unsafe.mockResolvedValue([]);
    await database.query("SELECT 1");
    expect(client.unsafe).toHaveBeenLastCalledWith("SELECT 1", []);
  });

  it("passes structured JSON parameters through without stringifying them", async () => {
    const client = createClient();
    client.unsafe.mockResolvedValue([]);
    postgresMock.mockReturnValue(client);
    const database = createPostgresDatabase("postgresql://runtime@database/glyphkiln");
    const structured = { name: "Bound JSON", nested: { enabled: true } };

    await database.query("SELECT $1::jsonb", [structured]);

    expect(client.unsafe).toHaveBeenCalledWith("SELECT $1::jsonb", [structured]);
  });

  it("runs operations against the transaction-scoped executor", async () => {
    const client = createClient();
    client.transactionUnsafe.mockResolvedValue([{ value: "inside" }]);
    postgresMock.mockReturnValue(client);
    const database = createPostgresDatabase("postgresql://runtime@database/glyphkiln");

    const result = await database.transaction(async (transaction: SqlTransaction) => {
      await expect(
        transaction.query<{ value: string }>(
          "SELECT value FROM records WHERE id = $1",
          ["record-1"],
        ),
      ).resolves.toEqual([{ value: "inside" }]);
      return "committed";
    });

    expect(result).toBe("committed");
    expect(client.begin).toHaveBeenCalledOnce();
    expect(client.transactionUnsafe).toHaveBeenCalledWith(
      "SELECT value FROM records WHERE id = $1",
      ["record-1"],
    );
    expect(client.unsafe).not.toHaveBeenCalled();
  });

  it("propagates transaction failures", async () => {
    const client = createClient();
    postgresMock.mockReturnValue(client);
    const database = createPostgresDatabase("postgresql://runtime@database/glyphkiln");

    await expect(
      database.transaction(() => Promise.reject(new Error("abort"))),
    ).rejects.toThrow("abort");
  });

  it("closes the pool with a bounded shutdown timeout", async () => {
    const client = createClient();
    postgresMock.mockReturnValue(client);
    const database = createPostgresDatabase("postgresql://runtime@database/glyphkiln");

    await database.close();

    expect(client.end).toHaveBeenCalledWith({ timeout: 5 });
  });
});
