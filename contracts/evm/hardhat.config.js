require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const SOLC_VERSION = "0.8.28";

// Use the solc-js compiler shipped in node_modules instead of downloading a native
// binary. This keeps compilation working on machines/CI without access to
// binaries.soliditylang.org. Set HARDHAT_NATIVE_SOLC=1 to use the default download.
if (!process.env.HARDHAT_NATIVE_SOLC) {
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
    if (args.solcVersion === SOLC_VERSION) {
      return {
        compilerPath: path.join(path.dirname(require.resolve("solc/package.json")), "soljson.js"),
        isSolcJs: true,
        version: args.solcVersion,
        longVersion: require("solc/package.json").version,
      };
    }
    return runSuper();
  });
}

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    version: SOLC_VERSION,
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: false },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    sepolia: { url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org", chainId: 11155111, accounts },
    amoy: { url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology", chainId: 80002, accounts },
    baseSepolia: { url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", chainId: 84532, accounts },
  },
  etherscan: { apiKey: process.env.ETHERSCAN_API_KEY || "" },
};
