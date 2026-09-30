import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import type { Network } from "../types";

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  signMessage: (msg: Uint8Array, enc?: string) => Promise<{ signature: Uint8Array }>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
}

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}

function provider(): PhantomProvider {
  const p = window.phantom?.solana || window.solana;
  if (!p) throw new Error("No Solana wallet found. Install Phantom or Solflare to continue.");
  return p;
}

export const hasSolanaWallet = () => typeof window !== "undefined" && !!(window.phantom?.solana || window.solana);

export async function connectSolana() {
  const { publicKey } = await provider().connect();
  return publicKey.toBase58();
}

export async function signSolanaMessage(message: string) {
  const { signature } = await provider().signMessage(new TextEncoder().encode(message), "utf8");
  return bs58.encode(signature);
}

async function discriminator(name: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`global:${name}`));
  return new Uint8Array(hash).slice(0, 8);
}

const u64 = (v: bigint | number) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(v), true);
  return b;
};
const u32 = (v: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return b;
};
const u16 = (v: number) => {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, true);
  return b;
};
const str = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  return concat(u32(bytes.length), bytes);
};
function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
}

const pda = (programId: PublicKey, ...seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, programId)[0];
const enc = (s: string) => new TextEncoder().encode(s);

async function readConfig(conn: Connection, programId: PublicKey) {
  const info = await conn.getAccountInfo(pda(programId, enc("config")));
  if (!info) throw new Error("Solana escrow is not initialised on this cluster");
  const d = new DataView(info.data.buffer, info.data.byteOffset);
  return {
    treasury: new PublicKey(info.data.slice(8 + 64, 8 + 96)),
    guestFeeBps: d.getUint16(104, true),
    listingCount: d.getBigUint64(108, true),
    bookingCount: d.getBigUint64(116, true),
  };
}

async function readListing(conn: Connection, programId: PublicKey, id: string) {
  const info = await conn.getAccountInfo(pda(programId, enc("listing"), u64(BigInt(id))));
  if (!info) throw new Error("Listing not found on Solana");
  const d = new DataView(info.data.buffer, info.data.byteOffset);
  return {
    host: new PublicKey(info.data.slice(16, 48)),
    nightly: d.getBigUint64(54, true),
    cleaning: d.getBigUint64(62, true),
  };
}

function ctx(net: Network) {
  return { conn: new Connection(net.rpc, "confirmed"), programId: new PublicKey(net.programId!) };
}

async function sendIx(net: Network, ix: TransactionInstruction) {
  const { conn } = ctx(net);
  const wallet = provider();
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey!;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  const { signature } = await wallet.signAndSendTransaction(tx);
  await conn.confirmTransaction(signature, "confirmed");
  return signature;
}

export async function solanaQuote(net: Network, chainListingId: string, nights: number) {
  const { conn, programId } = ctx(net);
  const [cfg, l] = await Promise.all([readConfig(conn, programId), readListing(conn, programId, chainListingId)]);
  const subtotal = l.nightly * BigInt(nights) + l.cleaning;
  const fee = (subtotal * BigInt(cfg.guestFeeBps)) / 10_000n;
  return { subtotal, fee, total: subtotal + fee };
}

export async function solanaBook(net: Network, chainListingId: string, checkIn: number, checkOut: number) {
  const { conn, programId } = ctx(net);
  const wallet = provider();
  if (!wallet.publicKey) await wallet.connect();
  const cfg = await readConfig(conn, programId);
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: pda(programId, enc("config")), isSigner: false, isWritable: true },
      { pubkey: pda(programId, enc("listing"), u64(BigInt(chainListingId))), isSigner: false, isWritable: true },
      { pubkey: pda(programId, enc("booking"), u64(cfg.bookingCount + 1n)), isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey!, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(concat(await discriminator("book"), u32(checkIn), u32(checkOut))),
  });
  return sendIx(net, ix);
}

async function settleIx(net: Network, name: string, chainListingId: string, chainBookingId: string, guest: string, extra: Uint8Array = new Uint8Array()) {
  const { conn, programId } = ctx(net);
  const wallet = provider();
  if (!wallet.publicKey) await wallet.connect();
  const [cfg, l] = await Promise.all([readConfig(conn, programId), readListing(conn, programId, chainListingId)]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: pda(programId, enc("config")), isSigner: false, isWritable: false },
      { pubkey: pda(programId, enc("listing"), u64(BigInt(chainListingId))), isSigner: false, isWritable: true },
      { pubkey: pda(programId, enc("booking"), u64(BigInt(chainBookingId))), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(guest), isSigner: false, isWritable: true },
      { pubkey: l.host, isSigner: false, isWritable: true },
      { pubkey: cfg.treasury, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey!, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(concat(await discriminator(name), extra)),
  });
}

export const solanaEscrow = {
  cancelByGuest: async (net: Network, listingId: string, bookingId: string, guest: string) => sendIx(net, await settleIx(net, "cancel_by_guest", listingId, bookingId, guest)),
  cancelByHost: async (net: Network, listingId: string, bookingId: string, guest: string) => sendIx(net, await settleIx(net, "cancel_by_host", listingId, bookingId, guest)),
  release: async (net: Network, listingId: string, bookingId: string, guest: string) => sendIx(net, await settleIx(net, "release", listingId, bookingId, guest)),
  resolveDispute: async (net: Network, listingId: string, bookingId: string, guest: string, bps: number) =>
    sendIx(net, await settleIx(net, "resolve_dispute", listingId, bookingId, guest, u64(bps))),
  openDispute: async (net: Network, bookingId: string, reason: string) => {
    const { programId } = ctx(net);
    const wallet = provider();
    if (!wallet.publicKey) await wallet.connect();
    return sendIx(
      net,
      new TransactionInstruction({
        programId,
        keys: [
          { pubkey: pda(programId, enc("booking"), u64(BigInt(bookingId))), isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey!, isSigner: true, isWritable: false },
        ],
        data: Buffer.from(concat(await discriminator("open_dispute"), str(reason))),
      })
    );
  },
};

const POLICY_INDEX = { flexible: 0, moderate: 1, strict: 2 } as const;

export async function solanaPublishListing(
  net: Network,
  args: { policy: keyof typeof POLICY_INDEX; minNights: number; maxNights: number; nightlyLamports: bigint; cleaningLamports: bigint; uri: string }
) {
  const { conn, programId } = ctx(net);
  const wallet = provider();
  if (!wallet.publicKey) await wallet.connect();
  const cfg = await readConfig(conn, programId);
  const id = cfg.listingCount + 1n;
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: pda(programId, enc("config")), isSigner: false, isWritable: true },
      { pubkey: pda(programId, enc("listing"), u64(id)), isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey!, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(
      concat(
        await discriminator("create_listing"),
        new Uint8Array([POLICY_INDEX[args.policy]]),
        u16(args.minNights),
        u16(args.maxNights),
        u64(args.nightlyLamports),
        u64(args.cleaningLamports),
        str(args.uri)
      )
    ),
  });
  const txHash = await sendIx(net, ix);
  return { listingId: id.toString(), txHash };
}
