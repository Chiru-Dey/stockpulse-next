type Schema = Record<string, unknown>;

function json(schema: unknown) {
  return { content: { "application/json": { schema } } };
}

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

function errorSchema(code: string, message: string): Schema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["error"],
    properties: {
      error: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message"],
        properties: {
          code: { type: "string", example: code },
          message: { type: "string", example: message },
        },
      },
    },
  };
}

function resp(status: number, code: string, message: string) {
  return { [status]: { description: message, ...json(errorSchema(code, message)) } };
}

function ok200(schema: unknown, description = "Success") {
  return { 200: { description, ...json(schema) } };
}

function created(schema: unknown) {
  return { 201: { description: "Created", ...json(schema) } };
}

function noContent() {
  return { 204: { description: "No content" } };
}

const badRequest = (message: string) => resp(400, "VALIDATION_ERROR", message);
const unauthorized = () => resp(401, "UNAUTHORIZED", "Authentication required");
const forbidden = () => resp(403, "FORBIDDEN", "Admin role required");

const AUTH = [{ bearerAuth: [] as never[] }, { cookieAuth: [] as never[] }];

const pageParams = [
  { $ref: "#/components/parameters/Page" },
  { $ref: "#/components/parameters/PerPage" },
];

function paginated(itemRef: string): Schema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["items", "total", "page", "per_page", "pages"],
    properties: {
      items: { type: "array", items: ref(itemRef) },
      total: { type: "integer", minimum: 0 },
      page: { type: "integer", minimum: 1 },
      per_page: { type: "integer", minimum: 1, maximum: 100 },
      pages: { type: "integer", minimum: 1 },
    },
  };
}

const dateTime = { type: "string", format: "date-time" };

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "StockPulse API",
    version: "1.0.0",
    description:
      "Retail inventory dashboard API: immutable stock ledger, RBAC (admin/staff), " +
      "low-stock alerts and a daily digest. JSON keys are snake_case; errors are " +
      '{ "error": { "code", "message" } }; lists are { items, total, page, per_page, pages }.',
  },
  servers: [{ url: "/", description: "Current deployment" }],
  tags: [
    { name: "auth", description: "Registration, login, refresh, logout, current session" },
    { name: "users", description: "Admin-only user management" },
    { name: "categories", description: "Product categories" },
    { name: "products", description: "Products and soft-archive" },
    { name: "movements", description: "Immutable IN/OUT stock ledger" },
    { name: "dashboard", description: "Aggregated summary and 7-day trend" },
    { name: "ops", description: "Health, OpenAPI document, scheduled digest" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token (15 min). Also accepted for PowerShell demos.",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "sp_access",
        description: "httpOnly SameSite=Lax session cookie set by /api/auth/login.",
      },
    },
    parameters: {
      Page: {
        name: "page",
        in: "query",
        required: false,
        description: "1-based page number.",
        schema: { type: "integer", minimum: 1, default: 1 },
      },
      PerPage: {
        name: "per_page",
        in: "query",
        required: false,
        description: "Page size (capped at 100).",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      Id: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "integer", minimum: 1 },
      },
    },
    schemas: {
      Error: errorSchema("EXAMPLE_CODE", "Human-readable message"),
      User: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "email", "role", "is_active", "created_at", "updated_at"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["admin", "staff"] },
          is_active: { type: "boolean" },
          created_at: dateTime,
          updated_at: dateTime,
        },
      } satisfies Schema,
      Category: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "description", "created_at", "updated_at"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          created_at: dateTime,
          updated_at: dateTime,
        },
      } satisfies Schema,
      Product: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "sku", "name", "description", "category_id", "category_name",
          "low_stock_threshold", "stock_qty", "stock_status", "archived_at",
          "created_at", "updated_at",
        ],
        properties: {
          id: { type: "integer" },
          sku: { type: "string" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          category_id: { type: "integer" },
          category_name: { type: "string" },
          low_stock_threshold: { type: "integer", minimum: 0 },
          stock_qty: { type: "integer", minimum: 0 },
          stock_status: { type: "string", enum: ["ok", "low", "out"] },
          archived_at: { type: ["string", "null"], format: "date-time" },
          created_at: dateTime,
          updated_at: dateTime,
        },
      } satisfies Schema,
      Movement: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "product_id", "product_sku", "product_name", "movement_type",
          "quantity", "note", "created_by", "created_by_name", "created_by_email", "created_at",
        ],
        properties: {
          id: { type: "integer" },
          product_id: { type: "integer" },
          product_sku: { type: "string" },
          product_name: { type: "string" },
          movement_type: { type: "string", enum: ["IN", "OUT"] },
          quantity: { type: "integer", minimum: 1 },
          note: { type: ["string", "null"] },
          created_by: { type: "integer" },
          created_by_name: { type: "string" },
          created_by_email: { type: "string", format: "email" },
          created_at: dateTime,
        },
      } satisfies Schema,
      TrendPoint: {
        type: "object",
        additionalProperties: false,
        required: ["date", "in_qty", "out_qty"],
        properties: {
          date: { type: "string", format: "date" },
          in_qty: { type: "integer", minimum: 0 },
          out_qty: { type: "integer", minimum: 0 },
        },
      } satisfies Schema,
      DashboardSummary: {
        type: "object",
        additionalProperties: false,
        required: ["generated_at", "products", "stock_status", "movements", "categories", "low_stock", "recent_movements"],
        properties: {
          generated_at: dateTime,
          products: {
            type: "object",
            properties: {
              total: { type: "integer" },
              active: { type: "integer" },
              archived: { type: "integer" },
            },
          },
          stock_status: {
            type: "object",
            properties: {
              ok: { type: "integer" },
              low: { type: "integer" },
              out: { type: "integer" },
            },
          },
          movements: {
            type: "object",
            properties: {
              window_days: { type: "integer" },
              in_qty: { type: "integer" },
              out_qty: { type: "integer" },
              count: { type: "integer" },
              trend: { type: "array", items: ref("TrendPoint") },
            },
          },
          categories: {
            type: "object",
            properties: {
              total: { type: "integer" },
              breakdown: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category_id: { type: "integer" },
                    category_name: { type: "string" },
                    product_count: { type: "integer" },
                    low_stock_count: { type: "integer" },
                  },
                },
              },
            },
          },
          low_stock: { type: "array", items: ref("Product") },
          recent_movements: { type: "array", items: ref("Movement") },
        },
      } satisfies Schema,
      UserList: paginated("User"),
      CategoryList: paginated("Category"),
      ProductList: paginated("Product"),
      MovementList: paginated("Movement"),
      AuthSession: {
        type: "object",
        additionalProperties: false,
        required: ["user", "access_token", "token_type", "expires_in", "refresh_token"],
        properties: {
          user: ref("User"),
          access_token: { type: "string" },
          token_type: { type: "string", example: "Bearer" },
          expires_in: { type: "integer", example: 900 },
          refresh_token: { type: "string", description: "Opaque 64-hex token; rotated on every refresh." },
        },
      } satisfies Schema,
      RefreshSession: {
        type: "object",
        additionalProperties: false,
        required: ["access_token", "token_type", "expires_in", "refresh_token"],
        properties: {
          access_token: { type: "string" },
          token_type: { type: "string", example: "Bearer" },
          expires_in: { type: "integer", example: 900 },
          refresh_token: { type: "string" },
        },
      } satisfies Schema,
      LoginRequest: {
        type: "object",
        additionalProperties: false,
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      } satisfies Schema,
      RegisterRequest: {
        type: "object",
        additionalProperties: false,
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", maxLength: 120 },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8, maxLength: 72 },
        },
      } satisfies Schema,
      CreateUserRequest: {
        type: "object",
        additionalProperties: false,
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", maxLength: 120 },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8, maxLength: 72 },
          role: { type: "string", enum: ["admin", "staff"], default: "staff" },
        },
      } satisfies Schema,
      UpdateUserRequest: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          name: { type: "string", maxLength: 120 },
          password: { type: "string", minLength: 8, maxLength: 72 },
          role: { type: "string", enum: ["admin", "staff"] },
          is_active: { type: "boolean" },
        },
      } satisfies Schema,
      CreateCategoryRequest: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string", maxLength: 120 },
          description: { type: ["string", "null"], maxLength: 2000 },
        },
      } satisfies Schema,
      UpdateCategoryRequest: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          name: { type: "string", maxLength: 120 },
          description: { type: ["string", "null"], maxLength: 2000 },
        },
      } satisfies Schema,
      CreateProductRequest: {
        type: "object",
        additionalProperties: false,
        required: ["sku", "name", "category_id"],
        properties: {
          sku: { type: "string", maxLength: 64 },
          name: { type: "string", maxLength: 200 },
          description: { type: ["string", "null"], maxLength: 2000 },
          category_id: { type: "integer", minimum: 1 },
          low_stock_threshold: { type: "integer", minimum: 0, default: 5 },
        },
      } satisfies Schema,
      UpdateProductRequest: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          sku: { type: "string", maxLength: 64 },
          name: { type: "string", maxLength: 200 },
          description: { type: ["string", "null"], maxLength: 2000 },
          category_id: { type: "integer", minimum: 1 },
          low_stock_threshold: { type: "integer", minimum: 0 },
          archived: { type: "boolean", description: "true archives (soft delete), false restores." },
        },
      } satisfies Schema,
      CreateMovementRequest: {
        type: "object",
        additionalProperties: false,
        required: ["product_id", "movement_type", "quantity"],
        properties: {
          product_id: { type: "integer", minimum: 1 },
          movement_type: { type: "string", enum: ["IN", "OUT"] },
          quantity: { type: "integer", minimum: 1, maximum: 1000000 },
          note: { type: ["string", "null"], maxLength: 500 },
        },
      } satisfies Schema,
      HealthResponse: {
        type: "object",
        additionalProperties: false,
        required: ["status", "service", "db", "db_latency_ms", "time"],
        properties: {
          status: { type: "string", example: "ok" },
          service: { type: "string", example: "stockpulse-next" },
          db: { type: "string", example: "ok" },
          db_latency_ms: { type: "integer" },
          time: dateTime,
        },
      } satisfies Schema,
      CronDigestResponse: {
        type: "object",
        additionalProperties: false,
        required: ["ok", "generated_at", "reconcile", "digest"],
        properties: {
          ok: { type: "boolean" },
          generated_at: dateTime,
          reconcile: {
            type: "object",
            properties: {
              drifted: { type: "integer" },
              corrected: { type: "integer" },
              details: { type: "array", items: { type: "object" } },
            },
          },
          digest: {
            type: "object",
            properties: {
              items: { type: "integer" },
              out_of_stock: { type: "integer" },
              recipients: { type: "integer" },
              skipped: { type: "boolean", description: "true when Brevo is not configured." },
              message_id: { type: ["string", "null"] },
            },
          },
        },
      } satisfies Schema,
    },
  },
  paths: {
    "/api/auth/register": {
      post: {
        tags: ["auth"],
        summary: "Register a new staff account",
        operationId: "register",
        requestBody: { required: true, ...json(ref("RegisterRequest")) },
        responses: {
          ...created(ref("AuthSession")),
          ...badRequest("Validation failed"),
          ...resp(409, "EMAIL_EXISTS", "Email already registered"),
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["auth"],
        summary: "Log in and start a session",
        operationId: "login",
        requestBody: { required: true, ...json(ref("LoginRequest")) },
        responses: {
          ...ok200(ref("AuthSession")),
          ...badRequest("Validation failed"),
          ...resp(401, "INVALID_CREDENTIALS", "Email or password is incorrect"),
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["auth"],
        summary: "Rotate the refresh token and issue a new access token",
        operationId: "refresh",
        description: "Accepts the sp_refresh cookie or a refresh_token body field. Reusing a revoked token revokes every session for that user.",
        requestBody: { required: false, ...json({ type: "object", properties: { refresh_token: { type: "string" } } }) },
        responses: {
          ...ok200(ref("RefreshSession")),
          ...resp(401, "REFRESH_REUSED", "Refresh token reuse detected"),
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["auth"],
        summary: "Revoke the current refresh token and clear cookies",
        operationId: "logout",
        security: AUTH,
        responses: { ...noContent() },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["auth"],
        summary: "Current authenticated user",
        operationId: "me",
        security: AUTH,
        responses: {
          ...ok200({ type: "object", properties: { user: ref("User") } }),
          ...unauthorized(),
        },
      },
    },
    "/api/users": {
      get: {
        tags: ["users"],
        summary: "List users (admin)",
        operationId: "listUsers",
        security: AUTH,
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "role", in: "query", schema: { type: "string", enum: ["admin", "staff"] } },
          { name: "is_active", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          ...pageParams,
        ],
        responses: { ...ok200(ref("UserList")), ...unauthorized(), ...forbidden() },
      },
      post: {
        tags: ["users"],
        summary: "Create a user (admin)",
        operationId: "createUser",
        security: AUTH,
        requestBody: { required: true, ...json(ref("CreateUserRequest")) },
        responses: {
          ...created({ type: "object", properties: { user: ref("User") } }),
          ...badRequest("Validation failed"),
          ...resp(409, "EMAIL_EXISTS", "Email already registered"),
          ...unauthorized(), ...forbidden(),
        },
      },
    },
    "/api/users/{id}": {
      get: {
        tags: ["users"], summary: "Get one user (admin)", operationId: "getUser", security: AUTH,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          ...ok200({ type: "object", properties: { user: ref("User") } }),
          ...unauthorized(), ...forbidden(), ...resp(404, "USER_NOT_FOUND", "User not found"),
        },
      },
      patch: {
        tags: ["users"], summary: "Update a user (admin)", operationId: "updateUser", security: AUTH,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: { required: true, ...json(ref("UpdateUserRequest")) },
        responses: {
          ...ok200({ type: "object", properties: { user: ref("User") } }),
          ...badRequest("Validation failed"),
          ...resp(409, "CANNOT_MODIFY_SELF", "You cannot change your own role or active status"),
          ...resp(409, "LAST_ADMIN", "Cannot remove the last active admin"),
          ...unauthorized(), ...forbidden(), ...resp(404, "USER_NOT_FOUND", "User not found"),
        },
      },
      delete: {
        tags: ["users"], summary: "Delete a user with no movements (admin)", operationId: "deleteUser", security: AUTH,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          ...noContent(),
          ...resp(409, "USER_HAS_MOVEMENTS", "User has stock movements; deactivate instead"),
          ...unauthorized(), ...forbidden(), ...resp(404, "USER_NOT_FOUND", "User not found"),
        },
      },
    },
    "/api/categories": {
      get: {
        tags: ["categories"], summary: "List categories", operationId: "listCategories", security: AUTH,
        parameters: [{ name: "search", in: "query", schema: { type: "string" } }, ...pageParams],
        responses: { ...ok200(ref("CategoryList")), ...unauthorized() },
      },
      post: {
        tags: ["categories"], summary: "Create a category (admin)", operationId: "createCategory", security: AUTH,
        requestBody: { required: true, ...json(ref("CreateCategoryRequest")) },
        responses: {
          ...created({ type: "object", properties: { category: ref("Category") } }),
          ...badRequest("Validation failed"),
          ...resp(409, "CATEGORY_NAME_EXISTS", "Name already used"),
          ...unauthorized(), ...forbidden(),
        },
      },
    },
    "/api/categories/{id}": {
      get: {
        tags: ["categories"], summary: "Get one category", operationId: "getCategory", security: AUTH,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          ...ok200({ type: "object", properties: { category: ref("Category") } }),
          ...unauthorized(), ...resp(404, "CATEGORY_NOT_FOUND", "Category not found"),
        },
      },
      patch: {
        tags: ["categories"], summary: "Update a category (admin)", operationId: "updateCategory", security: AUTH,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: { required: true, ...json(ref("UpdateCategoryRequest")) },
        responses: {
          ...ok200({ type: "object", properties: { category: ref("Category") } }),
          ...badRequest("Validation failed"),
          ...resp(409, "CATEGORY_NAME_EXISTS", "Name already used"),
          ...unauthorized(), ...forbidden(), ...resp(404, "CATEGORY_NOT_FOUND", "Category not found"),
        },
      },
      delete: {
        tags: ["categories"], summary: "Delete an unreferenced category (admin)", operationId: "deleteCategory", security: AUTH,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          ...noContent(),
          ...resp(409, "CATEGORY_IN_USE", "Products still reference this category"),
          ...unauthorized(), ...forbidden(), ...resp(404, "CATEGORY_NOT_FOUND", "Category not found"),
        },
      },
    },
    "/api/products": {
      get: {
        tags: ["products"], summary: "List products with filters", operationId: "listProducts", security: AUTH,
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "category_id", in: "query", schema: { type: "integer" } },
          { name: "stock_status", in: "query", schema: { type: "string", enum: ["ok", "low", "out"] } },
          { name: "include_archived", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          ...pageParams,
        ],
        responses: { ...ok200(ref("ProductList")), ...unauthorized() },
      },
      post: {
        tags: ["products"], summary: "Create a product (admin)", operationId: "createProduct", security: AUTH,
        requestBody: { required: true, ...json(ref("CreateProductRequest")) },
        responses: {
          ...created({ type: "object", properties: { product: ref("Product") } }),
          ...badRequest("Validation failed or unknown category_id"),
          ...resp(409, "SKU_EXISTS", "SKU already used"),
          ...unauthorized(), ...forbidden(),
        },
      },
    },
    "/api/products/{id}": {
      get: {
        tags: ["products"], summary: "Get one product", operationId: "getProduct", security: AUTH,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          ...ok200({ type: "object", properties: { product: ref("Product") } }),
          ...unauthorized(), ...resp(404, "PRODUCT_NOT_FOUND", "Product not found"),
        },
      },
      patch: {
        tags: ["products"], summary: "Update or archive/restore a product (admin)", operationId: "updateProduct", security: AUTH,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        requestBody: { required: true, ...json(ref("UpdateProductRequest")) },
        responses: {
          ...ok200({ type: "object", properties: { product: ref("Product") } }),
          ...badRequest("Validation failed or unknown category_id"),
          ...resp(409, "SKU_EXISTS", "SKU already used"),
          ...unauthorized(), ...forbidden(), ...resp(404, "PRODUCT_NOT_FOUND", "Product not found"),
        },
      },
      delete: {
        tags: ["products"], summary: "Archive a product (soft delete, admin)", operationId: "archiveProduct", security: AUTH,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: { ...noContent(), ...unauthorized(), ...forbidden(), ...resp(404, "PRODUCT_NOT_FOUND", "Product not found") },
      },
    },
    "/api/stock-movements": {
      get: {
        tags: ["movements"], summary: "List the immutable ledger", operationId: "listMovements", security: AUTH,
        parameters: [
          { name: "product_id", in: "query", schema: { type: "integer" } },
          { name: "movement_type", in: "query", schema: { type: "string", enum: ["IN", "OUT"] } },
          { name: "date_from", in: "query", schema: { type: "string", format: "date" } },
          { name: "date_to", in: "query", schema: { type: "string", format: "date" } },
          ...pageParams,
        ],
        responses: { ...ok200(ref("MovementList")), ...unauthorized() },
      },
      post: {
        tags: ["movements"],
        summary: "Record an IN/OUT movement (transactional)",
        operationId: "createMovement",
        security: AUTH,
        description: "Runs in a DB transaction with SELECT … FOR UPDATE on the product row; rejects OUT that would drive stock negative.",
        requestBody: { required: true, ...json(ref("CreateMovementRequest")) },
        responses: {
          ...created({ type: "object", properties: { movement: ref("Movement") } }),
          ...badRequest("Validation failed"),
          ...resp(409, "INSUFFICIENT_STOCK", "OUT exceeds available balance"),
          ...resp(409, "PRODUCT_ARCHIVED", "Movements blocked on archived products"),
          ...unauthorized(), ...resp(404, "PRODUCT_NOT_FOUND", "Product not found"),
        },
      },
    },
    "/api/stock-movements/{id}": {
      get: {
        tags: ["movements"], summary: "Get one ledger row", operationId: "getMovement", security: AUTH,
        parameters: [{ $ref: "#/components/parameters/Id" }],
        responses: {
          ...ok200({ type: "object", properties: { movement: ref("Movement") } }),
          ...unauthorized(), ...resp(404, "MOVEMENT_NOT_FOUND", "Movement not found"),
        },
      },
    },
    "/api/dashboard/summary": {
      get: {
        tags: ["dashboard"], summary: "Totals, stock-status counts, 7-day trend, watchlist", operationId: "dashboardSummary", security: AUTH,
        responses: { ...ok200(ref("DashboardSummary")), ...unauthorized() },
      },
    },
    "/api/health": {
      get: {
        tags: ["ops"], summary: "Liveness + DB ping", operationId: "health",
        responses: { ...ok200(ref("HealthResponse")), ...resp(503, "DB_UNREACHABLE", "Database ping failed") },
      },
    },
    "/api/openapi": {
      get: {
        tags: ["ops"], summary: "This OpenAPI 3.1 document", operationId: "openapi",
        responses: { ...ok200({ type: "object" }) },
      },
    },
    "/api/cron/low-stock-digest": {
      get: {
        tags: ["ops"],
        summary: "Daily digest + cached-balance reconciliation (Vercel Cron)",
        operationId: "cronDigest",
        description: "Guarded by CRON_SECRET via Authorization: Bearer or x-cron-secret header.",
        parameters: [
          { name: "x-cron-secret", in: "header", required: false, schema: { type: "string" } },
        ],
        responses: {
          ...ok200(ref("CronDigestResponse")),
          ...resp(401, "UNAUTHORIZED", "Missing or wrong cron secret"),
          ...resp(503, "CRON_NOT_CONFIGURED", "CRON_SECRET not set"),
        },
      },
    },
  },
};