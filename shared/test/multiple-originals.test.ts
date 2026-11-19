import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  orderOffer,
  summaryText,
  salesPitch,
  objections,
  extras,
  initialItems,
  initialProductStats,
  productStats,
  summary,
  combinationStats,
  recommend,
  manualAddCheck,
  EMPTY_PROFILE,
  type Product,
  type Proposal,
  type ActivityCall,
} from "../src/index.js";
const catalogue = JSON.parse(
  readFileSync(new URL("./fixtures/catalogue.json", import.meta.url), "utf8"),
) as Product[];
const get = (id: string) => catalogue.find((p) => p.id === id)!;
const initial = [get("antiacne"), get("wcgel")],
  basket = [...initial, get("wcspf")];
const profile = {
  ...EMPTY_PROFILE,
  concerns: ["acne"],
  skin: "mixed",
  sensitive: "no",
  routineKnown: true,
  safety: ["none"],
  severity: "mild",
};
const snapshot = (p: Product) => ({ id: p.id, name: p.name, price: p.price });
const proposal: Proposal = {
  id: "p1",
  call_id: "c1",
  user_id: "u1",
  created_at: "2026-11-17T11:00:00Z",
  base: snapshot(initial[0]),
  originals: initial.map(snapshot),
  products: basket.map(snapshot),
  catalogueTotal: 4800,
  offerTotal: 4400,
  extra: 1100,
  tier: "duo",
  delivery: null,
  version: 3,
};
const call: ActivityCall = {
  id: "c1",
  user_id: "u1",
  operator: "Test",
  created_at: proposal.created_at,
  outcome: "trio",
  base_id: "antiacne",
  products: proposal.products,
  catalogue_total: 4800,
  base_total: 3300,
  offered_total: 4400,
  extra: 1100,
  delivery: null,
  tier: "duo",
  pilot: 1,
  refusal: "",
  meta: {
    version: 3,
    original: proposal.base,
    originals: proposal.originals,
    eligible: true,
    acceptedProposalId: "p1",
  },
  proposals: [proposal],
};
describe("complete original order", () => {
  it("keeps the full original price until a new product is added", () => {
    expect(orderOffer(initial, initial, "duo", catalogue)).toBe(3300);
    expect(orderOffer(initial, [...initial].reverse(), "final", catalogue)).toBe(3300);
    expect(orderOffer(initial, basket, "duo", catalogue)).toBe(4400);
  });
  it("quotes the uplift from both original products and explains only the new complement", () => {
    const pitch = salesPitch(
      initial[0],
      basket,
      profile,
      "duo",
      catalogue,
      initial,
    );
    expect(pitch.opener).toContain(initial[1].short);
    expect(pitch.price).toContain("1\u202f100");
    expect(pitch.facts.every((x) => x.startsWith(get("wcspf").short))).toBe(
      true,
    );
    expect(
      objections(initial[0], basket, profile, "duo", catalogue, initial)[0]
        .answer,
    ).toContain("3\u202f300");
    expect(summaryText(initial[0], initial, "duo", null, catalogue, initial)).toContain(
      "Écart avec la commande initiale : 0 DA",
    );
  });
  it("excludes every original item from additional product statistics", () => {
    expect(extras(proposal).map((p) => p.id)).toEqual(["wcspf"]);
    expect(productStats([call]).map((p) => [p.id, p.units])).toEqual([
      ["wcspf", 1],
    ]);
    expect(initialItems(call).map((p) => p.id)).toEqual(["antiacne", "wcgel"]);
    expect(initialProductStats([call]).map((p) => p.id)).toEqual([
      "antiacne",
      "wcgel",
    ]);
    expect(combinationStats([call])[0].name).toBe(
      initial.map((p) => p.name).join(" + ") + " → " + get("wcspf").name,
    );
  });
  it("subtracts initial pack components and other originals with quantities", () => {
    const first = {
      id: "pack",
      name: "Pack",
      price: 3200,
      components: [
        { id: "a", name: "A", price: 1000 },
        { id: "b", name: "B", price: 1000 },
      ],
    };
    const other = { id: "c", name: "C", price: 1000, quantity: 2 };
    const p = {
      ...proposal,
      base: first,
      originals: [first, other],
      products: [first, other, { id: "d", name: "D", price: 1500 }],
    };
    expect(extras(p).map((x) => [x.id, x.quantity])).toEqual([["d", 1]]);
  });
  it("retains legacy proposal and call behaviour", () => {
    expect(
      extras({ ...proposal, originals: undefined }).map((p) => p.id),
    ).toEqual(["wcgel", "wcspf"]);
    expect(
      initialItems({ ...call, meta: { original: proposal.base } }),
    ).toEqual([proposal.base]);
  });
  it("checks new suggestions against all products already ordered", () => {
    expect(
      recommend(catalogue, initial[0], profile, [initial[1]]).some(
        (r) => r.product.id === "wcgel",
      ),
    ).toBe(false);
    expect(
      manualAddCheck(initial[0], [initial[1]], initial[1], profile, catalogue)
        .blocked,
    ).toBeTruthy();
    expect(recommend(catalogue, initial[0], profile, basket.slice(1)).some(
      r => r.product.id === "total",
    )).toBe(true);
  });
});


describe("accepted routines above three products", () => {
  it("counts larger routines in revenue, products and initial-order analytics", () => {
    const products = [...basket, get("total"), get("shpousse")];
    const offer = orderOffer(initial, products, "duo", catalogue);
    const p = { ...proposal, products: products.map(snapshot), offerTotal: offer, extra: offer - 3300 };
    const c = { ...call, outcome: "routine", products: p.products, offered_total: offer, extra: p.extra, proposals: [p] };
    expect(summary([c])).toMatchObject({ won: 1, routines: 1, trios: 0, duos: 0, extra: offer - 3300, acceptRate: 100 });
    expect(productStats([c]).map(x => [x.id, x.units, x.routines])).toEqual([
      ["wcspf", 1, 1], ["total", 1, 1], ["shpousse", 1, 1],
    ]);
    expect(initialProductStats([c]).every(x => x.confirmed === 1 && x.upsells === 1)).toBe(true);
    expect(combinationStats([c])[0]).toMatchObject({ accepted: 1, extra: offer - 3300 });
  });
});
