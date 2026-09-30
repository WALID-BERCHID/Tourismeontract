# Tourisme – Solana program (Anchor)

Booking escrow in SOL: listings with a 1,024-day availability bitmap, per-booking escrow PDAs,
cancellation policies, 24h-after-check-in release, disputes resolved by an arbiter, two-sided reviews.

```bash
cargo test                        # unit tests (refund policy math)
anchor build                      # requires Solana CLI + Anchor 0.31
anchor keys sync                  # writes your program id into lib.rs / Anchor.toml
anchor deploy --provider.cluster devnet
PROGRAM_ID=<id> node scripts/initialize.mjs ~/.config/solana/id.json
```

Then set `SOLANA_ENABLED=1`, `SOLANA_PROGRAM_ID=<id>` and `SOLANA_RPC_URL` for the API server.
Hosts enable Solana payments per listing from **Hosting → Listing → On-chain payments**.
