// ===================================================================
//  TERMÉKADATBÁZIS – CSAK EZT A FÁJLT KELL CSERÉLNI az éles listára!
//  Formátum: { name: "Termék neve", plu: "kód", category: "Kategória", aliases: ["más név"] }
//  A "category" és az "aliases" elhagyható (kategória nélkül: "Egyéb").
//  Ékezet, kis/nagybetű, elgépelés nem számít – a keresés hasonlóság alapú.
// ===================================================================
const PRODUCTS = [
  { name: "Alma",          plu: "222", category: "Gyümölcs" },
  { name: "Banán",         plu: "333", category: "Gyümölcs" },
  { name: "Körte",         plu: "444", category: "Gyümölcs" },
  { name: "Csokis párna",  plu: "666", category: "Pékáru" },
  { name: "Túrós pogácsa", plu: "777", category: "Pékáru" },
  { name: "Mákos kifli",   plu: "888", category: "Pékáru" },
];
