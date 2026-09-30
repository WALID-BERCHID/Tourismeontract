import { formatUnits } from "ethers";
import type { Booking, Network } from "./types";
import { ZERO, connectEvm, evmBook, evmEscrow, evmErrorMessage, evmQuote, evmRefundPreview, evmTokenBalance } from "./chains/evm";
import { connectSolana, solanaBook, solanaEscrow, solanaQuote } from "./chains/solana";
import { connectEos, eosBook, eosEscrow, eosQuote } from "./chains/eos";

export interface CryptoQuote {
  token: string; // token address (EVM) or symbol
  symbol: string;
  decimals: number;
  total: bigint;
  display: string;
}

export function fmtToken(amount: bigint, decimals: number, symbol: string) {
  const n = Number(formatUnits(amount, decimals));
  const digits = decimals <= 6 ? 2 : n < 1 ? 5 : 4;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits })} ${symbol}`;
}

export async function connectWallet(net: Network): Promise<string> {
  if (net.chain === "evm") return connectEvm();
  if (net.chain === "solana") return connectSolana();
  return connectEos(net);
}

export async function quote(net: Network, chainListingId: string, checkIn: number, checkOut: number, token: string): Promise<CryptoQuote> {
  if (net.chain === "evm") {
    const t = net.tokens.find((x) => x.address === token)!;
    const q = await evmQuote(net, chainListingId, token, checkIn, checkOut);
    return { token, symbol: t.symbol, decimals: t.decimals, total: q.total, display: fmtToken(q.total, t.decimals, t.symbol) };
  }
  if (net.chain === "solana") {
    const q = await solanaQuote(net, chainListingId, checkOut - checkIn);
    return { token: "SOL", symbol: "SOL", decimals: 9, total: q.total, display: fmtToken(q.total, 9, "SOL") };
  }
  const q = await eosQuote(net, chainListingId, checkOut - checkIn);
  return { token: q.symbol, symbol: q.symbol, decimals: 4, total: BigInt(Math.round(q.total * 10_000)), display: q.quantity };
}

export async function balanceOf(net: Network, token: string, owner: string): Promise<bigint | null> {
  if (net.chain === "evm") return evmTokenBalance(net, token, owner);
  return null;
}

export type PayStep = "approve" | "pay" | "confirming";

export async function pay(
  net: Network,
  args: { chainListingId: string; checkIn: number; checkOut: number; quote: CryptoQuote },
  onStep: (s: PayStep) => void
): Promise<{ txHash: string; payer?: string }> {
  if (net.chain === "evm") {
    const txHash = await evmBook(net, { chainListingId: args.chainListingId, token: args.quote.token, checkIn: args.checkIn, checkOut: args.checkOut, total: args.quote.total }, onStep);
    return { txHash };
  }
  if (net.chain === "solana") {
    onStep("pay");
    const txHash = await solanaBook(net, args.chainListingId, args.checkIn, args.checkOut);
    return { txHash };
  }
  onStep("pay");
  const r = await eosBook(net, { chainListingId: args.chainListingId, checkIn: args.checkIn, checkOut: args.checkOut, quantity: args.quote.display });
  return { txHash: r.txHash, payer: r.account };
}

type Action = "cancelByGuest" | "cancelByHost" | "release" | "openDispute";

/** Runs an escrow action for a booking on whichever chain it lives on. */
export async function bookingAction(net: Network, b: Booking, action: Action, chainListingId: string, reason = ""): Promise<string> {
  const id = b.chainBookingId!;
  if (net.chain === "evm") {
    if (action === "openDispute") return evmEscrow.openDispute(net, id, reason);
    return evmEscrow[action](net, id);
  }
  if (net.chain === "solana") {
    if (action === "openDispute") return solanaEscrow.openDispute(net, id, reason);
    return solanaEscrow[action](net, chainListingId, id, b.payerAddress!);
  }
  const account = await connectEos(net);
  if (action === "openDispute") return eosEscrow.openDispute(net, id, account, reason);
  return eosEscrow[action](net, id, account);
}

export async function refundPreview(net: Network, b: Booking): Promise<number | null> {
  if (net.chain === "evm" && b.chainBookingId) return evmRefundPreview(net, b.chainBookingId);
  return null;
}

export function errorMessage(err: unknown) {
  return evmErrorMessage(err);
}

export { ZERO };
