import jwt from "jsonwebtoken";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { verifyMessage, getAddress } from "ethers";
import { config } from "./config.js";
import { get, run } from "./db.js";
import { HttpError, randomToken } from "./util.js";

export function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "30d" });
}

function userFromRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    const { sub } = jwt.verify(token, config.jwtSecret);
    return get(`SELECT * FROM users WHERE id = ?`, sub) || null;
  } catch {
    return null;
  }
}

export function optionalAuth(req, _res, next) {
  req.user = userFromRequest(req);
  next();
}

export function requireAuth(req, _res, next) {
  req.user = userFromRequest(req);
  if (!req.user) return next(new HttpError(401, "Please log in to continue"));
  next();
}

export function requireAdmin(req, _res, next) {
  req.user = userFromRequest(req);
  if (!req.user?.is_admin) return next(new HttpError(403, "Admins only"));
  next();
}

// ---------------------------------------------------------------------------
// Wallet sign-in (Sign-In With Ethereum / Solana style messages)
// ---------------------------------------------------------------------------

export function normalizeAddress(chain, address) {
  if (chain === "evm") {
    try {
      return getAddress(address);
    } catch {
      throw new HttpError(400, "Invalid Ethereum address");
    }
  }
  if (chain === "solana") {
    try {
      if (bs58.decode(address).length !== 32) throw new Error();
      return address;
    } catch {
      throw new HttpError(400, "Invalid Solana address");
    }
  }
  if (chain === "eos") {
    if (!/^[a-z1-5.]{1,12}$/.test(address)) throw new HttpError(400, "Invalid EOS account name");
    return address;
  }
  throw new HttpError(400, "Unsupported chain");
}

export function createNonce(chain, rawAddress) {
  const address = normalizeAddress(chain, rawAddress);
  const nonce = randomToken(16);
  const host = new URL(config.appUrl).host;
  const issuedAt = new Date().toISOString();
  const message =
    `${host} wants you to sign in with your ${chain === "evm" ? "Ethereum" : chain === "solana" ? "Solana" : "EOS"} account:\n` +
    `${address}\n\n` +
    `Sign in to ${config.platformName}. This request will not trigger a blockchain transaction or cost any gas.\n\n` +
    `URI: ${config.appUrl}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
  run(`DELETE FROM auth_nonces WHERE expires_at < ?`, Date.now());
  run(`INSERT INTO auth_nonces (nonce, chain, address, message, expires_at) VALUES (?, ?, ?, ?, ?)`, nonce, chain, address, message, Date.now() + 10 * 60_000);
  return { nonce, message, address };
}

/** Verifies a signed sign-in message and consumes the nonce. Returns the normalized address. */
export function verifyWalletSignature({ chain, address: rawAddress, nonce, signature }) {
  const address = normalizeAddress(chain, rawAddress);
  const row = get(`SELECT * FROM auth_nonces WHERE nonce = ?`, nonce);
  if (!row || row.expires_at < Date.now() || row.chain !== chain || row.address !== address) {
    throw new HttpError(401, "Sign-in request expired, please try again");
  }
  run(`DELETE FROM auth_nonces WHERE nonce = ?`, nonce);

  let ok = false;
  if (chain === "evm") {
    try {
      ok = getAddress(verifyMessage(row.message, signature)) === address;
    } catch {
      ok = false;
    }
  } else if (chain === "solana") {
    try {
      const sig = signature.startsWith("0x") ? Buffer.from(signature.slice(2), "hex") : bs58.decode(signature);
      ok = nacl.sign.detached.verify(new TextEncoder().encode(row.message), sig, bs58.decode(address));
    } catch {
      ok = false;
    }
  } else {
    throw new HttpError(400, "EOS accounts can be linked from your account page but not used to sign in");
  }
  if (!ok) throw new HttpError(401, "Signature verification failed");
  return address;
}
