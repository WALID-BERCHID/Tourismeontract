import { Contract, Interface, JsonRpcProvider, formatUnits } from "ethers";
import { EVM_NETWORKS, config } from "../config.js";
import { HttpError } from "../util.js";

export const ESCROW_ABI = [
  "event Booked(uint256 indexed bookingId, uint256 indexed listingId, address indexed guest, address token, uint32 checkIn, uint32 checkOut, uint256 total)",
  "event Cancelled(uint256 indexed bookingId, address indexed by, uint256 refund, uint256 hostPayout)",
  "event Released(uint256 indexed bookingId, uint256 hostPayout, uint256 platformFee)",
  "event Disputed(uint256 indexed bookingId, string reason)",
  "event Resolved(uint256 indexed bookingId, uint256 guestRefundBps, uint256 refund, uint256 hostPayout)",
  "event ListingReviewed(uint256 indexed bookingId, uint256 indexed listingId, uint8 rating, string comment)",
  "event ListingCreated(uint256 indexed listingId, address indexed host, uint8 policy, string metadataURI)",
  "function getBooking(uint256) view returns (tuple(uint256 listingId, address guest, address token, uint32 checkIn, uint32 checkOut, uint64 createdAt, uint8 status, bool guestReviewed, bool hostReviewed, uint128 subtotal, uint128 guestFee, uint128 hostFee))",
  "function getListing(uint256) view returns (tuple(address host, uint8 policy, bool active, uint16 minNights, uint16 maxNights, uint32 ratingCount, uint64 ratingSum, string metadataURI))",
  "function calendar(uint256 listingId, uint32 fromDay, uint32 count) view returns (uint8[])",
];
export const escrowInterface = new Interface(ESCROW_ABI);

export const EVM_STATUS = ["none", "confirmed", "cancelled_by_guest", "cancelled_by_host", "completed", "disputed", "resolved"];

const providers = new Map();

export function evmDeployment(chainId) {
  return config.deployments?.evm?.[chainId] || null;
}

export function evmNetwork(chainId) {
  const net = EVM_NETWORKS[chainId];
  if (!net) throw new HttpError(400, `Unsupported EVM network ${chainId}`);
  return net;
}

export function evmProvider(chainId) {
  if (!providers.has(chainId)) {
    const net = evmNetwork(chainId);
    providers.set(chainId, new JsonRpcProvider(net.rpc, Number(chainId), { staticNetwork: true }));
  }
  return providers.get(chainId);
}

export function escrowContract(chainId) {
  const dep = evmDeployment(chainId);
  if (!dep) throw new HttpError(400, `Escrow contract not deployed on chain ${chainId}`);
  return new Contract(dep.escrow, ESCROW_ABI, evmProvider(chainId));
}

export function tokenInfo(chainId, token) {
  const dep = evmDeployment(chainId);
  const net = EVM_NETWORKS[chainId];
  if (!token || /^0x0{40}$/i.test(token)) return { symbol: net?.symbol || "ETH", decimals: 18 };
  if (dep && dep.usdc.toLowerCase() === token.toLowerCase()) return { symbol: "USDC", decimals: 6 };
  return { symbol: "TOKEN", decimals: 18 };
}

export function formatAmount(chainId, token, amount) {
  const { symbol, decimals } = tokenInfo(chainId, token);
  const n = Number(formatUnits(amount, decimals));
  const digits = decimals === 6 ? 2 : n < 1 ? 5 : 4;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits })} ${symbol}`;
}

export function explorerTx(chainId, hash) {
  const net = EVM_NETWORKS[chainId];
  return net?.explorer && hash ? `${net.explorer}/tx/${hash}` : null;
}

/** Validate a booking transaction on-chain and return the escrow data it created. */
export async function verifyEvmBooking(chainId, txHash) {
  const provider = evmProvider(chainId);
  const dep = evmDeployment(chainId);
  if (!dep) throw new HttpError(400, "Escrow not deployed on this network");
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) throw new HttpError(409, "Transaction not found yet – please wait for confirmation");
  if (receipt.status !== 1) throw new HttpError(400, "The payment transaction failed on-chain");
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== dep.escrow.toLowerCase()) continue;
    let parsed;
    try {
      parsed = escrowInterface.parseLog(log);
    } catch {
      continue;
    }
    if (parsed?.name === "Booked") {
      const a = parsed.args;
      return {
        chainBookingId: a.bookingId.toString(),
        chainListingId: a.listingId.toString(),
        guest: a.guest,
        token: a.token,
        checkIn: Number(a.checkIn),
        checkOut: Number(a.checkOut),
        total: a.total,
        amountNative: formatAmount(chainId, a.token, a.total),
        blockNumber: receipt.blockNumber,
      };
    }
  }
  throw new HttpError(400, "No booking found in this transaction");
}

export async function readEvmBooking(chainId, chainBookingId) {
  const b = await escrowContract(chainId).getBooking(chainBookingId);
  return {
    status: EVM_STATUS[Number(b.status)],
    guestReviewed: b.guestReviewed,
    hostReviewed: b.hostReviewed,
    subtotal: b.subtotal,
    hostFee: b.hostFee,
    token: b.token,
  };
}

/** Occupied days (booked or host-blocked) for an on-chain listing. */
export async function readEvmCalendar(chainId, chainListingId, fromDay, count) {
  const out = await escrowContract(chainId).calendar(chainListingId, fromDay, count);
  const days = [];
  out.forEach((v, i) => {
    if (Number(v) !== 0) days.push(fromDay + i);
  });
  return days;
}
