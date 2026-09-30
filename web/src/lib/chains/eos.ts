import type { Network } from "../types";

// WharfKit is loaded lazily so EVM-only visitors don't download it.
type WharfSession = {
  actor: { toString(): string };
  permission: { toString(): string };
  transact: (args: { actions: unknown[] }) => Promise<{ resolved?: { transaction: { id: { toString(): string } } }; response?: { transaction_id?: string } }>;
};

let session: WharfSession | null = null;

async function sessionKit(net: Network) {
  const [{ SessionKit }, { WebRenderer }, { WalletPluginAnchor }] = await Promise.all([
    import("@wharfkit/session"),
    import("@wharfkit/web-renderer"),
    import("@wharfkit/wallet-plugin-anchor"),
  ]);
  return new SessionKit({
    appName: "tourisme",
    chains: [{ id: String(net.chainId), url: net.rpc }],
    ui: new WebRenderer(),
    walletPlugins: [new WalletPluginAnchor()],
  });
}

export async function connectEos(net: Network) {
  const kit = await sessionKit(net);
  const res = await kit.login();
  session = res.session as unknown as WharfSession;
  return session.actor.toString();
}

async function ensureSession(net: Network) {
  if (!session) await connectEos(net);
  return session!;
}

function txId(res: Awaited<ReturnType<WharfSession["transact"]>>) {
  return res.resolved?.transaction.id.toString() || res.response?.transaction_id || "";
}

const auth = (s: WharfSession) => [{ actor: s.actor.toString(), permission: s.permission.toString() }];

/** Pays for a booking with an eosio.token transfer carrying the booking memo. */
export async function eosBook(net: Network, args: { chainListingId: string; checkIn: number; checkOut: number; quantity: string }) {
  const s = await ensureSession(net);
  const res = await s.transact({
    actions: [
      {
        account: "eosio.token",
        name: "transfer",
        authorization: auth(s),
        data: { from: s.actor.toString(), to: net.contract, quantity: args.quantity, memo: `book:${args.chainListingId}:${args.checkIn}:${args.checkOut}` },
      },
    ],
  });
  return { txHash: txId(res), account: s.actor.toString() };
}

async function action(net: Network, name: string, data: Record<string, unknown>) {
  const s = await ensureSession(net);
  const res = await s.transact({ actions: [{ account: net.contract, name, authorization: auth(s), data: { ...data } }] });
  return txId(res);
}

export const eosEscrow = {
  cancelByGuest: (net: Network, bookingId: string, account: string) => action(net, "cancelguest", { guest: account, booking_id: bookingId }),
  cancelByHost: (net: Network, bookingId: string, account: string) => action(net, "cancelhost", { host: account, booking_id: bookingId }),
  release: (net: Network, bookingId: string, account: string) => action(net, "release", { caller: account, booking_id: bookingId }),
  openDispute: (net: Network, bookingId: string, account: string, reason: string) => action(net, "dispute", { guest: account, booking_id: bookingId, reason }),
};

/** Reads the listing's price from the contract table and returns the exact transfer quantity. */
export async function eosQuote(net: Network, chainListingId: string, nights: number) {
  const res = await fetch(`${net.rpc}/v1/chain/get_table_rows`, {
    method: "POST",
    body: JSON.stringify({ json: true, code: net.contract, scope: net.contract, table: "listings", lower_bound: chainListingId, upper_bound: chainListingId, limit: 1 }),
  }).then((r) => r.json());
  const row = res.rows?.[0];
  if (!row) throw new Error("Listing not found on EOS");
  const cfg = await fetch(`${net.rpc}/v1/chain/get_table_rows`, {
    method: "POST",
    body: JSON.stringify({ json: true, code: net.contract, scope: net.contract, table: "config", limit: 1 }),
  }).then((r) => r.json());
  const feeBps = cfg.rows?.[0]?.guest_fee_bps ?? 800;
  const [nightly, sym] = row.nightly.split(" ");
  const precision = nightly.split(".")[1]?.length ?? 4;
  const unit = 10 ** precision;
  const subtotal = Math.round(parseFloat(nightly) * unit) * nights + Math.round(parseFloat(row.cleaning_fee) * unit);
  const fee = Math.floor((subtotal * feeBps) / 10_000);
  const total = subtotal + fee;
  return { quantity: `${(total / unit).toFixed(precision)} ${sym}`, total: total / unit, symbol: sym as string };
}

const POLICY_INDEX = { flexible: 0, moderate: 1, strict: 2 } as const;

/** Creates the listing on the EOS contract; returns the id it will receive. */
export async function eosPublishListing(
  net: Network,
  args: { policy: keyof typeof POLICY_INDEX; minNights: number; maxNights: number; nightlyEos: number; cleaningEos: number; uri: string }
) {
  const s = await ensureSession(net);
  const cfg = await fetch(`${net.rpc}/v1/chain/get_table_rows`, {
    method: "POST",
    body: JSON.stringify({ json: true, code: net.contract, scope: net.contract, table: "config", limit: 1 }),
  }).then((r) => r.json());
  const listingId = String(cfg.rows?.[0]?.next_listing_id ?? 1);
  const txHash = await action(net, "createlist", {
    host: s.actor.toString(),
    policy: POLICY_INDEX[args.policy],
    min_nights: args.minNights,
    max_nights: args.maxNights,
    nightly: `${args.nightlyEos.toFixed(4)} EOS`,
    cleaning_fee: `${args.cleaningEos.toFixed(4)} EOS`,
    metadata_uri: args.uri,
  });
  return { listingId, txHash, account: s.actor.toString() };
}
