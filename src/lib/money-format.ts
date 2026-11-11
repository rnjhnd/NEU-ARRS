const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Display conversion only; persisted and aggregated values remain centavos. */
export function formatPHP(centavos: number) { return php.format(centavos / 100); }
