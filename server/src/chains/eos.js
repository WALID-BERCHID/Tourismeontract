import { config } from "../config.js";
import { HttpError } from "../util.js";

const EOS_STATUS = ["none", "confirmed", "cancelled_by_guest", "cancelled_by_host", "completed", "disputed", "resolved"];

async function chainApi(path, body) {
  const res = await fetch(`${config.eos.rpc}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new HttpError(502, `EOS API error ${res.status}`);
  return res.json();
}

export const eosExplorerTx = (id) => `https://jungle4.eosq.eosnation.io/tx/${id}`;

/** Finds the booking row created by `guest` for the given listing and dates. */
export async function verifyEosBooking({ guest, chainListingId, checkIn, checkOut }) {
  const res = await chainApi("/v1/chain/get_table_rows", {
    json: true,
    code: config.eos.contract,
    scope: config.eos.contract,
    table: "bookings",
    index_position: 2,
    key_type: "name",
    lower_bound: guest,
    upper_bound: guest,
    limit: 100,
  });
  const row = (res.rows || []).find(
    (r) => String(r.listing_id) === String(chainListingId) && r.check_in === checkIn && r.check_out === checkOut && r.status === 1
  );
  if (!row) throw new HttpError(409, "Booking not found on-chain yet – please wait a few seconds");
  const total = parseFloat(row.subtotal) + parseFloat(row.guest_fee);
  const symbol = row.subtotal.split(" ")[1];
  return {
    chainBookingId: String(row.id),
    chainListingId: String(row.listing_id),
    guest,
    checkIn,
    checkOut,
    amountNative: `${total.toFixed(4)} ${symbol}`,
  };
}

export async function readEosBooking(chainBookingId) {
  const res = await chainApi("/v1/chain/get_table_rows", {
    json: true,
    code: config.eos.contract,
    scope: config.eos.contract,
    table: "bookings",
    lower_bound: chainBookingId,
    upper_bound: chainBookingId,
    limit: 1,
  });
  const row = res.rows?.[0];
  if (!row) throw new HttpError(404, "Booking not found on-chain");
  return { status: EOS_STATUS[row.status] };
}
