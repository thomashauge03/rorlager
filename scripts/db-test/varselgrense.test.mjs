// Tester standard varselgrense (20261019130000_standard_varselgrense.sql):
// standardane, at negative tal blir avviste, at kundeflyten ikkje ser dei,
// og at ei endring står i revisjonssporet.

import { byggBase, som, lagFasit } from "./base.mjs";

const KONTOR = { epost: "thomashauge03@gmail.com", uid: "11111111-1111-1111-1111-111111111111" };

const { tilstand, ok, nei, sjekk } = lagFasit();
const db = await byggBase();
const en = async (sql, p) => (await db.query(sql, p)).rows[0];
const tal = (v) => (v === null || v === undefined ? v : Number(v));

console.log("\n── Standard ──\n");

const s = await en(`select low_stock_default_stk, low_stock_default_m from public.pipe_settings where id = 1`);
sjekk("2 stk og 10 m frå start", [tal(s.low_stock_default_stk), tal(s.low_stock_default_m)], [2, 10]);

const offentleg = await en(
  `select count(*)::int as n from information_schema.columns
   where table_schema = 'public' and table_name = 'pipe_public_settings' and column_name like 'low_stock%'`,
);
sjekk("kundeflyten ser ikkje grensene", offentleg.n, 0);

console.log("\n── Endre ──\n");

await som(db, KONTOR, () =>
  db.query(`update public.pipe_settings set low_stock_default_stk = 3, low_stock_default_m = 0 where id = 1`),
);
const e = await en(`select low_stock_default_stk, low_stock_default_m from public.pipe_settings where id = 1`);
sjekk("kontoret kan endre, og 0 slår av", [tal(e.low_stock_default_stk), tal(e.low_stock_default_m)], [3, 0]);

const spor = await en(
  `select endringar from public.pipe_revisjon where tabell = 'pipe_settings' order by created_at desc, id desc limit 1`,
);
sjekk(
  "endringa står i revisjonssporet",
  Object.keys(spor.endringar).sort(),
  ["low_stock_default_m", "low_stock_default_stk"],
);

console.log("\n── Vakter ──\n");

let m = null;
try {
  await som(db, KONTOR, () => db.query(`update public.pipe_settings set low_stock_default_stk = -1 where id = 1`));
} catch (err) {
  m = err.message;
}
m && /low_stock_default_check/.test(m) ? ok("ei negativ grense blir avvist") : nei("ei negativ grense blir avvist", m ?? "GIKK GJENNOM");

console.log(tilstand.feil === 0 ? `\nAlt i orden. Standardgrensa held.\n` : `\n${tilstand.feil} feil.\n`);
process.exit(tilstand.feil === 0 ? 0 : 1);
