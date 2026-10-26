import json,urllib.request,base64,struct,time
RPC="https://api.mainnet-beta.solana.com"
SQ="SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf"; SQ3="SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu"
def rpc(m,p):
    for i in range(4):
        try:
            r=urllib.request.Request(RPC,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"Content-Type":"application/json"})
            return json.load(urllib.request.urlopen(r,timeout=30))["result"]
        except Exception as e: time.sleep(2)
B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58(b):
    n=int.from_bytes(b,'big');s=''
    while n: n,r=divmod(n,58); s=B58[r]+s
    return '1'*(len(b)-len(b.lstrip(b'\0')))+s
def ms(addr):
    a=rpc("getAccountInfo",[addr,{"encoding":"base64"}])["value"]; d=base64.b64decode(a["data"][0])
    o=8+32+32; th,tl=struct.unpack_from('<HI',d,o); o+=6+16
    if d[o]==1: o+=33
    else: o+=1
    o+=1; n=struct.unpack_from('<I',d,o)[0]; o+=4
    mem=[b58(d[o+i*33:o+i*33+32]) for i in range(n)]
    return th,tl,mem
out={}
for l in open('programs.txt'):
    if not l.strip(): continue
    name,pid=l.split()
    pd=rpc("getAccountInfo",[pid,{"encoding":"jsonParsed"}])["value"]["data"]["parsed"]["info"]["programData"]
    au=rpc("getAccountInfo",[pd,{"encoding":"jsonParsed"}])["value"]["data"]["parsed"]["info"]["authority"]
    sigs=rpc("getSignaturesForAddress",[au,{"limit":20}]) or []
    found=None
    for s in sigs:
        tx=rpc("getTransaction",[s["signature"],{"encoding":"jsonParsed","maxSupportedTransactionVersion":0}])
        if not tx: continue
        keys=[k["pubkey"] for k in tx["transaction"]["message"]["accountKeys"]]
        for ix in tx["transaction"]["message"]["instructions"]:
            if ix.get("programId") in (SQ,SQ3):
                for acc in ix.get("accounts",[]):
                    ai=rpc("getAccountInfo",[acc,{"encoding":"base64"}])["value"]
                    if ai and ai["owner"]==SQ and len(base64.b64decode(ai["data"][0]))>120:
                        try:
                            th,tl,mem=ms(acc); found=(acc,th,tl,len(mem)); break
                        except Exception: pass
            if found: break
        if found: break
    print(name,"authority",au,"multisig",found, "(threshold, timelock_s, members)" if found else "no squads v4 seen in last 20 tx")
