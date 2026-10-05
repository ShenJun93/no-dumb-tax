// Creates the 1-day-trial demo plan through the deployed app: node scripts/create-demo-plan.mjs <baseUrl> <merchantToken>
const [base, token] = process.argv.slice(2);
const r = await fetch(`${base}/api/merchant/plans`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-merchant-token": token },
  body: JSON.stringify({ name: "Notely Pro", price: "9.99", trialDays: 1 }),
});
console.log(r.status, await r.text());
