import { BrowserProvider, Contract, Interface, JsonRpcProvider, MaxUint256, formatUnits, type Eip1193Provider, type Signer } from "ethers";
import escrowAbi from "../../config/abi/TourismeEscrow.json";
import erc20Abi from "../../config/abi/MockUSDC.json";
import type { Network } from "../types";

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { on?: (e: string, cb: (...a: unknown[]) => void) => void; isMetaMask?: boolean };
  }
}

export const ZERO = "0x0000000000000000000000000000000000000000";
export const escrowInterface = new Interface(escrowAbi);

const ERROR_TEXT: Record<string, string> = {
  DatesUnavailable: "Some of these nights were just booked. Please choose other dates.",
  WrongPayment: "Payment amount didn't match the quote. Please try again.",
  InvalidDates: "These dates aren't valid for this listing.",
  TooLate: "It's too late for this action.",
  TooEarly: "It's too early – payouts unlock 24 hours after check-in.",
  ListingInactive: "This listing is not accepting bookings right now.",
  TokenNotAccepted: "The host doesn't accept this currency.",
  SelfBooking: "You can't book your own listing.",
  InvalidStatus: "This reservation can't be changed anymore.",
  NotGuest: "Only the guest can do this.",
  NotHost: "Only the host can do this.",
  NotArbiter: "Only the arbiter can resolve disputes.",
  AlreadyReviewed: "You already reviewed this stay.",
  NothingToWithdraw: "There's nothing to withdraw.",
  EnforcedPause: "Payments are temporarily paused.",
};

/** Turns wallet / contract errors into a sentence a guest understands. */
export function evmErrorMessage(err: unknown): string {
  const e = err as { code?: string | number; data?: string; info?: { error?: { code?: number; message?: string; data?: unknown } }; shortMessage?: string; message?: string; error?: { data?: string } };
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001 || e?.info?.error?.code === 4001) return "You rejected the request in your wallet.";
  const data = e?.data || e?.error?.data || (typeof e?.info?.error?.data === "string" ? e.info.error.data : undefined);
  if (data) {
    try {
      const parsed = escrowInterface.parseError(data);
      if (parsed) return ERROR_TEXT[parsed.name] || parsed.name;
    } catch {
      /* not an escrow error */
    }
  }
  const msg = e?.shortMessage || e?.message || "Transaction failed";
  if (/insufficient funds/i.test(msg)) return "Your wallet doesn't have enough funds for this payment and gas.";
  const named = Object.keys(ERROR_TEXT).find((k) => msg.includes(k));
  return named ? ERROR_TEXT[named] : msg.replace(/\(action=.*$/, "").trim();
}

export function hasInjectedWallet() {
  return typeof window !== "undefined" && !!window.ethereum;
}

function injected() {
  if (!window.ethereum) throw new Error("No Ethereum wallet found. Install MetaMask, Rabby or Coinbase Wallet to continue.");
  return window.ethereum;
}

export async function connectEvm(): Promise<string> {
  const accounts = (await injected().request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.length) throw new Error("No account selected");
  return accounts[0];
}

export async function currentEvmAccount(): Promise<string | null> {
  if (!window.ethereum) return null;
  const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[];
  return accounts?.[0] || null;
}

export async function ensureEvmNetwork(net: Network) {
  const eth = injected();
  const hex = `0x${Number(net.chainId).toString(16)}`;
  const current = (await eth.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === hex) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 4902 && code !== -32603) throw err;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hex,
          chainName: net.name,
          nativeCurrency: { name: net.nativeSymbol, symbol: net.nativeSymbol, decimals: 18 },
          rpcUrls: [net.rpc],
          blockExplorerUrls: net.explorer ? [net.explorer] : undefined,
        },
      ],
    });
  }
}

export async function evmSigner(net?: Network): Promise<Signer> {
  if (net) await ensureEvmNetwork(net);
  return new BrowserProvider(injected()).getSigner();
}

export async function signEvmMessage(message: string) {
  const signer = await evmSigner();
  return signer.signMessage(message);
}

const readProviders = new Map<string, JsonRpcProvider>();
function reader(net: Network) {
  if (!readProviders.has(net.id)) readProviders.set(net.id, new JsonRpcProvider(net.rpc, Number(net.chainId), { staticNetwork: true }));
  return readProviders.get(net.id)!;
}

export const escrowRead = (net: Network) => new Contract(net.escrow!, escrowAbi, reader(net));
const escrowWrite = async (net: Network) => new Contract(net.escrow!, escrowAbi, await evmSigner(net));

export async function evmQuote(net: Network, chainListingId: string, token: string, checkIn: number, checkOut: number) {
  const [subtotal, fee, total] = await escrowRead(net).quote(chainListingId, token, checkIn, checkOut);
  return { subtotal: subtotal as bigint, fee: fee as bigint, total: total as bigint };
}

export async function evmAcceptedTokens(net: Network, chainListingId: string) {
  const c = escrowRead(net);
  const out: { symbol: string; address: string; decimals: number; nightly: bigint }[] = [];
  for (const t of net.tokens) {
    const p = await c.prices(chainListingId, t.address);
    if (p.enabled) out.push({ symbol: t.symbol, address: t.address!, decimals: t.decimals, nightly: p.nightly });
  }
  return out;
}

export async function evmTokenBalance(net: Network, token: string, owner: string): Promise<bigint> {
  if (token === ZERO) return reader(net).getBalance(owner);
  return new Contract(token, erc20Abi, reader(net)).balanceOf(owner);
}

/** Pays the escrow. For ERC20 tokens, requests approval first if needed. Returns the tx hash. */
export async function evmBook(
  net: Network,
  args: { chainListingId: string; token: string; checkIn: number; checkOut: number; total: bigint },
  onStep?: (step: "approve" | "pay" | "confirming") => void
) {
  const signer = await evmSigner(net);
  const owner = await signer.getAddress();
  const escrow = new Contract(net.escrow!, escrowAbi, signer);
  if (args.token !== ZERO) {
    const erc20 = new Contract(args.token, erc20Abi, signer);
    const allowance: bigint = await erc20.allowance(owner, net.escrow);
    if (allowance < args.total) {
      onStep?.("approve");
      await (await erc20.approve(net.escrow, MaxUint256)).wait();
    }
  }
  onStep?.("pay");
  const tx = await escrow.book(args.chainListingId, args.token, args.checkIn, args.checkOut, { value: args.token === ZERO ? args.total : 0n });
  onStep?.("confirming");
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("The payment transaction failed");
  return tx.hash as string;
}

async function send(net: Network, fn: string, ...args: unknown[]) {
  const c = await escrowWrite(net);
  const tx = await c[fn](...args);
  await tx.wait();
  return tx.hash as string;
}

export const evmEscrow = {
  cancelByGuest: (net: Network, id: string) => send(net, "cancelByGuest", id),
  cancelByHost: (net: Network, id: string) => send(net, "cancelByHost", id),
  release: (net: Network, id: string) => send(net, "release", id),
  openDispute: (net: Network, id: string, reason: string) => send(net, "openDispute", id, reason),
  resolveDispute: (net: Network, id: string, bps: number) => send(net, "resolveDispute", id, bps),
  reviewListing: (net: Network, id: string, rating: number, comment: string) => send(net, "reviewListing", id, rating, comment),
  reviewGuest: (net: Network, id: string, rating: number, comment: string) => send(net, "reviewGuest", id, rating, comment),
  withdraw: (net: Network, token: string) => send(net, "withdraw", token),
  setBlockedDays: (net: Network, listingId: string, days: number[], blocked: boolean) => send(net, "setBlockedDays", listingId, days, blocked),
};

export async function evmRefundPreview(net: Network, bookingId: string) {
  return Number(await escrowRead(net).guestRefundBps(bookingId)) / 100;
}

export async function evmBalances(net: Network, owner: string) {
  const c = escrowRead(net);
  const out: { symbol: string; address: string; amount: bigint; formatted: string }[] = [];
  for (const t of net.tokens) {
    const amount: bigint = await c.balances(owner, t.address);
    out.push({ symbol: t.symbol, address: t.address!, amount, formatted: formatUnits(amount, t.decimals) });
  }
  return out;
}

const POLICY_INDEX = { flexible: 0, moderate: 1, strict: 2 } as const;

/** Publishes a listing on-chain and sets its prices. Returns the on-chain listing id. */
export async function evmPublishListing(
  net: Network,
  args: { policy: keyof typeof POLICY_INDEX; minNights: number; maxNights: number; uri: string; prices: { token: string; nightly: bigint; cleaning: bigint }[] },
  onStep?: (msg: string) => void
) {
  const signer = await evmSigner(net);
  const escrow = new Contract(net.escrow!, escrowAbi, signer);
  onStep?.("Creating listing on-chain…");
  const tx = await escrow.createListing(POLICY_INDEX[args.policy], args.minNights, args.maxNights, args.uri);
  const receipt = await tx.wait();
  let listingId: string | null = null;
  for (const log of receipt.logs) {
    try {
      const p = escrowInterface.parseLog(log);
      if (p?.name === "ListingCreated") listingId = p.args.listingId.toString();
    } catch {
      /* other contract */
    }
  }
  if (!listingId) throw new Error("Listing creation event not found");
  for (const p of args.prices) {
    onStep?.("Setting prices…");
    await (await escrow.setPrice(listingId, p.token, p.nightly, p.cleaning, true)).wait();
  }
  return { listingId, txHash: tx.hash as string };
}

export async function evmUpdatePrices(net: Network, listingId: string, prices: { token: string; nightly: bigint; cleaning: bigint; enabled: boolean }[]) {
  const escrow = await escrowWrite(net);
  for (const p of prices) await (await escrow.setPrice(listingId, p.token, p.nightly, p.cleaning, p.enabled)).wait();
}

export async function evmUpdateListing(net: Network, listingId: string, args: { policy: keyof typeof POLICY_INDEX; active: boolean; minNights: number; maxNights: number; uri: string }) {
  return send(net, "updateListing", listingId, POLICY_INDEX[args.policy], args.active, args.minNights, args.maxNights, args.uri);
}

export async function evmFaucet(net: Network) {
  const signer = await evmSigner(net);
  const usdc = new Contract(net.usdc!, erc20Abi, signer);
  await (await usdc.faucet()).wait();
}
