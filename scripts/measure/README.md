# Mainnet measurements

Python 3, standard library only, public mainnet RPC (rate-limited).

- `auth.py`: upgrade authority of each program in `programs.txt`
- `squads.py`: Squads v4 multisig behind each authority (threshold, timelock, members)
- `nonce.py`: durable-nonce accounts controlled by each multisig member
- `drift_hist.py`: page signatures of an account back to a timestamp
- `jlp.py`: the JLP pool, its custodies and their price accounts, dumped for
  the fork test; `--program` also clones the Jupiter Perps executable
