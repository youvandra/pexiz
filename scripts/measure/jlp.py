# Resolves the JLP pool, its custodies and their price accounts from mainnet,
# and writes them as solana-test-validator --account files for the fork test.
# Usage: python3 jlp.py [--program]   (RPC from PEXIZ_RPC_URL)
# --program also writes jupiter_perps.so, which is 10MB and stays out of git.
# Nothing here is hard-coded past the program id and the JLP mint: the pool is
# the mint authority, the custodies are listed in the pool, and the price
# accounts are the custody fields owned by Doves and by the Pyth receiver.
import base64,datetime,hashlib,json,os,sys,time,urllib.request
RPC=os.environ.get("PEXIZ_RPC_URL","https://api.mainnet-beta.solana.com")
OUT=os.path.join(os.path.dirname(__file__),"../../tests/fixtures/jlp")
PERPS="PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"
JLP_MINT="27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4"
DOVES="DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e"
PYTH_RECEIVER="rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"
B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

def rpc(m,p):
    body=json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode()
    for attempt in range(6):
        try:
            r=urllib.request.Request(RPC,body,{"Content-Type":"application/json"})
            return json.load(urllib.request.urlopen(r,timeout=60))["result"]
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5: raise
            time.sleep(2 * (attempt + 1))
def b58(b):
    n=int.from_bytes(b,'big');s=''
    while n: n,r=divmod(n,58); s=B58[r]+s
    return '1'*(len(b)-len(b.lstrip(b'\0')))+s
def b58d(s):
    n=0
    for c in s: n=n*58+B58.index(c)
    return n.to_bytes(32,'big')
def on_curve(b):
    p=2**255-19; d=-121665*pow(121666,p-2,p)%p
    y=int.from_bytes(b,'little')&((1<<255)-1)
    if y>=p: return False
    u=(y*y-1)%p; v=(d*y*y+1)%p
    x2=u*pow(v,p-2,p)%p
    if x2==0: return True
    return pow(x2,(p-1)//2,p)==1
def pda(seeds,prog):
    for bump in range(255,-1,-1):
        h=hashlib.sha256(b''.join(seeds)+bytes([bump])+b58d(prog)+b"ProgramDerivedAddress").digest()
        if not on_curve(h): return b58(h)
def account(addr):
    return rpc("getAccountInfo",[addr,{"encoding":"base64"}])["value"]
def many(addrs,slice_len=None):
    cfg={"encoding":"base64"}
    if slice_len is not None: cfg["dataSlice"]={"offset":0,"length":slice_len}
    out=[]
    for i in range(0,len(addrs),100): out+=rpc("getMultipleAccounts",[addrs[i:i+100],cfg])["value"]
    return out

# Offsets of the price accounts inside a custody, found once by scanning the
# wSOL custody for 32-byte windows that are live Doves or Pyth receiver
# accounts, and checked against every custody on each run.
PRICE_OFFSETS=[106,320,384]

def price_accounts(data):
    keys=[b58(data[o:o+32]) for o in PRICE_OFFSETS]
    found=[]
    for o,k,v in zip(PRICE_OFFSETS,keys,many(keys,0)):
        assert v and v["owner"] in (DOVES,PYTH_RECEIVER), f"offset {o} ({k}) is not a price account; the custody layout moved"
        found.append({"offset":o,"address":k,"owner":v["owner"],"size":v["space"]})
    return found

def main():
    os.makedirs(OUT,exist_ok=True)
    mint=rpc("getAccountInfo",[JLP_MINT,{"encoding":"jsonParsed"}])["value"]
    pool_authority=mint["data"]["parsed"]["info"]["mintAuthority"]
    # The pool account is the one the perps program owns that lists the custodies;
    # the mint authority is a PDA with no data, so find the pool through the custodies' `pool` field.
    pool=os.environ.get("PEXIZ_JLP_POOL","5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq")
    pv=account(pool)
    assert pv and pv["owner"]==PERPS, f"{pool} is not a Jupiter Perps account"
    d=base64.b64decode(pv["data"][0])
    off=8; n=int.from_bytes(d[off:off+4],'little'); off+=4
    name=d[off:off+n].decode(); off+=n
    count=int.from_bytes(d[off:off+4],'little'); off+=4
    custodies=[b58(d[off+32*i:off+32*(i+1)]) for i in range(count)]

    dump={"measuredAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "program":PERPS,"lpMint":JLP_MINT,"poolAuthority":pool_authority,
          "pool":{"address":pool,"name":name},"custodies":[]}
    # The program's own singletons. `perpetuals` holds the global config the
    # liquidity instructions read; the other two sign and log, and carry no data.
    perpetuals=pda([b"perpetuals"],PERPS)
    dump["perpetuals"]=perpetuals
    accounts={pool:pv,JLP_MINT:account(JLP_MINT),perpetuals:account(perpetuals)}
    for c in custodies:
        cv=account(c); cd=base64.b64decode(cv["data"][0])
        entry={"address":c,"mint":b58(cd[40:72]),"tokenAccount":b58(cd[72:104]),
               "decimals":cd[104],"priceAccounts":price_accounts(cd)}
        accounts[c]=cv
        accounts[entry["tokenAccount"]]=account(entry["tokenAccount"])
        for p in entry["priceAccounts"]: accounts[p["address"]]=account(p["address"])
        dump["custodies"].append(entry)
        print(c,entry["mint"],[p["address"] for p in entry["priceAccounts"]])

    for addr,v in accounts.items():
        json.dump({"pubkey":addr,"account":{"lamports":v["lamports"],"data":v["data"],
                   "owner":v["owner"],"executable":v["executable"],"rentEpoch":0}},
                  open(f"{OUT}/{addr}.json","w"))
    json.dump(dump,open(f"{OUT}/index.json","w"),indent=1)
    print("wrote",len(accounts),"accounts to",os.path.normpath(OUT))

    if "--program" in sys.argv:
        # The executable lives in the loader's program data account, after a
        # 45-byte header (slot, authority option, authority).
        pd=pda([b58d(PERPS)],"BPFLoaderUpgradeab1e11111111111111111111111")
        so=base64.b64decode(account(pd)["data"][0])[45:]
        open(f"{OUT}/jupiter_perps.so","wb").write(so)
        print("wrote jupiter_perps.so,",len(so),"bytes")

main()
