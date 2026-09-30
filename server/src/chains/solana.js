import crypto from "node:crypto";
import bs58 from "bs58";
import { config } from "../config.js";
import { HttpError } from "../util.js";

const SOL_STATUS = ["none", "confirmed", "cancelled_by_guest", "cancelled_by_host", "completed", "disputed", "resolved"];
const disc = (prefix, name) => crypto.createHash("sha256").update(`${prefix}:${name}`).digest().subarray(0, 8);
const BOOKED_EVENT = disc("event", "Booked");
const BOOKING_ACCOUNT = disc("account", "Booking");

async function rpc(method, params) {
  const res = await fetch(config.solana.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new HttpError(502, `Solana RPC error: ${body.error.message}`);
  return body.result;
}

export const solanaExplorerTx = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=${config.solana.cluster}`;

export async function verifySolanaBooking(signature) {
  const tx = await rpc("getTransaction", [signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
  if (!tx) throw new HttpError(409, "Transaction not found yet – please wait for confirmation");
  if (tx.meta?.err) throw new HttpError(400, "The payment transaction failed on-chain");
  for (const line of tx.meta?.logMessages || []) {
    if (!line.startsWith("Program data: ")) continue;
    const data = Buffer.from(line.slice(14), "base64");
    if (!data.subarray(0, 8).equals(BOOKED_EVENT)) continue;
    let o = 8;
    const bookingId = data.readBigUInt64LE(o); o += 8;
    const listingId = data.readBigUInt64LE(o); o += 8;
    const guest = bs58.encode(data.subarray(o, o + 32)); o += 32;
    const checkIn = data.readUInt32LE(o); o += 4;
    const checkOut = data.readUInt32LE(o); o += 4;
    const total = data.readBigUInt64LE(o);
    return {
      chainBookingId: bookingId.toString(),
      chainListingId: listingId.toString(),
      guest,
      checkIn,
      checkOut,
      total,
      amountNative: `${(Number(total) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL`,
    };
  }
  throw new HttpError(400, "No booking event found in this transaction");
}

/** Reads a booking account, located by discriminator + id rather than PDA derivation. */
export async function readSolanaBooking(chainBookingId) {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(BigInt(chainBookingId));
  const accounts = await rpc("getProgramAccounts", [
    config.solana.programId,
    {
      encoding: "base64",
      filters: [
        { memcmp: { offset: 0, bytes: bs58.encode(BOOKING_ACCOUNT) } },
        { memcmp: { offset: 8, bytes: bs58.encode(idBytes) } },
      ],
    },
  ]);
  if (!accounts?.length) throw new HttpError(404, "Booking account not found");
  const data = Buffer.from(accounts[0].account.data[0], "base64");
  // disc(8) id(8) listing(32) guest(32) check_in(4) check_out(4) created_at(8) status(1)
  const status = data.readUInt8(8 + 8 + 32 + 32 + 4 + 4 + 8);
  return { status: SOL_STATUS[status] };
}
