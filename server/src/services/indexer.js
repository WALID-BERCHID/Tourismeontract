import { config } from "../config.js";
import { all, get, kvGet, kvSet } from "../db.js";
import { escrowInterface, evmDeployment, evmProvider } from "../chains/evm.js";
import { notify } from "../notify.js";
import { applyStatus, bookingEmailData, syncBooking } from "./bookings.js";
import { todayDay } from "../util.js";

const WATCHED = ["Cancelled", "Released", "Disputed", "Resolved"];
const topics = WATCHED.map((name) => escrowInterface.getEvent(name).topicHash);

function indexedChainIds() {
  const deployed = Object.keys(config.deployments?.evm || {});
  const wanted = process.env.INDEX_CHAIN_IDS ? process.env.INDEX_CHAIN_IDS.split(",").map((s) => s.trim()) : deployed;
  return deployed.filter((id) => wanted.includes(id));
}

/** Follows escrow events so bookings update even when actions happen outside the web app. */
async function indexChain(chainId) {
  const dep = evmDeployment(chainId);
  const provider = evmProvider(chainId);
  const key = `indexer:${chainId}:${dep.escrow.toLowerCase()}`;
  const latest = await provider.getBlockNumber();
  let from = kvGet(key, dep.startBlock ?? latest) + 1;
  // A restarted local chain resets block numbers.
  if (from > latest + 1) from = dep.startBlock ?? 0;
  while (from <= latest) {
    const to = Math.min(latest, from + 2000);
    const logs = await provider.getLogs({ address: dep.escrow, fromBlock: from, toBlock: to, topics: [topics] });
    for (const log of logs) {
      const parsed = escrowInterface.parseLog(log);
      const b = get(`SELECT * FROM bookings WHERE network = ? AND chain_booking_id = ?`, `evm:${chainId}`, parsed.args.bookingId.toString());
      if (!b) continue;
      const opts = { txHash: log.transactionHash };
      if (parsed.name === "Disputed") opts.reason = parsed.args.reason;
      if (parsed.name === "Resolved") opts.refundPercent = Number(parsed.args.guestRefundBps) / 100;
      const status = { Cancelled: null, Released: "completed", Disputed: "disputed", Resolved: "resolved" }[parsed.name];
      if (status) applyStatus(b.id, status, opts);
      else await syncBooking(b);
    }
    kvSet(key, to);
    from = to + 1;
  }
}

/** Daily-ish housekeeping: review reminders and releasing due escrows' status. */
async function housekeeping() {
  const today = todayDay();
  // Bookings whose release window passed: refresh their on-chain status.
  for (const b of all(`SELECT * FROM bookings WHERE status = 'confirmed' AND check_in < ? LIMIT 50`, today)) await syncBooking(b);
  // Check-in reminders two days before arrival.
  for (const b of all(`SELECT * FROM bookings WHERE status = 'confirmed' AND check_in = ?`, today + 2)) {
    const key = `reminder:checkin:${b.id}`;
    if (kvGet(key)) continue;
    kvSet(key, true);
    const d = bookingEmailData(b);
    notify(b.guest_id, { type: "trip", title: `Your trip to ${d.city} is in 2 days`, body: `Check-in from ${get(`SELECT check_in_time FROM listings WHERE id = ?`, b.listing_id).check_in_time}`, link: `/trips/${b.id}` });
  }
}

export function startIndexer() {
  if (!config.indexer.enabled) return;
  let running = false;
  let lastHousekeeping = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const id of indexedChainIds()) {
        try {
          await indexChain(id);
        } catch (err) {
          if (process.env.DEBUG_INDEXER) console.warn(`[indexer] chain ${id}:`, err.message);
        }
      }
      if (Date.now() - lastHousekeeping > 10 * 60_000) {
        lastHousekeeping = Date.now();
        await housekeeping().catch(() => {});
      }
    } finally {
      running = false;
    }
  };
  setInterval(tick, config.indexer.intervalMs).unref();
  tick();
}
