# Target final-output format — markup / client total

Reference example for a planned final-output stage in `enrichment/` — not
yet built. Groups line items by TYPE, each group showing an item count
and two subtotals (Builder cost, Client total); each line item shows
quantity, unit, unit cost, cost type, builder cost, markup %, and client
total. A grand summary follows the groups.

**Note:** group names below (Demolition, Concrete, Roofing, Doors,
Cabinets, Plumbing, Electrical, HVAC, Appliances) do NOT match the
current 12-value `TRADE` enum in `classification/schema.ts`
(`electrical, plumbing, hvac, fire_protection, roofing, foundation,
excavation_grading, landscaping, fencing, mold_remediation,
pest_control, general_contractor`). This is a different, more
granular category taxonomy — confirm before assuming `line.trade` can
be reused directly as the grouping key for this stage.

Verified arithmetic: client total = builder cost × (1 + markup%).
Markup is consistently 35% in every row of this example.

---

## 1. Demolition — 1 item — Builder cost $14.98 — Client total $20.22

| # | Item | Quantity | Unit | Unit cost | Cost type | Builder cost | Markup | Client total |
|---|------|---------:|------|----------:|-----------|--------------:|-------:|--------------:|
| 1.1 | Debris Disposal | 0.5 | EA | $29.95 | Material | $14.98 | 35% ($5.24) | $20.22 |

## 2. Concrete — 8 items — Builder cost $1,121.47 — Client total $1,513.98

| # | Item | Quantity | Unit | Unit cost | Cost type | Builder cost | Markup | Client total |
|---|------|---------:|------|----------:|-----------|--------------:|-------:|--------------:|
| 2.1 | Concrete for Stair Foundation Repair | 0.5 | CY | $150.00 | Material | $75.00 | 35% ($26.25) | $101.25 |
| 2.2 | Formwork for Stair Foundation | 8 | SF | $3.10 | Material | $24.80 | 35% ($8.68) | $33.48 |
| 2.3 | Rebar for Stair Foundation | 15 | LF | $1.25 | Material | $18.75 | 35% ($6.56) | $25.31 |
| 2.4 | Grout for Foundation Stabilization | 0.5 | CY | $100.00 | Material | $50.00 | 35% ($17.50) | $67.50 |
| 2.5 | Concrete Stair Foundation Repair Labor | 6 | HRS | $74.00 | Labor | $444.00 | 35% ($155.40) | $599.40 |
| 2.6 | Precast Concrete Window Wells | 2 | EA | $26.00 | Material | $52.00 | 35% ($18.20) | $70.20 |
| 2.7 | Gravel Base for Window Wells | 1 | CY | $160.92 | Material | $160.92 | 35% ($56.32) | $217.24 |
| 2.8 | Window Well Installation Labor | 4 | HRS | $74.00 | Labor | $296.00 | 35% ($103.60) | $399.60 |

## 3. Roofing — 5 items — Builder cost $209.08 — Client total $282.26

| # | Item | Quantity | Unit | Unit cost | Cost type | Builder cost | Markup | Client total |
|---|------|---------:|------|----------:|-----------|--------------:|-------:|--------------:|
| 3.1 | Asphalt Shingles | 0.25 | SQ | $110.00 | Material | $27.50 | 35% ($9.63) | $37.13 |
| 3.2 | Roofing Felt | 25 | SF | $0.16 | Material | $4.00 | 35% ($1.40) | $5.40 |
| 3.3 | Roof Flashing | 10 | LF | $1.76 | Material | $17.60 | 35% ($6.16) | $23.76 |
| 3.4 | Gutter Sealant | 1 | EA | $9.98 | Material | $9.98 | 35% ($3.49) | $13.47 |
| 3.5 | Roofing Labor | 2.5 | HRS | $60.00 | Labor | $150.00 | 35% ($52.50) | $202.50 |

## 4. Doors — 4 items — Builder cost $295.50 — Client total $398.93

| # | Item | Quantity | Unit | Unit cost | Cost type | Builder cost | Markup | Client total |
|---|------|---------:|------|----------:|-----------|--------------:|-------:|--------------:|
| 4.1 | Garage Door Hardware Repair Kit | 1 | EA | $45.00 | Material | $45.00 | 35% ($15.75) | $60.75 |
| 4.2 | Garage Door Glass Panel Replacement | 1 | EA | $65.00 | Material | $65.00 | 35% ($22.75) | $87.75 |
| 4.3 | Wood Filler and Touch-up Paint | 1 | EA | $18.00 | Material | $18.00 | 35% ($6.30) | $24.30 |
| 4.4 | Garage Door Repair Labor | 2.5 | HRS | $67.00 | Labor | $167.50 | 35% ($58.63) | $226.13 |

## 5. Cabinets — 3 items — Builder cost $87.00 — Client total $117.45

| # | Item | Quantity | Unit | Unit cost | Cost type | Builder cost | Markup | Client total |
|---|------|---------:|------|----------:|-----------|--------------:|-------:|--------------:|
| 5.1 | Cabinet Door Hardware Kit | 1 | EA | $8.00 | Material | $8.00 | 35% ($2.80) | $10.80 |
| 5.2 | Wood Glue and Filler | 1 | EA | $12.00 | Material | $12.00 | 35% ($4.20) | $16.20 |
| 5.3 | Cabinet Door Repair Labor | 1 | HRS | $67.00 | Labor | $67.00 | 35% ($23.45) | $90.45 |

## 6. Plumbing — 11 items — Builder cost $1,180.07 — Client total $1,593.09

| #    | Item                             | Quantity | Unit | Unit cost | Cost type | Builder cost | Markup        | Client total |
| ---- | -------------------------------- | -------: | ---- | --------: | --------- | -----------: | ------------: | -----------: |
| 6.1  | Oil Tank Vent Line 2-inch        | 10       | LF   | $3.50     | Material  | $35.00       | 35% ($12.25)  | $47.25       |
| 6.2  | Oil Tank Fill Line 2-inch        | 10       | LF   | $3.50     | Material  | $35.00       | 35% ($12.25)  | $47.25       |
| 6.3  | Oil Line Protection Sleeve       | 1        | EA   | $15.00    | Material  | $15.00       | 35% ($5.25)   | $20.25       |
| 6.4  | Concrete Patching Material       | 1        | EA   | $9.97     | Material  | $9.97        | 35% ($3.49)   | $13.46       |
| 6.5  | Oil Line Fittings and Connectors | 1        | EA   | $20.36    | Material  | $20.36       | 35% ($7.13)   | $27.49       |
| 6.6  | PVC Drain Piping                 | 10       | LF   | $3.49     | Material  | $34.90       | 35% ($12.22)  | $47.12       |
| 6.7  | Drain Fittings and Connectors    | 1        | EA   | $21.38    | Material  | $21.38       | 35% ($7.48)   | $28.86       |
| 6.8  | Kitchen Waste Line Replacement   | 10       | LF   | $1.00     | Material  | $10.00       | 35% ($3.50)   | $13.50       |
| 6.9  | Waste Line Fittings              | 1        | EA   | $15.99    | Material  | $15.99       | 35% ($5.60)   | $21.59       |
| 6.10 | Plumber's Putty/Silicone         | 1        | EA   | $2.47     | Material  | $2.47        | 35% ($0.86)   | $3.33        |
| 6.11 | Plumbing Labor                   | 10       | HRS  | $98.00    | Labor     | $980.00      | 35% ($343.00) | $1,323.00    |

## 7. Electrical — 11 items — Builder cost $785.69 — Client total $1,060.68

| # | Item | Quantity | Unit | Unit cost | Cost type | Builder cost | Markup | Client total |
|---|------|---------:|------|----------:|-----------|--------------:|-------:|--------------:|
| 7.1 | GFCI Outlets | 2 | EA | $20.48 | Material | $40.96 | 35% ($14.34) | $55.30 |
| 7.2 | Standard Outlets | 3 | EA | $4.98 | Material | $14.94 | 35% ($5.23) | $20.17 |
| 7.3 | Single-Pole Light Switch | 1 | EA | $19.98 | Material | $19.98 | 35% ($6.99) | $26.97 |
| 7.4 | Electrical Wire 12/2 NM-B | 20 | LF | $0.56 | Material | $11.20 | 35% ($3.92) | $15.12 |
| 7.5 | Wire Connectors and Terminals | 12 | EA | $0.23 | Material | $2.76 | 35% ($0.97) | $3.73 |
| 7.6 | Junction Box Covers | 2 | EA | $3.88 | Material | $7.76 | 35% ($2.72) | $10.48 |
| 7.7 | Grounding Wire and Clamps | 3 | EA | $8.23 | Material | $24.69 | 35% ($8.64) | $33.33 |
| 7.8 | Circuit Breakers 15-20A | 2 | EA | $8.21 | Material | $16.42 | 35% ($5.75) | $22.17 |
| 7.9 | Electrical Labor | 5 | HRS | $115.00 | Labor | $575.00 | 35% ($201.25) | $776.25 |
| 7.10 | Exhaust Fan Switch | 1 | EA | $14.48 | Material | $14.48 | 35% ($5.07) | $19.55 |
| 7.11 | Bathroom Exhaust Fan Switch Repair | 0.5 | HRS | $115.00 | Labor | $57.50 | 35% ($20.13) | $77.63 |

## 8. HVAC — 3 items — Builder cost $703.97 — Client total $950.36

| # | Item | Quantity | Unit | Unit cost | Cost type | Builder cost | Markup | Client total |
|---|------|---------:|------|----------:|-----------|--------------:|-------:|--------------:|
| 8.1 | HVAC Boiler Firebox Evaluation | 2 | HRS | $109.00 | Labor | $218.00 | 35% ($76.30) | $294.30 |
| 8.2 | Refractory Cement for Firebox Repair | 1 | EA | $49.97 | Material | $49.97 | 35% ($17.49) | $67.46 |
| 8.3 | Firebox Repair Labor | 4 | HRS | $109.00 | Labor | $436.00 | 35% ($152.60) | $588.60 |

## 9. Appliances — 4 items — Builder cost $1,077.91 — Client total $1,455.18

| # | Item | Quantity | Unit | Unit cost | Cost type | Builder cost | Markup | Client total |
|---|------|---------:|------|----------:|-----------|--------------:|-------:|--------------:|
| 9.1 | 1/2 HP Continuous Feed Garbage Disposal | 1 | EA | $118.91 | Material | $118.91 | 35% ($41.62) | $160.53 |
| 9.2 | 30-inch Under-Cabinet Range Hood | 1 | EA | $579.00 | Material | $579.00 | 35% ($202.65) | $781.65 |
| 9.3 | Trash Compactor Repair Parts | 1 | EA | $75.00 | Material | $75.00 | 35% ($26.25) | $101.25 |
| 9.4 | Appliances Labor | 5 | HRS | $61.00 | Labor | $305.00 | 35% ($106.75) | $411.75 |

---

## Grand summary

| Metric | Value |
|--------|------:|
| Total cost (sum of all Builder cost) | $5,475.67 |
| Total markup (35% of total cost) | $1,916.48 |
| Estimate total (cost + markup) | $7,392.15 |
| Profit margin (markup ÷ estimate total) | 25.9% |

Verified: `5475.67 × 0.35 = 1916.48`; `5475.67 + 1916.48 = 7392.15`; `1916.48 / 7392.15 = 25.9%`. Margin (% of revenue) is lower than markup (% of cost) — same $1,916.48, different denominator, both present in the source UI and both correct simultaneously, not a discrepancy.
