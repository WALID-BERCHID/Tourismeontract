/**
 * Deploys TourismeEscrow (+ MockUSDC on test networks) and records the addresses in
 * web/src/config/deployments.json, which both the web app and the API server read.
 *
 * On the local Hardhat network it also publishes the demo listings on-chain (hosted by
 * Hardhat accounts #1-#4) so the marketplace is bookable end-to-end right away.
 *
 * Env:
 *   ARBITER_ADDRESS   dispute arbiter (default: deployer)
 *   TREASURY_ADDRESS  fee recipient (default: deployer)
 *   USDC_ADDRESS      existing stablecoin to whitelist (skips MockUSDC deployment)
 *   SEED_LISTINGS=1   publish demo listings on non-local networks as well
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const ROOT = path.resolve(__dirname, "../../..");
const DEPLOYMENTS_FILE = path.join(ROOT, "web/src/config/deployments.json");
const SEED_FILE = path.join(ROOT, "server/src/seed/listings.json");
const ABI_DIR = path.join(ROOT, "web/src/config/abi");

// Only used to derive native-coin prices for demo listings on local chains.
const DEMO_ETH_USD = 3000;
const POLICY = { flexible: 0, moderate: 1, strict: 2 };

async function main() {
  const { ethers, network } = hre;
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = chainId === 31337;
  console.log(`Deploying to ${network.name} (chainId ${chainId}) from ${deployer.address}`);

  const arbiter = process.env.ARBITER_ADDRESS || deployer.address;
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;

  let usdcAddress = process.env.USDC_ADDRESS;
  if (!usdcAddress) {
    const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
    await usdc.waitForDeployment();
    usdcAddress = await usdc.getAddress();
    console.log(`MockUSDC deployed at ${usdcAddress}`);
  }

  const escrow = await (await ethers.getContractFactory("TourismeEscrow")).deploy(arbiter, treasury);
  const deployTx = escrow.deploymentTransaction();
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  const receipt = await deployTx.wait();
  console.log(`TourismeEscrow deployed at ${escrowAddress}`);

  await (await escrow.setTokenAllowed(usdcAddress, true)).wait();

  const seedListings = {};
  if (isLocal || process.env.SEED_LISTINGS === "1") {
    const listings = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
    const hosts = isLocal ? signers.slice(1, 5) : [deployer];
    const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
    for (let i = 0; i < listings.length; i++) {
      const l = listings[i];
      const host = hosts[l.hostIndex % hosts.length];
      const c = escrow.connect(host);
      const id = (await c.listingCount.staticCall()) + 1n;
      await (await c.createListing(POLICY[l.cancellationPolicy], l.minNights, l.maxNights, `tourisme://listing/${l.slug}`)).wait();
      const nightlyWei = ethers.parseEther((l.priceUsd / DEMO_ETH_USD).toFixed(6));
      const cleaningWei = ethers.parseEther((l.cleaningFeeUsd / DEMO_ETH_USD).toFixed(6));
      await (await c.setPrice(id, ethers.ZeroAddress, nightlyWei, cleaningWei, true)).wait();
      await (await c.setPrice(id, usdcAddress, BigInt(l.priceUsd) * 1_000_000n, BigInt(l.cleaningFeeUsd) * 1_000_000n, true)).wait();
      seedListings[l.slug] = Number(id);
    }
    console.log(`Published ${listings.length} demo listings on-chain`);

    if (isLocal) {
      // Give every local test account some test USDC.
      for (const s of signers.slice(0, 10)) {
        await (await usdc.mint(s.address, 50_000n * 1_000_000n)).wait();
      }
    }
  }

  const all = fs.existsSync(DEPLOYMENTS_FILE) ? JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf8")) : {};
  all.evm = all.evm || {};
  all.evm[chainId] = {
    network: network.name,
    escrow: escrowAddress,
    usdc: usdcAddress,
    mockUsdc: !process.env.USDC_ADDRESS,
    arbiter,
    treasury,
    startBlock: receipt.blockNumber,
    seedListings,
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(DEPLOYMENTS_FILE), { recursive: true });
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(all, null, 2) + "\n");

  fs.mkdirSync(ABI_DIR, { recursive: true });
  for (const name of ["TourismeEscrow", "MockUSDC"]) {
    const artifact = await hre.artifacts.readArtifact(name);
    fs.writeFileSync(path.join(ABI_DIR, `${name}.json`), JSON.stringify(artifact.abi, null, 2) + "\n");
  }
  console.log(`Wrote ${path.relative(ROOT, DEPLOYMENTS_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
