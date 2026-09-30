# Tourisme – EOSIO / Antelope contract

Booking escrow for EOS, Jungle testnet, WAX, Telos and other Antelope chains.

## Build (Antelope CDT ≥ 4.0)

```bash
cdt-cpp -abigen -I include -R ricardian -contract tourisme -o build/tourisme.wasm src/tourisme.cpp
# or
mkdir build && cd build && cmake .. && make
```

## Deploy to Jungle4 testnet

```bash
cleos -u https://jungle4.cryptolions.io set contract <account> build tourisme.wasm tourisme.abi
cleos -u https://jungle4.cryptolions.io set account permission <account> active --add-code
cleos -u https://jungle4.cryptolions.io push action <account> init '["<arbiter>","<treasury>","eosio.token","4,EOS",800,300]' -p <account>
```

## Booking

Guests book by transferring the exact total (see listing price + 8% service fee) with memo:

```
book:<listing_id>:<check_in_day>:<check_out_day>
```

where days are `floor(unix_seconds / 86400)`. The web app builds this transfer for you via WharfKit.
