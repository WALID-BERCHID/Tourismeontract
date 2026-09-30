import { EVM_NETWORKS, config } from "../config.js";
import { HttpError } from "../util.js";
import { evmDeployment, explorerTx, readEvmBooking, verifyEvmBooking } from "./evm.js";
import { readSolanaBooking, solanaExplorerTx, verifySolanaBooking } from "./solana.js";
import { eosExplorerTx, readEosBooking, verifyEosBooking } from "./eos.js";

/** Network ids look like "evm:31337", "solana:devnet" or "eos:jungle4". */
export function parseNetwork(network) {
  const [chain, id] = String(network).split(":");
  if (chain === "evm" && EVM_NETWORKS[id]) return { chain, id: Number(id) };
  if (chain === "solana" && id === config.solana.cluster) return { chain, id };
  if (chain === "eos" && id) return { chain, id };
  throw new HttpError(400, `Unsupported network ${network}`);
}

export function networkLabel(network) {
  const { chain, id } = parseNetwork(network);
  if (chain === "evm") return EVM_NETWORKS[id].name;
  if (chain === "solana") return `Solana ${id[0].toUpperCase()}${id.slice(1)}`;
  return id === "jungle4" ? "EOS Jungle Testnet" : `EOS ${id}`;
}

export function explorerUrl(network, txHash) {
  if (!txHash) return null;
  const { chain, id } = parseNetwork(network);
  if (chain === "evm") return explorerTx(id, txHash);
  if (chain === "solana") return solanaExplorerTx(txHash);
  return eosExplorerTx(txHash);
}

/** Networks the web app can offer for payment, with contract addresses. */
export function supportedNetworks() {
  const out = [];
  const evm = config.deployments?.evm || {};
  for (const [chainId, dep] of Object.entries(evm)) {
    const net = EVM_NETWORKS[chainId];
    if (!net) continue;
    out.push({
      id: `evm:${chainId}`,
      chain: "evm",
      chainId: Number(chainId),
      name: net.name,
      rpc: net.rpc,
      nativeSymbol: net.symbol,
      explorer: net.explorer,
      escrow: dep.escrow,
      usdc: dep.usdc,
      testnet: ![1, 137, 8453].includes(Number(chainId)),
      tokens: [
        { symbol: net.symbol, address: "0x0000000000000000000000000000000000000000", decimals: 18 },
        { symbol: "USDC", address: dep.usdc, decimals: 6 },
      ],
    });
  }
  if (process.env.SOLANA_ENABLED === "1") {
    out.push({
      id: `solana:${config.solana.cluster}`,
      chain: "solana",
      name: `Solana ${config.solana.cluster}`,
      rpc: config.solana.rpc,
      programId: config.solana.programId,
      nativeSymbol: "SOL",
      testnet: config.solana.cluster !== "mainnet-beta",
      tokens: [{ symbol: "SOL", decimals: 9 }],
    });
  }
  if (process.env.EOS_ENABLED === "1") {
    out.push({
      id: "eos:jungle4",
      chain: "eos",
      name: "EOS Jungle Testnet",
      rpc: config.eos.rpc,
      chainId: config.eos.chainId,
      contract: config.eos.contract,
      nativeSymbol: "EOS",
      testnet: true,
      tokens: [{ symbol: "EOS", decimals: 4, contract: "eosio.token" }],
    });
  }
  return out;
}

export async function verifyBooking(network, { txHash, guestAddress, chainListingId, checkIn, checkOut }) {
  const { chain, id } = parseNetwork(network);
  if (chain === "evm") {
    if (!evmDeployment(id)) throw new HttpError(400, "Escrow not deployed on this network");
    return verifyEvmBooking(id, txHash);
  }
  if (chain === "solana") return verifySolanaBooking(txHash);
  return verifyEosBooking({ guest: guestAddress, chainListingId, checkIn, checkOut });
}

export async function readBookingStatus(network, chainBookingId) {
  const { chain, id } = parseNetwork(network);
  if (chain === "evm") return readEvmBooking(id, chainBookingId);
  if (chain === "solana") return readSolanaBooking(chainBookingId);
  return readEosBooking(chainBookingId);
}
