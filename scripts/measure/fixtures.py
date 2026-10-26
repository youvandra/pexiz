# Dumps mainnet accounts used as oracle test fixtures into tests/fixtures/.
# Usage: python3 fixtures.py [nonce_account]   (RPC from PEXIZ_RPC_URL)
# Tests fall back to synthetic multisigs with the same parameters when the
# files are missing, and say so.
import base64,datetime,hashlib,json,os,sys,urllib.request
RPC=os.environ.get("PEXIZ_RPC_URL","https://api.mainnet-beta.solana.com")
OUT=os.path.join(os.path.dirname(__file__),"../../tests/fixtures")
SQ="SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf"
B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def rpc(m,p):
    r=urllib.request.Request(RPC,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(r,timeout=60))["result"]
def b58d(s):
    n=0
    for c in s: n=n*58+B58.index(c)
    b=n.to_bytes(32,'big'); return b
def b58(b):
    n=int.from_bytes(b,'big');s=''
    while n: n,r=divmod(n,58); s=B58[r]+s
    return '1'*(len(b)-len(b.lstrip(b'\0')))+s
def on_curve(b):
    # ed25519 point decompression check
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
    v=rpc("getAccountInfo",[addr,{"encoding":"base64"}])["value"]
    return {"address":addr,"owner":v["owner"],"lamports":v["lamports"],"data":v["data"][0]}
VENUES={"jupiter":("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu","AxkJ8oH5aDu4ZRWfsujPtxdb6Vhq4gDehpoReBgrUUSm"),
        "drift":("dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH","7qipzLR9j1JcvdxE1XJEFgvoyFmgBpgw5hMdHBMPcJtM")}
os.makedirs(OUT,exist_ok=True)
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
for name,(prog,msig) in VENUES.items():
    pd=pda([b58d(prog)],"BPFLoaderUpgradeab1e11111111111111111111111")
    d=base64.b64decode(rpc("getAccountInfo",[pd,{"encoding":"base64","dataSlice":{"offset":0,"length":45}}])["value"]["data"][0])
    auth=b58(d[13:45]) if d[12]==1 else None
    idx=next((i for i in range(16) if pda([b"multisig",b58d(msig),b"vault",bytes([i])],SQ)==auth),None)
    json.dump({"measuredAt":now,"program":prog,"upgradeAuthority":auth,"vaultIndex":idx,"multisig":account(msig)},open(f"{OUT}/{name}.json","w"),indent=1)
    print(name,"authority",auth,"vault index",idx)
if len(sys.argv)>1:
    json.dump({"measuredAt":now,**account(sys.argv[1])},open(f"{OUT}/nonce.json","w"),indent=1)
    print("nonce",sys.argv[1])
