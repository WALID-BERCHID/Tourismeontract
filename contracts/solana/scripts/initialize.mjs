/**
 * Initialises the deployed tourisme_escrow program (one-time).
 *
 *   SOLANA_RPC_URL=https://api.devnet.solana.com \
 *   PROGRAM_ID=<id> ARBITER=<pubkey> TREASURY=<pubkey> \
 *   node contracts/solana/scripts/initialize.mjs ~/.config/solana/id.json
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";

const keyfile = process.argv[2] || `${process.env.HOME}/.config/solana/id.json`;
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyfile, "utf8"))));
const conn = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
const programId = new PublicKey(process.env.PROGRAM_ID || "2Nd2n5ZHj51hS7QbrfWnsbMx329m3WYKMtLxkQ4bE3rb");
const arbiter = new PublicKey(process.env.ARBITER || authority.publicKey);
const treasury = new PublicKey(process.env.TREASURY || authority.publicKey);
const guestFee = Number(process.env.GUEST_FEE_BPS || 800);
const hostFee = Number(process.env.HOST_FEE_BPS || 300);

const disc = crypto.createHash("sha256").update("global:initialize").digest().subarray(0, 8);
const fees = Buffer.alloc(4);
fees.writeUInt16LE(guestFee, 0);
fees.writeUInt16LE(hostFee, 2);
const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);

const ix = new TransactionInstruction({
  programId,
  keys: [
    { pubkey: config, isSigner: false, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([disc, arbiter.toBuffer(), treasury.toBuffer(), fees]),
});
const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [authority]);
console.log(`Initialised config ${config.toBase58()} – tx ${sig}`);
