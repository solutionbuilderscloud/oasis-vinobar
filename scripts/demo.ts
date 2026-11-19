// Dados de DEMONSTRAÇÃO: rótulos reais, mas preços, custos, estoques, despesas e eventos inventados.
// Para limpar: apague data/oasis.db e rode `pnpm db:setup`.
import { eq, sql } from "drizzle-orm";
import { createDb } from "../src/db/client.ts";
import { customers, eventWines, users, events, expenses, regions, sales, suppliers, stockMovements, wines } from "../src/db/schema.ts";
import { addDays, todayKey } from "../src/lib/dates.ts";
import { createSale } from "../src/lib/checkout.ts";
import { concludeEvent } from "../src/lib/events.ts";
import { applyMovement, createWine, parseWineInput } from "../src/lib/stock.ts";

const db = createDb();
const empty = async (table: typeof wines | typeof expenses | typeof events | typeof suppliers | typeof sales) => (await db.select({ id: table.id }).from(table).limit(1)).length === 0;

// região | nome | produtor | sub-região | uva | safra | tipo | preço US$ | estoque | mínimo
const DATA = `
Itália|Tignanello|Marchesi Antinori|Toscana|Sangiovese|2020|tinto|165|8|4
Itália|Barolo Cannubi|Marchesi di Barolo|Piemonte|Nebbiolo|2018|tinto|95|6|4
Itália|Brunello di Montalcino|Castello Banfi|Toscana|Sangiovese|2018|tinto|78|11|6
Itália|Amarone Costasera|Masi|Vêneto|Corvina|2018|tinto|72|3|6
Itália|Prosecco Superiore Crede|Bisol|Vêneto|Glera||espumante|24|30|12
Itália|Pinot Grigio|Santa Margherita|Alto Adige|Pinot Grigio|2023|branco|26|18|8
Espanha|Valbuena 5º|Vega Sicilia|Ribera del Duero|Tempranillo|2018|tinto|210|4|3
Espanha|Reserva|Marqués de Riscal|Rioja|Tempranillo|2019|tinto|32|22|10
Espanha|Crianza|Tinto Pesquera|Ribera del Duero|Tempranillo|2020|tinto|38|14|8
Espanha|Reserva Selección|Bodegas Muga|Rioja|Tempranillo|2019|tinto|36|2|8
Espanha|Albariño|Martín Códax|Rías Baixas|Albariño|2023|branco|22|16|8
Espanha|Reserva de la Familia|Juvé & Camps|Penedès|Xarel·lo||espumante|28|20|8
França|Château Lynch-Bages|Château Lynch-Bages|Pauillac|Cabernet Sauvignon|2017|tinto|190|5|3
França|Chablis|William Fèvre|Borgonha|Chardonnay|2022|branco|42|12|6
França|Châteauneuf-du-Pape|E. Guigal|Rhône|Grenache|2019|tinto|68|9|5
França|Brut Yellow Label|Veuve Clicquot|Champagne|Pinot Noir||espumante|75|24|10
França|Whispering Angel|Château d'Esclans|Provence|Grenache|2023|rosé|29|15|8
França|Château Guiraud|Château Guiraud|Sauternes|Sémillon|2016|sobremesa|58|1|3
Argentina|Malbec Argentino|Catena Zapata|Mendoza|Malbec|2020|tinto|120|7|4
Argentina|Angélica Zapata Malbec Alta|Catena Zapata|Mendoza|Malbec|2019|tinto|42|19|10
Argentina|Cabernet-Malbec|Rutini|Mendoza|Cabernet Sauvignon|2020|tinto|24|26|12
Argentina|El Enemigo Malbec|Aleanna|Mendoza|Malbec|2020|tinto|30|5|10
Argentina|DOC Malbec|Luigi Bosca|Luján de Cuyo|Malbec|2021|tinto|26|21|10
Argentina|Crios Torrontés|Susana Balbo|Salta|Torrontés|2023|branco|14|17|8
Chile|Almaviva|Viña Almaviva|Puente Alto|Cabernet Sauvignon|2020|tinto|185|6|3
Chile|Don Melchor|Concha y Toro|Puente Alto|Cabernet Sauvignon|2020|tinto|140|8|4
Chile|Montes Alpha Cabernet|Viña Montes|Colchagua|Cabernet Sauvignon|2021|tinto|22|34|12
Chile|Casillero del Diablo Carménère|Concha y Toro|Valle Central|Carménère|2022|tinto|10|48|24
Chile|Clos Apalta|Lapostolle|Colchagua|Carménère|2019|tinto|160|2|3
Chile|Sauvignon Blanc|Amayna|Leyda|Sauvignon Blanc|2022|branco|24|13|6
África do Sul|Pinotage|Kanonkop|Stellenbosch|Pinotage|2020|tinto|45|10|6
África do Sul|Rubicon|Meerlust|Stellenbosch|Cabernet Sauvignon|2018|tinto|48|7|4
África do Sul|Old Vine Reserve Chenin Blanc|Ken Forrester|Stellenbosch|Chenin Blanc|2022|branco|18|14|8
África do Sul|The Chocolate Block|Boekenhoutskloof|Swartland|Syrah|2021|tinto|36|4|6
Napa Valley|Opus One|Opus One Winery|Oakville|Cabernet Sauvignon|2019|tinto|420|3|2
Napa Valley|Cabernet Sauvignon|Caymus Vineyards|Rutherford|Cabernet Sauvignon|2021|tinto|98|9|5
Napa Valley|Artemis|Stag's Leap Wine Cellars|Stags Leap|Cabernet Sauvignon|2020|tinto|78|6|4
Napa Valley|Napa Cabernet Sauvignon|Robert Mondavi|Oakville|Cabernet Sauvignon|2020|tinto|45|15|8
Napa Valley|Chardonnay|Rombauer|Carneros|Chardonnay|2022|branco|46|11|6
Austrália|Bin 389|Penfolds|South Australia|Cabernet Sauvignon|2020|tinto|72|10|5
Austrália|Bin 28 Shiraz|Penfolds|South Australia|Shiraz|2020|tinto|38|16|8
Austrália|The Signature|Yalumba|Barossa|Cabernet Sauvignon|2018|tinto|58|5|4
Austrália|The Dead Arm Shiraz|d'Arenberg|McLaren Vale|Shiraz|2018|tinto|62|1|4
Austrália|Reserve Shiraz|Jacob's Creek|Barossa|Shiraz|2021|tinto|16|28|12
`.trim().split("\n");

// gerador determinístico: a demonstração sai igual toda vez
let seed = 7;
const rnd = (n: number) => (seed = (seed * 16807) % 2147483647) % n;
const daysAgo = (d: number) => sql`unixepoch() - ${d * 86400 + rnd(36000)}`;

if (await empty(wines)) {
  const regionId = new Map((await db.select().from(regions)).map((r) => [r.name, r.id]));

  for (const line of DATA) {
    const [region, name, producer, subregion, grape, vintage, type, price, stock, minStock] = line.split("|");
    const input = parseWineInput(
      { name, producer, subregion, grape, vintage, type, price, minStock, cost: String(Math.round(Number(price) * (50 + rnd(18))) / 100) },
      regionId.get(region),
    );
    // entra com folga, vende ao longo de 14 dias e termina no estoque da tabela
    const sold = 2 + rnd(9);
    const id = await createWine(db, input, Number(stock) + sold, null);
    await db.update(stockMovements).set({ createdAt: daysAgo(14 + rnd(10)) }).where(eq(stockMovements.wineId, id));
    let left = sold;
    while (left > 0) {
      const qty = Math.min(left, 1 + rnd(3));
      await applyMovement(db, { wineId: id, type: "saida", qty, note: "Venda (demonstração)", userId: null });
      const [last] = await db.select({ id: stockMovements.id }).from(stockMovements).orderBy(sql`id desc`).limit(1);
      await db.update(stockMovements).set({ createdAt: daysAgo(rnd(14)) }).where(eq(stockMovements.id, last.id));
      left -= qty;
    }
    if (rnd(4) === 0) {
      await applyMovement(db, { wineId: id, type: "entrada", qty: 6, note: "Reposição (demonstração)", userId: null });
      const [last] = await db.select({ id: stockMovements.id }).from(stockMovements).orderBy(sql`id desc`).limit(1);
      await db.update(stockMovements).set({ createdAt: daysAgo(rnd(14)) }).where(eq(stockMovements.id, last.id));
      await applyMovement(db, { wineId: id, type: "saida", qty: 6, note: "Venda (demonstração)", userId: null });
      const [last2] = await db.select({ id: stockMovements.id }).from(stockMovements).orderBy(sql`id desc`).limit(1);
      await db.update(stockMovements).set({ createdAt: daysAgo(rnd(3)) }).where(eq(stockMovements.id, last2.id));
    }
  }
  console.log(`${DATA.length} vinhos de demonstração carregados.`);
}

const today = todayKey();
if (await empty(expenses)) {
  // dias atrás | categoria | descrição | moeda | valor em centavos | em dólar (câmbio de exemplo 7500 e 5,50)
  const rows: [number, (typeof expenses.$inferInsert)["category"], string, "USD" | "PYG" | "BRL", number][] = [
    [18, "aluguel", "Aluguel da loja", "USD", 1800_00], [17, "folha", "Salários da equipe", "PYG", 21_000_000_00],
    [15, "energia e água", "Conta de luz", "PYG", 2_250_000_00], [12, "marketing", "Anúncios no Instagram", "BRL", 1_100_00],
    [10, "frete e importação", "Frete do lote da Argentina", "USD", 640_00], [8, "manutenção", "Conserto da adega climatizada", "PYG", 1_500_000_00],
    [6, "impostos", "Impostos do mês", "PYG", 4_500_000_00], [3, "outros", "Taças e material de degustação", "USD", 210_00],
    [48, "aluguel", "Aluguel da loja", "USD", 1800_00], [47, "folha", "Salários da equipe", "PYG", 21_000_000_00],
    [44, "energia e água", "Conta de luz", "PYG", 1_950_000_00], [40, "marketing", "Anúncios no Instagram", "BRL", 800_00],
  ];
  await db.insert(expenses).values(rows.map(([ago, category, description, currency, amountCents]) => ({
    day: addDays(today, -ago), category, description, currency, amountCents,
    usdCents: Math.round(amountCents / (currency === "USD" ? 1 : currency === "PYG" ? 7500 : 5.5)),
  })));
  console.log(`${rows.length} despesas de demonstração carregadas.`);
}

if (await empty(events)) {
  const pick = async (name: string) => (await db.select({ id: wines.id }).from(wines).where(eq(wines.name, name)))[0]?.id;
  const make = async (e: typeof events.$inferInsert, served: [string, number][]) => {
    const [{ id }] = await db.insert(events).values(e).returning({ id: events.id });
    for (const [name, qty] of served) {
      const wineId = await pick(name);
      if (wineId) await db.insert(eventWines).values({ eventId: id, wineId, qty });
    }
    return id;
  };
  const past = await make({ name: "Noite de Malbec", day: addDays(today, -9), time: "20:00", capacity: 24, ticketCents: 45_00, ticketsSold: 22 },
    [["Angélica Zapata Malbec Alta", 4], ["DOC Malbec", 4], ["Cabernet-Malbec", 3]]);
  await concludeEvent(db, past, null);
  await make({ name: "Itália de norte a sul", day: addDays(today, 8), time: "19:30", capacity: 20, ticketCents: 60_00, ticketsSold: 13 },
    [["Prosecco Superiore Crede", 3], ["Brunello di Montalcino", 3], ["Barolo Cannubi", 2]]);
  await make({ name: "Espumantes de fim de ano", day: addDays(today, 30), time: "20:00", capacity: 30, ticketCents: 55_00, ticketsSold: 4 },
    [["Brut Yellow Label", 6], ["Reserva de la Familia", 6]]);
  console.log("3 eventos de demonstração carregados.");
}

if (await empty(suppliers)) {
  await db.insert(suppliers).values([
    { name: "Importadora del Este", country: "Paraguai", contact: "Ramón Benítez", phone: "+595 61 500 100", email: "pedidos@importadoradeleste.example", leadDays: 7, notes: "Pedido mínimo de 24 garrafas" },
    { name: "Vinos Andinos", country: "Argentina", contact: "Lucía Ferreyra", phone: "+54 261 555 0142", email: "ventas@vinosandinos.example", leadDays: 14, notes: "Paga em 30 dias" },
    { name: "Mediterranea Wines", country: "Itália", contact: "Paolo Conti", phone: "+39 055 555 019", email: "export@mediterranea.example", leadDays: 45, notes: "Contêiner consolidado, pedir com antecedência" },
  ]);
  console.log("3 fornecedores de demonstração carregados.");
}

if (await empty(sales)) {
  const people = await db.insert(customers).values([
    { name: "Mariana Costa", country: "Brasil", document: "passaporte", phone: "+55 45 99999-0101", notes: "Gosta de Malbec" },
    { name: "Carlos Giménez", country: "Paraguai", phone: "+595 981 555 010", notes: "Compra para o restaurante" },
    { name: "Rafael Almeida", country: "Brasil", notes: "Espumantes para presente" },
  ]).returning({ id: customers.id });
  const stocked = await db.select({ id: wines.id }).from(wines).where(sql`${wines.stock} >= 6`);
  const env = { ivaPercent: 10, rates: { pyg: 7500, brl: 5.5 } };
  const methods = ["dinheiro", "cartão", "pix", "cartão", "dinheiro", "transferência"] as const, currencies = ["USD", "BRL", "PYG", "BRL"] as const;
  for (let i = 0; i < 9; i++) {
    const first = stocked[rnd(stocked.length)].id, second = stocked[rnd(stocked.length)].id;
    await createSale(db, {
      items: first === second ? [{ wineId: first, qty: 1 }] : [{ wineId: first, qty: 1 + rnd(2) }, { wineId: second, qty: 1 }],
      register: 1 + (i % 3), tourist: i % 2 === 0, discountPercent: i === 4 ? 10 : 0,
      currency: currencies[i % 4], method: methods[i % 6], customerId: i % 3 === 0 ? people[(i / 3) % 3].id : null,
    }, env, null);
  }
  console.log("9 vendas de caixa e 3 clientes de demonstração carregados.");
}

if ((await db.select({ id: sales.id }).from(sales).where(sql`${sales.kind} <> 'venda'`).limit(1)).length === 0) {
  const [boss] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  const people = await db.select().from(customers);
  const stocked = await db.select({ id: wines.id }).from(wines).where(sql`${wines.stock} >= 8`);
  const env = { ivaPercent: 10, rates: { pyg: 7500, brl: 5.5 } };
  const base = { register: 1, tourist: false, discountPercent: 0, currency: "USD", method: "dinheiro" } as const;
  if (boss && people.length >= 2 && stocked.length >= 4) {
    await db.update(customers).set({ barterLimitCents: 400_00, notes: "Fotógrafa: permuta pelas fotos da loja" }).where(eq(customers.id, people[0].id));
    await db.update(customers).set({ barterLimitCents: 150_00, notes: "Técnico do ar-condicionado" }).where(eq(customers.id, people[1].id));
    await db.update(sales).set({ userId: boss.id }).where(sql`${sales.userId} is null`);
    await createSale(db, { ...base, items: [{ wineId: stocked[0].id, qty: 2 }], customerId: people[0].id, kind: "permuta", note: "Fotos do cardápio novo" }, env, boss.id, boss.id);
    await createSale(db, { ...base, items: [{ wineId: stocked[1].id, qty: 1 }, { wineId: stocked[2].id, qty: 1 }], customerId: people[1].id, kind: "permuta", note: "Manutenção da adega climatizada" }, env, boss.id, boss.id);
    await createSale(db, { ...base, items: [{ wineId: stocked[3].id, qty: 1 }], customerId: null, kind: "bonificação", note: "Cortesia para cliente antigo" }, env, boss.id, boss.id);
    console.log("2 permutas e 1 bonificação de demonstração carregadas.");
  }
}
