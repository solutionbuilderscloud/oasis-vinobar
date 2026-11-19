import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const ROLES = ["admin", "gerente", "caixa"] as const;
export type Role = (typeof ROLES)[number];

export const WINE_TYPES = ["tinto", "branco", "rosé", "espumante", "sobremesa", "fortificado"] as const;
// saida = venda; evento e perda também baixam o estoque, mas não contam como venda
// bonificação e permuta saem pelo caixa, sem cobrança
export const MOVEMENT_TYPES = ["entrada", "saida", "ajuste", "evento", "perda", "bonificação", "permuta"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const EXPENSE_CATEGORIES = ["aluguel", "folha", "energia e água", "impostos", "marketing", "manutenção", "frete e importação", "outros"] as const;
export const CURRENCIES = ["USD", "PYG", "BRL"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const PAYMENT_METHODS = ["dinheiro", "cartão", "pix", "transferência"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
// venda cobra; bonificação é cortesia; permuta é retirada trocada por serviço ou produto
export const SALE_KINDS = ["venda", "bonificação", "permuta"] as const;
export type SaleKind = (typeof SALE_KINDS)[number];
export const REGISTERS = [1, 2, 3] as const;
export const EVENT_STATUS = ["planejado", "realizado", "cancelado"] as const;

const now = sql`(unixepoch())`;

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ROLES }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const sessions = sqliteTable("sessions", {
  // sha256 do token; o token em si só existe no cookie
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const regions = sqliteTable("regions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const wines = sqliteTable("wines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemNumber: integer("item_number").notNull().unique(),
  barcode: text("barcode").unique(),
  name: text("name").notNull(),
  producer: text("producer").notNull().default(""),
  regionId: integer("region_id").notNull().references(() => regions.id),
  subregion: text("subregion").notNull().default(""),
  grape: text("grape").notNull().default(""),
  vintage: integer("vintage"),
  type: text("type", { enum: WINE_TYPES }).notNull().default("tinto"),
  // dinheiro sempre em centavos de dólar
  priceCents: integer("price_cents").notNull(),
  costCents: integer("cost_cents").notNull().default(0),
  stock: integer("stock").notNull().default(0),
  minStock: integer("min_stock").notNull().default(0),
  // arquivo em data/fotos, servido por /fotos/<arquivo>; crédito é autor e licença quando a foto não é da loja
  photo: text("photo"),
  photoCredit: text("photo_credit").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
});

export const stockMovements = sqliteTable("stock_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  wineId: integer("wine_id").notNull().references(() => wines.id),
  type: text("type", { enum: MOVEMENT_TYPES }).notNull(),
  // variação aplicada ao estoque (negativa em saídas)
  delta: integer("delta").notNull(),
  stockAfter: integer("stock_after").notNull(),
  note: text("note").notNull().default(""),
  userId: integer("user_id").references(() => users.id),
  // só em vendas do caixa: valor efetivamente pago e custo por garrafa naquele momento
  saleId: integer("sale_id").references(() => sales.id),
  unitPriceCents: integer("unit_price_cents"),
  unitCostCents: integer("unit_cost_cents"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // dia no fuso da loja, "AAAA-MM-DD"
  day: text("day").notNull(),
  category: text("category", { enum: EXPENSE_CATEGORIES }).notNull(),
  description: text("description").notNull().default(""),
  currency: text("currency", { enum: CURRENCIES }).notNull(),
  // valor como foi pago, em centavos da moeda original
  amountCents: integer("amount_cents").notNull(),
  // convertido para dólar pelo câmbio do dia do lançamento
  usdCents: integer("usd_cents").notNull(),
  userId: integer("user_id").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  day: text("day").notNull(),
  time: text("time").notNull().default(""),
  capacity: integer("capacity").notNull().default(0),
  ticketCents: integer("ticket_cents").notNull().default(0),
  ticketsSold: integer("tickets_sold").notNull().default(0),
  notes: text("notes").notNull().default(""),
  status: text("status", { enum: EVENT_STATUS }).notNull().default("planejado"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const eventWines = sqliteTable("event_wines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull().references(() => events.id),
  wineId: integer("wine_id").notNull().references(() => wines.id),
  qty: integer("qty").notNull(),
});

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  document: text("document").notNull().default(""),
  country: text("country").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  notes: text("notes").notNull().default(""),
  // permuta: valor combinado que a pessoa pode retirar em vinhos, a preço de prateleira
  barterLimitCents: integer("barter_limit_cents").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  country: text("country").notNull().default(""),
  contact: text("contact").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  leadDays: integer("lead_days").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // dia no fuso da loja, "AAAA-MM-DD"
  day: text("day").notNull(),
  register: integer("register").notNull(),
  userId: integer("user_id").references(() => users.id),
  customerId: integer("customer_id").references(() => customers.id),
  kind: text("kind", { enum: SALE_KINDS }).notNull().default("venda"),
  // motivo da bonificação ou permuta
  note: text("note").notNull().default(""),
  // responsável que liberou desconto, bonificação ou permuta com a senha
  authorizedBy: integer("authorized_by").references(() => users.id),
  // turista estrangeiro: venda sem IVA
  tourist: integer("tourist", { mode: "boolean" }).notNull().default(false),
  method: text("method", { enum: PAYMENT_METHODS }).notNull(),
  currency: text("currency", { enum: CURRENCIES }).notNull(),
  // tudo em centavos de dólar; paidCents é o total na moeda paga, pelo câmbio da hora
  subtotalCents: integer("subtotal_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  paidCents: integer("paid_cents").notNull(),
  status: text("status", { enum: ["concluida", "cancelada"] }).notNull().default("concluida"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
});

export const saleItems = sqliteTable("sale_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id").notNull().references(() => sales.id),
  wineId: integer("wine_id").notNull().references(() => wines.id),
  qty: integer("qty").notNull(),
  // preço de tabela e custo da garrafa no momento da venda
  priceCents: integer("price_cents").notNull(),
  costCents: integer("cost_cents").notNull(),
});

// câmbio cravado por dia: todas as vendas do dia usam a mesma cotação
export const dailyRates = sqliteTable("daily_rates", {
  day: text("day").primaryKey(),
  pyg: real("pyg").notNull(),
  brl: real("brl").notNull(),
  // "automático", "manual" ou "último conhecido" (quando a fonte automática falhou)
  source: text("source").notNull(),
});
