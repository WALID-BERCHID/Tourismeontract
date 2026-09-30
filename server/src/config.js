import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");
export const SERVER_ROOT = path.resolve(__dirname, "..");

const env = process.env;
const isProd = env.NODE_ENV === "production";

if (isProd && !env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}

function readDeployments() {
  const file = env.DEPLOYMENTS_FILE || path.join(ROOT, "web/src/config/deployments.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/** EVM networks the marketplace supports. Contract addresses come from deployments.json. */
export const EVM_NETWORKS = {
  31337: { key: "localhost", name: "Hardhat Local", rpc: env.LOCAL_RPC_URL || "http://127.0.0.1:8545", symbol: "ETH", explorer: "" },
  11155111: { key: "sepolia", name: "Ethereum Sepolia", rpc: env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com", symbol: "ETH", explorer: "https://sepolia.etherscan.io" },
  80002: { key: "amoy", name: "Polygon Amoy", rpc: env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology", symbol: "POL", explorer: "https://amoy.polygonscan.com" },
  84532: { key: "baseSepolia", name: "Base Sepolia", rpc: env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", symbol: "ETH", explorer: "https://sepolia.basescan.org" },
  1: { key: "mainnet", name: "Ethereum", rpc: env.MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com", symbol: "ETH", explorer: "https://etherscan.io" },
  137: { key: "polygon", name: "Polygon", rpc: env.POLYGON_RPC_URL || "https://polygon-rpc.com", symbol: "POL", explorer: "https://polygonscan.com" },
  8453: { key: "base", name: "Base", rpc: env.BASE_RPC_URL || "https://mainnet.base.org", symbol: "ETH", explorer: "https://basescan.org" },
};

export const config = {
  isProd,
  port: Number(env.PORT || 4000),
  appUrl: (env.APP_URL || "http://localhost:5173").replace(/\/$/, ""),
  apiUrl: (env.API_URL || `http://localhost:${env.PORT || 4000}`).replace(/\/$/, ""),
  corsOrigins: (env.CORS_ORIGINS || env.APP_URL || "http://localhost:5173").split(",").map((s) => s.trim()),
  jwtSecret: env.JWT_SECRET || "dev-only-secret-change-me",
  dbFile: env.DATABASE_FILE || path.join(SERVER_ROOT, "data/tourisme.db"),
  uploadDir: env.UPLOAD_DIR || path.join(SERVER_ROOT, "uploads"),
  webDist: env.WEB_DIST || path.join(ROOT, "web/dist"),
  seedDemo: env.SEED_DEMO !== "0",
  platformName: env.PLATFORM_NAME || "Tourisme",
  guestFeeBps: 800,
  hostFeeBps: 300,
  mail: {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === "1" || env.SMTP_PORT === "465",
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.MAIL_FROM || "Tourisme <no-reply@tourisme.app>",
  },
  indexer: {
    enabled: env.INDEXER !== "0",
    intervalMs: Number(env.INDEXER_INTERVAL_MS || 5000),
  },
  solana: {
    rpc: env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    programId: env.SOLANA_PROGRAM_ID || "2Nd2n5ZHj51hS7QbrfWnsbMx329m3WYKMtLxkQ4bE3rb",
    cluster: env.SOLANA_CLUSTER || "devnet",
  },
  eos: {
    rpc: env.EOS_RPC_URL || "https://jungle4.cryptolions.io",
    contract: env.EOS_CONTRACT || "tourismeescr",
    chainId: env.EOS_CHAIN_ID || "73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d",
  },
  get deployments() {
    return readDeployments();
  },
};
